import fs from 'node:fs';
import type { Store, UploadJob } from './db';
import { addToSeriesPlaylist, postComment, probeSession, uploadToYouTube } from './uploads/youtube';
import { uploadToInstagram, uploadToTikTok } from './uploads/social';

const MAX_ATTEMPTS = 5;
const LATE_SLOT_MS = 15 * 60_000;
/** Network hiccups, 5xx, processing delays and "not ready yet" responses are worth retrying. */
const TRANSIENT = /fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket|\b50[0-4]\b|still processing|processingFailure|videoNotFound|kept failing|after retries|rateLimitExceeded|rate limit|quota exceeded for quota metric 'Queries per minute'/i;

export class PermanentError extends Error {}

/**
 * Background publisher: uploads run as queued jobs so the HTTP request returns at once, Instagram and TikTok
 * (which have no API scheduling) are published at the global slot, transient failures are retried with
 * backoff, and progress is saved so a restart resumes instead of posting twice.
 */
export class Publisher {
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private store: Store, private intervalMs = 30_000) {}

  start() {
    this.store.requeueInterrupted();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      for (const job of this.store.dueJobs(now.toISOString())) await this.run(job, now);
      this.cleanupMedia();
    } finally {
      this.running = false;
    }
  }

  private cleanupMedia() {
    for (const file of this.store.staleMediaFiles(7)) {
      fs.rmSync(file, { force: true });
      this.store.clearFilePath(file);
    }
  }

  private async run(job: UploadJob, now: Date) {
    const { store } = this;
    const attempts = job.attempts + 1;
    store.updateUpload(job.id, { status: 'processing', error: null, attempts });
    const p = job.payload as Record<string, any>;
    try {
      if (job.platform === 'youtube' && p.kind === 'comment') {
        await postComment(store, p.videoId, p.channelId, p.text);
        store.updateUpload(job.id, { status: 'success', url: p.url ?? null });
        return;
      }
      if (!job.filePath || !fs.existsSync(job.filePath)) throw new PermanentError('The video file for this job is missing.');

      if (job.platform === 'youtube') {
        let video = p.videoId ? { id: p.videoId as string, url: p.url as string, channelId: p.channelId as string } : null;
        // An earlier attempt may have finished uploading before the crash; check its session before anything else.
        if (!video && p.uploadUrl) {
          const probe = await probeSession(store, p.uploadUrl, fs.statSync(job.filePath).size);
          if (probe && 'result' in probe) {
            video = probe.result;
            store.updatePayload(job.id, { videoId: video.id, url: video.url, channelId: video.channelId });
          }
        }
        // A late run (after downtime or retries) must not send a past publishAt: YouTube would publish immediately.
        if (!video && job.publishAt && new Date(job.publishAt).getTime() < now.getTime() + LATE_SLOT_MS)
          throw new PermanentError('The scheduled slot passed before the upload could start. Upload again with "Publish now" or for a later day.');
        if (!video) {
          video = await uploadToYouTube(store, {
            filePath: job.filePath,
            title: p.title,
            description: p.description,
            tags: p.tags ?? [],
            publishAt: job.publishAt ?? undefined,
            localizations: p.localizations,
            resumeUrl: p.uploadUrl,
            onSession: (url) => store.updatePayload(job.id, { uploadUrl: url }),
          });
          store.updatePayload(job.id, { videoId: video.id, url: video.url, channelId: video.channelId });
        }
        const warnings: string[] = [];
        if (p.series && !p.playlistDone) {
          await addToSeriesPlaylist(store, video.id, p.series)
            .then(() => store.updatePayload(job.id, { playlistDone: true }))
            .catch((e) => warnings.push(`playlist: ${(e as Error).message}`));
        }
        if (p.pinnedComment && !p.commentQueued) {
          // Comments can't be posted on a private video, so post shortly after it goes public.
          const at = job.publishAt ? new Date(new Date(job.publishAt).getTime() + 10 * 60_000) : new Date(now.getTime() + 2 * 60_000);
          store.addUpload({ date: job.date, platform: 'youtube', status: 'queued', runAt: at.toISOString(), payload: { kind: 'comment', videoId: video.id, channelId: video.channelId, text: p.pinnedComment, url: video.url } });
          store.updatePayload(job.id, { commentQueued: true });
        }
        store.updateUpload(job.id, {
          status: job.publishAt ? 'scheduled' : 'success',
          externalId: video.id,
          url: video.url,
          error: warnings.length ? `Uploaded, with warnings: ${warnings.join('; ')}` : null,
        });
        const day = store.getDay(job.date);
        if (day) store.saveDay({ ...day, status: 'uploaded' });
        return;
      }

      if (job.platform === 'instagram') {
        const out = await uploadToInstagram(`${process.env.PUBLIC_BASE_URL}/media/${job.mediaToken}`, p.caption, {
          containerId: p.containerId,
          onContainer: (id) => store.updatePayload(job.id, { containerId: id }),
        });
        store.updateUpload(job.id, { status: 'success', externalId: out.id, url: out.url });
        return;
      }

      const out = await uploadToTikTok(job.filePath, p.caption, {
        publishId: p.publishId,
        onInit: (id) => store.updatePayload(job.id, { publishId: id }),
      });
      store.updateUpload(job.id, { status: 'success', externalId: out.id, url: out.url });
    } catch (err) {
      const message = (err as Error).message;
      const retry = !(err instanceof PermanentError) && attempts < MAX_ATTEMPTS && TRANSIENT.test(message);
      if (retry) {
        const delay = Math.min(60, 2 ** attempts) * 60_000; // 2, 4, 8, 16 min
        store.updateUpload(job.id, { status: 'queued', runAt: new Date(now.getTime() + delay).toISOString(), error: `Attempt ${attempts} failed, retrying: ${message}` });
      } else {
        store.updateUpload(job.id, { status: 'error', error: message });
      }
    }
  }
}
