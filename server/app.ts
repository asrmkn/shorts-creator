import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CharacterInputSchema, DayPlanSchema, PlatformSchema, SceneInputSchema, SettingsSchema, type Platform } from '../shared/schemas';
import { audienceTimes, holidaysForMonth, publishInstant } from '../shared/regional';
import { blockingIssues, buildFlowPrompt, validatePack } from '../shared/flowPrompt';
import type { Store } from './db';
import { inspectVideo, shortsProblems } from './mp4';
import { generateCharacters, generateDayPack, generateMonth, generateScenes, UserError } from './generators';
import { configuredProviders } from './llm/provider';
import { monthToCsv, monthToPdf } from './export';
import { authUrl, exchangeCode, youtubeConfigured, youtubeConnected } from './uploads/youtube';
import { instagramConfigured, tiktokConfigured, tiktokEnabled } from './uploads/social';
import { Publisher } from './publisher';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

const monthParam = z.string().regex(/^\d{4}-\d{2}$/);
const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MIN_SCHEDULE_LEAD_MS = 2 * 60 * 60_000; // give YouTube time to process and run claim checks
type Handler = (req: Request, res: Response) => Promise<unknown> | unknown;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res)).catch(next);
const mockPublishAllowed = () => process.env.ALLOW_MOCK_PUBLISH === '1';

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export function createApp(store: Store, options: { mediaDir?: string; publisher?: Publisher } = {}) {
  const mediaDir = options.mediaDir ?? path.resolve('data', 'media');
  const publisher = options.publisher ?? new Publisher(store);
  fs.mkdirSync(mediaDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: mediaDir,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomUUID().slice(0, 8)}${path.extname(file.originalname) || '.mp4'}`),
    }),
    limits: { fileSize: 512 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, /video\//.test(file.mimetype)),
  });
  const oauthStates = new Set<string>();

  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Videos are only reachable through a per-job token while the job is pending, until 24 h after its run time.
  app.get('/media/:token', (req, res) => {
    const job = store.jobByMediaToken(req.params.token);
    const runAt = job?.runAt ? new Date(job.runAt).getTime() : 0;
    const live = job && ['queued', 'processing'].includes(job.status) && Date.now() <= runAt + 24 * 3600_000;
    if (!job || !live || !job.filePath || !fs.existsSync(job.filePath)) return res.status(404).end();
    res.sendFile(job.filePath);
  });

  // ---------- Settings ----------
  app.get('/api/settings', (_req, res) => {
    res.json({
      settings: store.getSettings(),
      providers: configuredProviders(),
      publishing: {
        youtube: { configured: youtubeConfigured(), connected: youtubeConnected(store), needsReconnect: !!store.getSecret('youtube') && !youtubeConnected(store) },
        instagram: { configured: instagramConfigured() },
        tiktok: { enabled: tiktokEnabled(), configured: tiktokConfigured() },
        mockPublishAllowed: mockPublishAllowed(),
      },
    });
  });
  app.put('/api/settings', (req, res) => {
    const s = SettingsSchema.parse({ ...store.getSettings(), ...req.body });
    store.saveSettings(s);
    res.json(s);
  });

  // ---------- Characters ----------
  app.get('/api/characters', (_req, res) => res.json(store.listCharacters()));
  app.post('/api/characters', (req, res) => {
    const c = { ...CharacterInputSchema.parse(req.body), id: randomUUID() };
    store.saveCharacter(c);
    res.status(201).json(c);
  });
  app.put('/api/characters/:id', (req, res) => {
    const c = { ...CharacterInputSchema.parse(req.body), id: req.params.id };
    store.saveCharacter(c);
    res.json(c);
  });
  app.delete('/api/characters/:id', (req, res) => {
    store.deleteCharacter(req.params.id);
    res.status(204).end();
  });
  app.post(
    '/api/characters/generate',
    wrap(async (req, res) => {
      const { count, brief } = z.object({ count: z.number().int().min(1).max(8).default(4), brief: z.string().default('') }).parse(req.body ?? {});
      const created = await generateCharacters(store.getSettings(), count, brief, store.listCharacters());
      created.forEach((c) => store.saveCharacter(c));
      res.status(201).json(created);
    }),
  );

  // ---------- Scenes ----------
  app.get('/api/scenes', (_req, res) => res.json(store.listScenes()));
  app.post('/api/scenes', (req, res) => {
    const s = { ...SceneInputSchema.parse(req.body), id: randomUUID() };
    store.saveScene(s);
    res.status(201).json(s);
  });
  app.put('/api/scenes/:id', (req, res) => {
    const s = { ...SceneInputSchema.parse(req.body), id: req.params.id };
    store.saveScene(s);
    res.json(s);
  });
  app.delete('/api/scenes/:id', (req, res) => {
    store.deleteScene(req.params.id);
    res.status(204).end();
  });
  app.post(
    '/api/scenes/generate',
    wrap(async (req, res) => {
      const { count } = z.object({ count: z.number().int().min(1).max(12).default(4) }).parse(req.body ?? {});
      const created = await generateScenes(store.getSettings(), count, store.listScenes());
      created.forEach((s) => store.saveScene(s));
      res.status(201).json(created);
    }),
  );

  // ---------- Calendar ----------
  app.get('/api/months/:month', (req, res) => {
    const month = monthParam.parse(req.params.month);
    const [y, m] = month.split('-').map(Number);
    res.json({ days: store.listDays(month), holidays: holidaysForMonth(y, m) });
  });
  app.post(
    '/api/months/:month/generate',
    wrap(async (req, res) => {
      const [y, m] = monthParam.parse(req.params.month).split('-').map(Number);
      res.json({ days: await generateMonth(store, y, m) });
    }),
  );
  app.post(
    '/api/months/:month/generate-packs',
    wrap(async (req, res) => {
      const month = monthParam.parse(req.params.month);
      const { onlyMissing } = z.object({ onlyMissing: z.boolean().default(true) }).parse(req.body ?? {});
      const targets = store.listDays(month).filter((d) => !d.locked && (!onlyMissing || !d.pack));
      const errors: Array<{ date: string; error: string }> = [];
      const queue = [...targets];
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          for (let d = queue.shift(); d; d = queue.shift()) {
            try {
              await generateDayPack(store, d.date);
            } catch (e) {
              errors.push({ date: d.date, error: (e as Error).message });
            }
          }
        }),
      );
      res.json({ days: store.listDays(month), errors });
    }),
  );

  app.get('/api/days/:date', (req, res) => {
    const date = dateParam.parse(req.params.date);
    const day = store.getDay(date);
    if (!day) return res.status(404).json({ error: `No plan for ${date}` });
    const settings = store.getSettings();
    const characters = store.listCharacters();
    const scene = store.listScenes().find((s) => s.id === day.sceneId);
    const slot = publishInstant(date, settings.publishSlotUtc);
    res.json({
      day,
      flow: buildFlowPrompt(day, characters, scene, settings.targetModel, settings.characterMode),
      issues: day.pack ? validatePack(day.pack, characters, settings.targetModel, scene) : [],
      schedule: { publishAt: slot.toISOString(), slotUtc: settings.publishSlotUtc, ...audienceTimes(slot, settings.userTimezone) },
      uploads: store.listUploads(date),
    });
  });
  app.put('/api/days/:date', (req, res) => {
    const date = dateParam.parse(req.params.date);
    const current = store.getDay(date);
    const day = DayPlanSchema.parse({ ...current, ...req.body, date });
    store.saveDay(day);
    res.json(day);
  });
  app.post(
    '/api/days/:date/generate',
    wrap(async (req, res) => res.json(await generateDayPack(store, dateParam.parse(req.params.date)))),
  );

  // ---------- Export ----------
  app.get('/api/months/:month/export.csv', (req, res) => {
    const month = monthParam.parse(req.params.month);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="stuntshorts-${month}.csv"`);
    res.send('\uFEFF' + monthToCsv(store.listDays(month), store.listCharacters(), store.listScenes(), store.getSettings()));
  });
  app.get('/api/months/:month/export.pdf', (req, res) => {
    const month = monthParam.parse(req.params.month);
    const label = new Date(`${month}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="stuntshorts-${month}.pdf"`);
    monthToPdf(`Content calendar · ${label}`, store.listDays(month), store.listCharacters(), store.listScenes(), store.getSettings()).pipe(res);
  });

  // ---------- Publishing ----------
  app.get('/api/auth/youtube', (_req, res) => {
    const state = randomUUID();
    oauthStates.add(state);
    res.redirect(authUrl(state));
  });
  app.get(
    '/api/auth/youtube/callback',
    wrap(async (req, res) => {
      const { code, state } = req.query as Record<string, string>;
      if (!state || !oauthStates.delete(state)) return res.status(400).send('Invalid OAuth state. Please try connecting again.');
      await exchangeCode(store, code);
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/?view=settings&youtube=connected`);
    }),
  );
  app.post('/api/auth/youtube/disconnect', (_req, res) => {
    store.setSecret('youtube', null);
    res.status(204).end();
  });

  app.post(
    '/api/days/:date/publish',
    upload.single('video'),
    wrap(async (req, res) => {
      const date = dateParam.parse(req.params.date);
      const file = req.file;
      const discard = () => file && fs.rmSync(file.path, { force: true });
      try {
        const day = store.getDay(date);
        if (!day?.pack) throw new UserError('Generate the prompt pack before publishing.');
        if (!file) throw new UserError('Attach the MP4 you made in Google Flow.');
        if (day.pack.generatedBy === 'mock' && !mockPublishAllowed())
          throw new UserError(
            'This pack was written by the offline demo templates. YouTube does not monetise channels built on generic templates, so switch to a real AI provider in Settings and regenerate the pack before publishing (or set ALLOW_MOCK_PUBLISH=1 to override).',
          );
        const body = z
          .object({
            platforms: z.string().transform((s) => z.array(PlatformSchema).min(1).parse(JSON.parse(s))),
            schedule: z.enum(['slot', 'now']).default('slot'),
            force: z.enum(['true', 'false']).default('false'),
            overrideWarnings: z.enum(['true', 'false']).default('false'),
          })
          .parse(req.body);
        if (body.platforms.includes('tiktok') && !tiktokEnabled()) throw new UserError('TikTok publishing is disabled (TikTok is blocked in India; see README).');
        // `force` only overrides the duplicate guards; content checks have their own flag.
        const force = body.force === 'true';

        let video;
        try {
          video = inspectVideo(file.path);
        } catch (e) {
          throw new UserError(`Could not read the video: ${(e as Error).message} Export an MP4 from Flow or your editor.`);
        }
        const { blocking, warnings } = shortsProblems(video, { instagram: body.platforms.includes('instagram') });
        if (blocking.length) throw new UserError(blocking.join(' '));

        const settings = store.getSettings();
        const characters = store.listCharacters();
        const scene = store.listScenes().find((s) => s.id === day.sceneId);
        const packProblems = blockingIssues(validatePack(day.pack, characters, settings.targetModel, scene));
        // Imitation wording and a missing safety line can never be overridden.
        const hard = packProblems.filter((i) => /copy the stunt|safety line/i.test(i));
        const soft = packProblems.filter((i) => !hard.includes(i));
        if (hard.length) throw new HttpError(409, `Fix these before publishing (edit or regenerate the pack): ${hard.join(' ')}`, 'pack-issues');
        if (soft.length && body.overrideWarnings !== 'true') throw new HttpError(409, `Check these before publishing: ${soft.join(' ')}`, 'pack-warnings');

        const fileHash = await sha256(file.path);
        if (!force) {
          const dupes = body.platforms.filter((p) => store.activeUploads(date, p).some((j) => j.payload.kind !== 'comment'));
          if (dupes.length) throw new HttpError(409, `${dupes.join(', ')} already has an upload for ${date}. Uploading twice looks like spam to YouTube.`, 'duplicate');
          const sameFile = store.uploadsWithHash(fileHash).find((j) => j.date !== date);
          if (sameFile) throw new HttpError(409, `This exact video was already uploaded for ${sameFile.date}. Re-uploading the same video counts as reused content.`, 'duplicate-file');
        }

        let publishAt: string | null = null;
        if (body.schedule === 'slot') {
          const slot = publishInstant(date, settings.publishSlotUtc);
          if (slot.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS)
            throw new HttpError(409, `The ${settings.publishSlotUtc} UTC slot for ${date} has passed or is less than 2 hours away. Choose "Publish now" or use a later day.`, 'slot-passed');
          publishAt = slot.toISOString();
        }

        const m = day.pack.metadata;
        const now = new Date().toISOString();
        const jobs: Array<{ platform: Platform; payload: Record<string, unknown>; runAt: string; mediaToken?: string }> = [];
        for (const platform of body.platforms) {
          if (platform === 'youtube') {
            jobs.push({
              platform,
              runAt: now,
              payload: {
                title: m.title,
                description: m.description,
                tags: m.tags,
                localizations: m.enGB ? { 'en-GB': m.enGB } : undefined,
                series: day.series || undefined,
                pinnedComment: m.pinnedComment || undefined,
              },
            });
          } else {
            jobs.push({ platform, runAt: publishAt ?? now, mediaToken: platform === 'instagram' ? randomUUID() : undefined, payload: { caption: m.instagramCaption } });
          }
        }
        for (const j of jobs) {
          store.addUpload({ date, platform: j.platform, status: 'queued', runAt: j.runAt, publishAt: j.platform === 'youtube' ? publishAt : null, filePath: file.path, fileHash, mediaToken: j.mediaToken, payload: j.payload });
        }
        void publisher.tick();
        res.status(202).json({ uploads: store.listUploads(date), publishAt, warnings });
      } catch (err) {
        discard();
        throw err;
      }
    }),
  );
  app.get('/api/days/:date/uploads', (req, res) => res.json(store.listUploads(dateParam.parse(req.params.date))));

  // ---------- Errors ----------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    if (err instanceof UserError) return res.status(400).json({ error: err.message });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  });

  return { app, publisher };
}
