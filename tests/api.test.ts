import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { Store } from '../server/db';
import { createApp } from '../server/app';
import { Publisher } from '../server/publisher';
import { makeMp4 } from './mp4';

let server: Server;
let store: Store;
let base = '';
const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stuntshorts-'));
// The publisher is driven manually so queued jobs stay inspectable.
const idlePublisher = { tick: async () => {} } as unknown as Publisher;
const realFetch = globalThis.fetch;

const call = async (method: string, url: string, body?: unknown) => {
  const res = await realFetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text && res.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
};

const publish = async (date: string, opts: { platforms?: string[]; schedule?: string; force?: boolean; overrideWarnings?: boolean; content?: string; video?: Buffer } = {}) => {
  const fd = new FormData();
  const video = opts.video ?? makeMp4({ payload: opts.content ?? `video-${date}` });
  fd.append('video', new Blob([new Uint8Array(video)], { type: 'video/mp4' }), 'clip.mp4');
  fd.append('platforms', JSON.stringify(opts.platforms ?? ['youtube']));
  fd.append('schedule', opts.schedule ?? 'now');
  fd.append('force', String(!!opts.force));
  fd.append('overrideWarnings', String(!!opts.overrideWarnings));
  const res = await realFetch(`${base}/api/days/${date}/publish`, { method: 'POST', body: fd });
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  process.env.LLM_PROVIDER = 'mock';
  store = new Store(':memory:');
  const { app } = createApp(store, { mediaDir, publisher: idlePublisher });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

beforeEach(() => {
  delete process.env.ALLOW_MOCK_PUBLISH;
  delete process.env.TIKTOK_ENABLED;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(() => {
  server?.close();
  fs.rmSync(mediaDir, { recursive: true, force: true });
});

describe('planning flow (mock AI)', () => {
  it('refuses to plan a month without a cast', async () => {
    const res = await call('POST', '/api/months/2026-12/generate');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/character/i);
  });

  it('creates cast & scenes, plans a month, generates valid packs, respects locks and exports', async () => {
    expect((await call('POST', '/api/characters/generate', { count: 4 })).body).toHaveLength(4);
    await call('POST', '/api/characters/generate', { count: 3 });
    const names = (await call('GET', '/api/characters')).body.map((c: { name: string }) => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect((await call('POST', '/api/scenes/generate', { count: 12 })).body).toHaveLength(12);

    const month = await call('POST', '/api/months/2026-12/generate');
    expect(month.body.days).toHaveLength(31);
    await call('PUT', '/api/days/2026-12-01', { locked: true, concept: 'My custom stunt' });

    const packs = await call('POST', '/api/months/2026-12/generate-packs');
    expect(packs.body.errors).toEqual([]);
    expect(packs.body.days.filter((d: { pack?: unknown }) => d.pack)).toHaveLength(30);

    const detail = await call('GET', '/api/days/2026-12-25');
    expect(detail.body.issues).toEqual([]);
    expect(detail.body.flow.clips).toHaveLength(4);
    expect(detail.body.schedule.publishAt).toBe('2026-12-25T20:00:00.000Z');

    await call('PUT', '/api/settings', { characterMode: 'ingredients' });
    expect((await call('GET', '/api/days/2026-12-25')).body.flow.clips[0].text).toMatch(/@\w+ in /);
    await call('PUT', '/api/settings', { characterMode: 'text' });
    expect((await call('PUT', '/api/settings', { publishSlotUtc: '29:75' })).status).toBe(400);

    const csv = await call('GET', '/api/months/2026-12/export.csv');
    expect(csv.body.split('\r\n')).toHaveLength(32);
    const pdf = await realFetch(`${base}/api/months/2026-12/export.pdf`);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');

    const replanned = await call('POST', '/api/months/2026-12/generate');
    expect(replanned.body.days[0].concept).toBe('My custom stunt');
  });

  it('drops packs saved in an older format so they get regenerated', () => {
    const day = store.getDay('2026-12-02')!;
    store.db.prepare('UPDATE days SET data = ? WHERE date = ?').run(JSON.stringify({ ...day, pack: { hook: 'old', clips: [] } }), day.date);
    expect(store.getDay('2026-12-02')!.pack).toBeUndefined();
  });
});

describe('publishing guards', () => {
  beforeAll(async () => {
    await call('POST', '/api/months/2026-12/generate-packs');
  });

  it('blocks demo-template packs unless explicitly allowed', async () => {
    const res = await publish('2026-12-03');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/generic templates/);
  });

  it('checks the video file is a valid vertical Short', async () => {
    process.env.ALLOW_MOCK_PUBLISH = '1';
    expect((await publish('2026-12-03', { video: Buffer.from('not a video') })).body.error).toMatch(/Could not read the video/);
    expect((await publish('2026-12-03', { video: makeMp4({ width: 1920, height: 1080 }) })).body.error).toMatch(/landscape/);
    const slow = await publish('2026-12-03', { video: makeMp4({ faststart: false, payload: 'slow' }) });
    expect(slow.status).toBe(202);
    expect(slow.body.warnings.join(' ')).toMatch(/faststart/);
  });

  it('never publishes imitation wording, and needs an explicit override for brand warnings', async () => {
    process.env.ALLOW_MOCK_PUBLISH = '1';
    const day = store.getDay('2026-12-09')!;
    await call('PUT', '/api/days/2026-12-09', { pack: { ...day.pack, metadata: { ...day.pack!.metadata, title: 'Would you try this?' } } });
    const res = await publish('2026-12-09', { content: 'imitation' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('pack-issues');
    expect((await publish('2026-12-09', { content: 'imitation', force: true, overrideWarnings: true })).status).toBe(409);

    const branded = store.getDay('2026-12-10')!;
    const clips = branded.pack!.clips.map((c, i) => (i === 1 ? { ...c, sfx: `${c.sfx}, a GoPro chirp` } : c));
    await call('PUT', '/api/days/2026-12-10', { pack: { ...branded.pack, clips } });
    const warn = await publish('2026-12-10', { content: 'brand' });
    expect(warn.status).toBe(409);
    expect(warn.body.code).toBe('pack-warnings');
    expect((await publish('2026-12-10', { content: 'brand', force: true })).status).toBe(409);
    expect((await publish('2026-12-10', { content: 'brand', overrideWarnings: true })).status).toBe(202);
  });

  it('queues one upload per platform and refuses duplicates and reused files', async () => {
    process.env.ALLOW_MOCK_PUBLISH = '1';
    const first = await publish('2026-12-04', { content: 'unique-a' });
    expect(first.status).toBe(202);
    expect(first.body.uploads[0]).toMatchObject({ platform: 'youtube', status: 'queued' });

    const again = await publish('2026-12-04', { content: 'unique-b' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('duplicate');
    expect((await publish('2026-12-04', { content: 'unique-b', force: true })).status).toBe(202);

    const reused = await publish('2026-12-05', { content: 'unique-a' });
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe('duplicate-file');
  });

  it('rejects a slot that has already passed and TikTok while disabled', async () => {
    process.env.ALLOW_MOCK_PUBLISH = '1';
    await call('POST', '/api/months/2026-11/generate');
    await call('POST', '/api/days/2026-11-01/generate');
    const past = await publish('2026-11-01', { schedule: 'slot', content: 'past' });
    expect(past.status).toBe(409);
    expect(past.body.code).toBe('slot-passed');
    const future = await publish('2026-12-06', { schedule: 'slot', content: 'future' });
    expect(future.status).toBe(202);
    expect(future.body.publishAt).toBe('2026-12-06T20:00:00.000Z');
    const tiktok = await publish('2026-12-08', { platforms: ['tiktok'], content: 'tt' });
    expect(tiktok.status).toBe(400);
    expect(tiktok.body.error).toMatch(/TikTok/);
  });

  it('serves media to Instagram only while the job is pending and within 24 h of its run time', async () => {
    process.env.ALLOW_MOCK_PUBLISH = '1';
    const res = await publish('2026-12-07', { platforms: ['instagram'], schedule: 'slot', content: 'ig' });
    expect(res.status).toBe(202);
    const job = store.activeUploads('2026-12-07', 'instagram')[0];
    expect(job.runAt).toBe('2026-12-07T20:00:00.000Z');
    expect((await realFetch(`${base}/media/${job.mediaToken}`)).status).toBe(200);
    expect((await realFetch(`${base}/media/not-a-token`)).status).toBe(404);
    store.updateUpload(job.id, { status: 'success' });
    expect((await realFetch(`${base}/media/${job.mediaToken}`)).status).toBe(404);
  });
});

describe('background publisher', () => {
  const connectYouTube = () =>
    store.setSecret('youtube', JSON.stringify({ access_token: 'tok', refresh_token: 'r', expires_at: Date.now() + 3600_000, scope: 'https://www.googleapis.com/auth/youtube.force-ssl' }));

  it('uploads in chunks, adds the playlist and posts the comment with channelId after going live', async () => {
    connectYouTube();
    const date = '2026-12-06';
    const job = store.activeUploads(date, 'youtube')[0];
    const calls: Array<{ method: string; url: string; body?: string; headers: Record<string, string> }> = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}));
      calls.push({ method: init?.method ?? 'GET', url, body: typeof init?.body === 'string' ? init.body : undefined, headers });
      if (url.includes('/upload/youtube/v3/videos')) return new Response('', { status: 200, headers: { location: 'https://upload.example/session1' } });
      if (url === 'https://upload.example/session1') return Response.json({ id: 'vid1', snippet: { channelId: 'chan1' } });
      if (url.includes('/playlists?')) return Response.json({ id: 'pl1' });
      if (url.includes('/playlistItems?')) return Response.json({ id: 'pli1' });
      if (url.includes('/commentThreads?')) return Response.json({ id: 'ct1' });
      return new Response('not found', { status: 404 });
    }) as typeof fetch;

    const publisher = new Publisher(store);
    await publisher.tick(new Date('2026-12-06T10:00:00Z'));
    const done = store.getUpload(job.id)!;
    expect(done.status).toBe('scheduled');
    expect(done.url).toBe('https://youtube.com/shorts/vid1');
    expect(done.payload).toMatchObject({ uploadUrl: 'https://upload.example/session1', videoId: 'vid1', channelId: 'chan1', commentQueued: true });
    const init = calls.filter((c) => c.url.includes('/upload/youtube/v3/videos')).map((c) => JSON.parse(c.body!)).find((b) => b.status.publishAt)!;
    expect(init.status).toMatchObject({ privacyStatus: 'private', publishAt: '2026-12-06T20:00:00.000Z', containsSyntheticMedia: true, selfDeclaredMadeForKids: false });
    expect(calls.find((c) => c.url === 'https://upload.example/session1')!.headers.Authorization).toBe('Bearer tok');
    expect(store.getDay(date)!.status).toBe('uploaded');

    // The comment waits until 10 minutes after the video goes public.
    const commentJob = store.listUploads(date).find((u) => u.platform === 'youtube' && u.id !== job.id)!;
    expect(commentJob.runAt).toBe('2026-12-06T20:10:00.000Z');
    await publisher.tick(new Date('2026-12-06T20:05:00Z'));
    expect(store.getUpload(commentJob.id)!.status).toBe('queued');
    await publisher.tick(new Date('2026-12-06T20:11:00Z'));
    expect(store.getUpload(commentJob.id)!.status).toBe('success');
    const comment = JSON.parse(calls.find((c) => c.url.includes('/commentThreads?'))!.body!);
    expect(comment.snippet).toMatchObject({ channelId: 'chan1', videoId: 'vid1' });
  });

  it('retries transient failures and refuses to publish a missed slot', async () => {
    connectYouTube();
    const late = store.addUpload({ date: '2026-12-10', platform: 'youtube', status: 'queued', runAt: '2026-12-10T00:00:00.000Z', publishAt: '2026-12-10T20:00:00.000Z', filePath: path.join(mediaDir, 'x.mp4'), payload: { title: 't', description: 'd' } });
    fs.writeFileSync(path.join(mediaDir, 'x.mp4'), makeMp4());
    const flaky = store.addUpload({ date: '2026-12-11', platform: 'instagram', status: 'queued', runAt: '2026-12-10T00:00:00.000Z', filePath: path.join(mediaDir, 'x.mp4'), mediaToken: 'tok-ig', payload: { caption: 'c' } });
    process.env.IG_USER_ID = '1';
    process.env.IG_ACCESS_TOKEN = 't';
    process.env.PUBLIC_BASE_URL = 'https://example.test';
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    await new Publisher(store).tick(new Date('2026-12-10T19:55:00Z'));
    expect(store.getUpload(late)!).toMatchObject({ status: 'error' });
    expect(store.getUpload(late)!.error).toMatch(/slot passed/);
    const retry = store.getUpload(flaky)!;
    expect(retry.status).toBe('queued');
    expect(retry.attempts).toBe(1);
    expect(retry.error).toMatch(/retrying/);
    expect(new Date(retry.runAt!).getTime()).toBeGreaterThan(new Date('2026-12-10T19:55:00Z').getTime());
    delete process.env.IG_USER_ID;
    delete process.env.IG_ACCESS_TOKEN;
    delete process.env.PUBLIC_BASE_URL;
  });

  it('recovers an upload that finished before a crash instead of failing it after the slot', async () => {
    connectYouTube();
    fs.writeFileSync(path.join(mediaDir, 'y.mp4'), makeMp4());
    const id = store.addUpload({
      date: '2026-12-12',
      platform: 'youtube',
      status: 'queued',
      runAt: '2026-12-12T00:00:00.000Z',
      publishAt: '2026-12-12T20:00:00.000Z',
      filePath: path.join(mediaDir, 'y.mp4'),
      payload: { title: 't', description: 'd', uploadUrl: 'https://upload.example/done' },
    });
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      if (String(input) === 'https://upload.example/done') return Response.json({ id: 'vid9', snippet: { channelId: 'chan9' } });
      return new Response('', { status: 404 });
    }) as typeof fetch;
    await new Publisher(store).tick(new Date('2026-12-12T21:00:00Z'));
    expect(store.getUpload(id)!).toMatchObject({ status: 'scheduled', externalId: 'vid9' });
    expect(urls.some((u) => u.includes('/upload/youtube/v3/videos'))).toBe(false);
  });

  it('only polls TikTok on a retry instead of creating a second post', async () => {
    process.env.TIKTOK_ENABLED = '1';
    process.env.TIKTOK_ACCESS_TOKEN = 't';
    const { uploadToTikTok } = await import('../server/uploads/social');
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      urls.push(String(input));
      return Response.json({ error: { code: 'ok' }, data: { status: 'PUBLISH_COMPLETE' } });
    }) as typeof fetch;
    const out = await uploadToTikTok(path.join(mediaDir, 'y.mp4'), 'caption', { publishId: 'pub1' });
    expect(out.id).toBe('pub1');
    expect(urls.every((u) => u.includes('/status/fetch/'))).toBe(true);
    delete process.env.TIKTOK_ACCESS_TOKEN;
  });
});
