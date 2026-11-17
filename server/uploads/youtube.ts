import fs from 'node:fs';
import type { Store } from '../db';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/youtube/v3';
// force-ssl covers uploads, playlists and comments.
const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
const CHUNK = 8 * 1024 * 1024; // must be a multiple of 256 KiB
const RETRYABLE = new Set([500, 502, 503, 504]);

interface Tokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
}

const serverUrl = () => process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5174}`;
export const redirectUri = () => `${serverUrl()}/api/auth/youtube/callback`;

function credentials() {
  const id = process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!id || !secret) throw new Error('YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are not set in .env');
  return { id, secret };
}

export const youtubeConfigured = () => !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
export function youtubeConnected(store: Store): boolean {
  const raw = store.getSecret('youtube');
  if (!raw) return false;
  const t: Tokens = JSON.parse(raw);
  // Tokens from the earlier upload-only scope can't manage playlists or comments; ask the user to reconnect.
  return !!t.scope?.includes('youtube.force-ssl');
}

export function authUrl(state: string): string {
  const { id } = credentials();
  const params = new URLSearchParams({ client_id: id, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state });
  return `${AUTH_URL}?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<any> {
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google token error (${res.status}): ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

export async function exchangeCode(store: Store, code: string) {
  const { id, secret } = credentials();
  const data = await tokenRequest({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
  const tokens: Tokens = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000, scope: data.scope };
  store.setSecret('youtube', JSON.stringify(tokens));
}

async function accessToken(store: Store): Promise<string> {
  const raw = store.getSecret('youtube');
  if (!raw) throw new Error('YouTube is not connected. Connect it in Settings.');
  const tokens: Tokens = JSON.parse(raw);
  if (tokens.expires_at - 60_000 > Date.now()) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error('YouTube session expired. Reconnect in Settings.');
  const { id, secret } = credentials();
  const data = await tokenRequest({ refresh_token: tokens.refresh_token, client_id: id, client_secret: secret, grant_type: 'refresh_token' });
  const next: Tokens = { ...tokens, access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 };
  store.setSecret('youtube', JSON.stringify(next));
  return next.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!(err instanceof RetryableError)) throw err;
      await sleep(Math.min(30_000, 1000 * 2 ** attempt + Math.random() * 500));
    }
  }
  throw new Error(`${label} failed after retries: ${(last as Error).message}`);
}

class RetryableError extends Error {}

/** `retry` must stay false for non-idempotent POSTs: a retried insert can create a duplicate playlist item or comment. */
async function api(token: string, method: string, url: string, body?: unknown, retry = method === 'GET'): Promise<any> {
  const once = async () => {
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (retry && RETRYABLE.has(res.status)) throw new RetryableError(`${res.status}`);
    if (!res.ok) throw new Error(`YouTube API ${res.status}: ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : {};
  };
  return retry ? withRetry(once, `${method} ${url}`) : once();
}

export interface YouTubeUploadInput {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  /** ISO time; the video is uploaded private and YouTube publishes it then. */
  publishAt?: string;
  localizations?: Record<string, { title: string; description: string }>;
  /** Upload session saved by an earlier, interrupted attempt. */
  resumeUrl?: string;
  /** Called with the session URL as soon as it exists, so it can be saved for crash recovery. */
  onSession?: (url: string) => void;
}

export interface YouTubeUploadResult {
  id: string;
  url: string;
  channelId: string;
}

function readChunk(fd: number, start: number, length: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(length);
  fs.readSync(fd, buf, 0, length, start);
  return buf;
}

const done = (data: any): YouTubeUploadResult => ({ id: data.id, url: `https://youtube.com/shorts/${data.id}`, channelId: data.snippet?.channelId ?? '' });

/** Asks the session how many bytes it already has: returns the next offset, or the finished video. */
export async function probeSession(store: Store, location: string, size: number): Promise<{ offset: number } | { result: YouTubeUploadResult } | null> {
  const res = await fetch(location, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${await accessToken(store)}`, 'Content-Length': '0', 'Content-Range': `bytes */${size}` },
  }).catch(() => null);
  if (!res) return null;
  if (res.status === 200 || res.status === 201) return { result: done(await res.json()) };
  if (res.status === 308) {
    const range = res.headers.get('range');
    return { offset: range ? Number(range.split('-')[1]) + 1 : 0 };
  }
  return null; // expired or unknown session
}

/** Resumable upload in 8 MB chunks, resuming from the server's confirmed offset after network or 5xx errors. */
export async function uploadToYouTube(store: Store, input: YouTubeUploadInput): Promise<YouTubeUploadResult> {
  const size = fs.statSync(input.filePath).size;
  let location = '';
  let offset = 0;
  if (input.resumeUrl) {
    const probe = await probeSession(store, input.resumeUrl, size);
    if (probe && 'result' in probe) return probe.result;
    if (probe) {
      location = input.resumeUrl;
      offset = probe.offset;
    }
  }

  if (!location) {
    const token = await accessToken(store);
    const localizations = input.localizations && Object.keys(input.localizations).length ? input.localizations : undefined;
    const metadata = {
      snippet: {
        title: input.title,
        description: input.description,
        tags: input.tags.map((t) => t.replace(/^#/, '')),
        categoryId: '2', // Autos & Vehicles
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en',
      },
      status: {
        privacyStatus: input.publishAt ? 'private' : 'public',
        ...(input.publishAt ? { publishAt: input.publishAt } : {}),
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
      },
      ...(localizations ? { localizations } : {}),
    };
    const parts = `snippet,status${localizations ? ',localizations' : ''}`;
    location = await withRetry(async () => {
      const init = await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=${parts}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': String(size),
        },
        body: JSON.stringify(metadata),
      });
      if (RETRYABLE.has(init.status)) throw new RetryableError(String(init.status));
      if (!init.ok) throw new Error(`YouTube upload init failed (${init.status}): ${(await init.text()).slice(0, 400)}`);
      const loc = init.headers.get('location');
      if (!loc) throw new Error('YouTube did not return an upload URL');
      return loc;
    }, 'YouTube upload init');
    input.onSession?.(location);
  }

  const fd = fs.openSync(input.filePath, 'r');
  try {
    let failures = 0;
    for (;;) {
      try {
        const end = Math.min(offset + CHUNK, size) - 1;
        const res = await fetch(location, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${await accessToken(store)}`,
            'Content-Length': String(end - offset + 1),
            'Content-Range': `bytes ${offset}-${end}/${size}`,
          },
          body: readChunk(fd, offset, end - offset + 1),
        });
        if (res.status === 200 || res.status === 201) return done(await res.json());
        if (res.status === 308) {
          const range = res.headers.get('range');
          offset = range ? Number(range.split('-')[1]) + 1 : 0;
          failures = 0;
          continue;
        }
        if (!RETRYABLE.has(res.status)) throw new Error(`YouTube upload failed (${res.status}): ${(await res.text()).slice(0, 400)}`);
        throw new RetryableError(String(res.status));
      } catch (err) {
        if (err instanceof Error && !(err instanceof RetryableError) && err.message.startsWith('YouTube upload failed')) throw err;
        if (++failures > 5) throw new Error(`YouTube upload kept failing: ${(err as Error).message}`);
        await sleep(1000 * 2 ** failures);
        const probe = await probeSession(store, location, size);
        if (probe && 'result' in probe) return probe.result;
        offset = probe ? probe.offset : offset;
      }
    }
  } finally {
    fs.closeSync(fd);
  }
}

/** Adds the video to a playlist named after the series, creating the playlist the first time. */
export async function addToSeriesPlaylist(store: Store, videoId: string, series: string): Promise<string> {
  const token = await accessToken(store);
  let playlistId = store.getSecret(`playlist:${series}`);
  if (!playlistId) {
    const created = await api(token, 'POST', `${API}/playlists?part=snippet,status`, {
      snippet: { title: series, description: `The ${series} stunt saga. AI-generated fiction; never try these stunts.`, defaultLanguage: 'en' },
      status: { privacyStatus: 'public' },
    });
    playlistId = created.id as string;
    store.setSecret(`playlist:${series}`, playlistId);
  }
  await api(token, 'POST', `${API}/playlistItems?part=snippet`, { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } } });
  return playlistId;
}

/** Posts the cliffhanger comment (channelId is required). Pinning is not available in the API, so pin it in YouTube Studio. */
export async function postComment(store: Store, videoId: string, channelId: string, text: string): Promise<void> {
  const token = await accessToken(store);
  await api(token, 'POST', `${API}/commentThreads?part=snippet`, { snippet: { channelId, videoId, topLevelComment: { snippet: { textOriginal: text } } } });
}