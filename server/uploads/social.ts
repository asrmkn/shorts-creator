import fs from 'node:fs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------- Instagram Reels (Graph API) ----------------

// v21.0 retires in January 2027; override with IG_GRAPH_VERSION when Meta ships newer versions.
const graph = () => `https://graph.facebook.com/${process.env.IG_GRAPH_VERSION || 'v24.0'}`;
export const instagramConfigured = () => !!(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN && process.env.PUBLIC_BASE_URL);

export interface InstagramProgress {
  containerId?: string;
  onContainer?: (id: string) => void;
}

/**
 * Publishes a Reel. Instagram downloads the video from `videoUrl`, so PUBLIC_BASE_URL must expose this
 * server (e.g. through a tunnel). The Graph API cannot schedule, so the app's job queue runs this at the slot.
 */
export async function uploadToInstagram(videoUrl: string, caption: string, progress: InstagramProgress = {}): Promise<{ id: string; url: string | null }> {
  const userId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!userId || !token || !process.env.PUBLIC_BASE_URL) throw new Error('IG_USER_ID, IG_ACCESS_TOKEN and PUBLIC_BASE_URL must be set in .env');
  const auth = { Authorization: `Bearer ${token}` };

  let containerId = progress.containerId;
  if (!containerId) {
    const limit = await fetch(`${graph()}/${userId}/content_publishing_limit?fields=quota_usage,config`, { headers: auth }).then((r) => r.json()).catch(() => null);
    const usage = limit?.data?.[0];
    if (usage && usage.config?.quota_total && usage.quota_usage >= usage.config.quota_total) throw new Error('Instagram daily publishing limit reached; try again in 24 hours.');

    const create = await fetch(`${graph()}/${userId}/media`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ media_type: 'REELS', video_url: videoUrl, caption, share_to_feed: true }),
    });
    const container = await create.json();
    if (!create.ok) throw new Error(`Instagram container error: ${JSON.stringify(container.error ?? container)}`);
    containerId = container.id as string;
    progress.onContainer?.(containerId);
  }

  let status = '';
  for (let i = 0; i < 60 && status !== 'FINISHED' && status !== 'PUBLISHED'; i++) {
    const res = await fetch(`${graph()}/${containerId}?fields=status_code`, { headers: auth });
    status = (await res.json()).status_code ?? '';
    if (status === 'ERROR' || status === 'EXPIRED') throw new Error(`Instagram could not process the video (${status}). Check it is H.264/AAC, 9:16 and under 300 MB.`);
    if (status !== 'FINISHED' && status !== 'PUBLISHED') await sleep(5000);
  }
  if (status === 'PUBLISHED') return { id: containerId, url: null };
  if (status !== 'FINISHED') throw new Error('Instagram was still processing after 5 minutes (will retry).');

  const publish = await fetch(`${graph()}/${userId}/media_publish`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId }),
  });
  const data = await publish.json();
  if (!publish.ok) throw new Error(`Instagram publish error: ${JSON.stringify(data.error ?? data)}`);
  return { id: data.id, url: null };
}
// ---------------- TikTok (Content Posting API) ----------------

const TIKTOK = 'https://open.tiktokapis.com/v2/post/publish';
const TIKTOK_CHUNK = 10 * 1024 * 1024;

/**
 * TikTok is blocked in India and unaudited apps can only post privately, so it is off unless
 * TIKTOK_ENABLED=1 is set by an operator in a permitted country.
 */
export const tiktokEnabled = () => process.env.TIKTOK_ENABLED === '1';
export const tiktokConfigured = () => tiktokEnabled() && !!process.env.TIKTOK_ACCESS_TOKEN;

async function tiktokPost(path: string, token: string, body: unknown): Promise<any> {
  const res = await fetch(`${TIKTOK}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.error?.code !== 'ok') throw new Error(`TikTok ${path} error: ${JSON.stringify(data.error ?? data)}`);
  return data.data;
}

async function pollTikTok(token: string, publishId: string): Promise<{ id: string; url: string | null }> {
  for (let i = 0; i < 36; i++) {
    const s = await tiktokPost('/status/fetch/', token, { publish_id: publishId });
    if (s.status === 'PUBLISH_COMPLETE') return { id: publishId, url: null };
    if (s.status === 'FAILED') throw new Error(`TikTok publish failed: ${s.fail_reason ?? 'unknown reason'}`);
    await sleep(5000);
  }
  throw new Error('TikTok was still processing after 3 minutes (will check again).');
}

export interface TikTokProgress {
  /** publish_id from an earlier attempt: only poll its status, never create a second post. */
  publishId?: string;
  onInit?: (publishId: string) => void;
}

export async function uploadToTikTok(filePath: string, title: string, progress: TikTokProgress = {}): Promise<{ id: string; url: string | null }> {
  if (!tiktokEnabled()) throw new Error('TikTok publishing is disabled (TIKTOK_ENABLED is not 1).');
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) throw new Error('TIKTOK_ACCESS_TOKEN must be set in .env');
  if (progress.publishId) return pollTikTok(token, progress.publishId);

  // Required before every post: the privacy level must be one of the creator's allowed options.
  const creator = await tiktokPost('/creator_info/query/', token, {});
  const options: string[] = creator.privacy_level_options ?? [];
  const wanted = process.env.TIKTOK_PRIVACY || 'SELF_ONLY';
  // Never fall back to a more public level than the operator chose.
  if (!options.includes(wanted)) throw new Error(`TikTok does not allow privacy level ${wanted} for this account (allowed: ${options.join(', ') || 'none'}).`);

  const size = fs.statSync(filePath).size;
  // Files up to 64 MB go in one chunk; larger files use 10 MB chunks and the last chunk absorbs the remainder.
  const chunkSize = size <= 64 * 1024 * 1024 ? size : TIKTOK_CHUNK;
  const chunks = Math.floor(size / chunkSize);
  const init = await tiktokPost('/video/init/', token, {
    post_info: { title: title.slice(0, 2200), privacy_level: wanted, is_aigc: true, disable_comment: false },
    source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: chunks },
  });
  progress.onInit?.(init.publish_id);

  const fd = fs.openSync(filePath, 'r');
  try {
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = i === chunks - 1 ? size - 1 : start + chunkSize - 1;
      const buf = new Uint8Array(end - start + 1);
      fs.readSync(fd, buf, 0, buf.length, start);
      const put = await fetch(init.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buf.length), 'Content-Range': `bytes ${start}-${end}/${size}` },
        body: buf,
      });
      // The upload URL can't be reused after a failed chunk, so this is a permanent failure for this post.
      if (!put.ok) throw new Error(`TikTok chunk ${i + 1}/${chunks} upload rejected (${put.status}): ${(await put.text()).slice(0, 300)}`);
    }
  } finally {
    fs.closeSync(fd);
  }
  return pollTikTok(token, init.publish_id);
}