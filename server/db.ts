import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DayPackSchema, DayPlanSchema, type Character, type DayPlan, type Platform, type Scene, type Settings, type UploadRecord, type UploadStatus } from '../shared/schemas';
import { DEFAULT_PUBLISH_SLOT_UTC } from '../shared/regional';
import { CharacterInputSchema, SceneInputSchema } from '../shared/schemas';

const DEFAULT_THEMES = [
  'Stunt Sunday Remix',
  'Drift Monday',
  'Two-Wheel Tuesday',
  'Wheelie Wednesday',
  'Throttle Thursday',
  'Flying Friday',
  'Showdown Saturday',
];

export function defaultSettings(): Settings {
  return {
    provider: (process.env.LLM_PROVIDER as Settings['provider']) || 'mock',
    model: process.env.LLM_MODEL || '',
    targetModel: 'veo-3.1-lite',
    userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    publishSlotUtc: DEFAULT_PUBLISH_SLOT_UTC,
    characterMode: 'text',
    channelName: 'StuntShorts',
    channelBrief:
      'High-energy, cinematic, fictional AI bike and car stunt stories with a recurring cast, for teens and adults (13+) who love motorsport in the US, UK, Australia, Canada and New Zealand.',
    weeklyThemes: DEFAULT_THEMES,
  };
}

export interface UploadJob extends UploadRecord {
  filePath: string | null;
  fileHash: string | null;
  mediaToken: string | null;
  payload: Record<string, unknown>;
}

export class Store {
  db: DatabaseSync;

  constructor(file = process.env.DB_PATH || path.resolve('data', 'stuntshorts.db')) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS scenes (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, platform TEXT NOT NULL, status TEXT NOT NULL,
        external_id TEXT, url TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    const cols = new Set((this.db.prepare('PRAGMA table_info(uploads)').all() as Array<{ name: string }>).map((c) => c.name));
    for (const [name, type] of [
      ['run_at', 'TEXT'],
      ['publish_at', 'TEXT'],
      ['file_path', 'TEXT'],
      ['file_hash', 'TEXT'],
      ['media_token', 'TEXT'],
      ['payload', "TEXT NOT NULL DEFAULT '{}'"],
      ['attempts', 'INTEGER NOT NULL DEFAULT 0'],
    ]) {
      if (!cols.has(name)) this.db.exec(`ALTER TABLE uploads ADD COLUMN ${name} ${type}`);
    }
  }

  private rows(table: 'characters' | 'scenes'): unknown[] {
    return (this.db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all() as { data: string }[]).map((r) => JSON.parse(r.data));
  }

  // Parsing applies defaults for fields added after the record was saved; records that can't be repaired are skipped.
  listCharacters = (): Character[] =>
    this.rows('characters').flatMap((raw) => {
      const c = raw as Character;
      const parsed = CharacterInputSchema.safeParse({ ...c, age: Math.max(21, Number(c.age) || 21) });
      return parsed.success ? [{ ...parsed.data, id: c.id }] : [];
    });
  listScenes = (): Scene[] =>
    this.rows('scenes').flatMap((raw) => {
      const parsed = SceneInputSchema.safeParse(raw);
      return parsed.success ? [{ ...parsed.data, id: (raw as Scene).id }] : [];
    });

  saveCharacter(c: Character) {
    this.db.prepare('INSERT OR REPLACE INTO characters (id, data) VALUES (?, ?)').run(c.id, JSON.stringify(c));
  }
  deleteCharacter(id: string) {
    this.db.prepare('DELETE FROM characters WHERE id = ?').run(id);
  }
  saveScene(s: Scene) {
    this.db.prepare('INSERT OR REPLACE INTO scenes (id, data) VALUES (?, ?)').run(s.id, JSON.stringify(s));
  }
  deleteScene(id: string) {
    this.db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
  }

  /** Packs saved by older versions no longer match the prompt format; drop them so they get regenerated. */
  private toDay(raw: string): DayPlan {
    const data = JSON.parse(raw);
    if (data.pack && !DayPackSchema.safeParse(data.pack).success) delete data.pack;
    return DayPlanSchema.parse(data);
  }

  getDay(date: string): DayPlan | undefined {
    const row = this.db.prepare('SELECT data FROM days WHERE date = ?').get(date) as { data: string } | undefined;
    return row ? this.toDay(row.data) : undefined;
  }
  listDays(prefix: string): DayPlan[] {
    return (this.db.prepare('SELECT data FROM days WHERE date LIKE ? ORDER BY date').all(`${prefix}%`) as { data: string }[]).map((r) => this.toDay(r.data));
  }
  /** Concepts, stunt keys and CTA lines used recently, so new generations avoid repeats. */
  recentHistory(beforeDate: string, limit = 60): { concepts: string[]; stuntKeys: string[]; ctas: string[] } {
    const rows = (this.db.prepare('SELECT data FROM days WHERE date < ? ORDER BY date DESC LIMIT ?').all(beforeDate, limit) as { data: string }[]).map((r) =>
      this.toDay(r.data),
    );
    return {
      concepts: rows.map((r) => r.concept),
      stuntKeys: rows.map((r) => r.stuntKey).filter(Boolean),
      ctas: rows.flatMap((r) => (r.pack ? [r.pack.clips.at(-1)?.lines[0]?.text ?? ''] : [])).filter(Boolean),
    };
  }
  saveDay(d: DayPlan) {
    this.db.prepare('INSERT OR REPLACE INTO days (date, data) VALUES (?, ?)').run(d.date, JSON.stringify(d));
  }

  getSettings(): Settings {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = 'app'").get() as { value: string } | undefined;
    const saved = row ? JSON.parse(row.value) : {};
    const merged = { ...defaultSettings(), ...saved };
    return {
      provider: merged.provider,
      model: merged.model,
      targetModel: merged.targetModel,
      userTimezone: merged.userTimezone,
      publishSlotUtc: merged.publishSlotUtc,
      characterMode: merged.characterMode,
      channelName: merged.channelName,
      channelBrief: merged.channelBrief,
      weeklyThemes: merged.weeklyThemes,
    };
  }
  saveSettings(s: Settings) {
    this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('app', ?)").run(JSON.stringify(s));
  }

  getSecret(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(`secret:${key}`) as { value: string } | undefined;
    return row?.value;
  }
  setSecret(key: string, value: string | null) {
    if (value === null) this.db.prepare('DELETE FROM settings WHERE key = ?').run(`secret:${key}`);
    else this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(`secret:${key}`, value);
  }

  // ---------- Upload jobs ----------
  addUpload(u: {
    date: string;
    platform: Platform;
    status: UploadStatus;
    runAt?: string | null;
    publishAt?: string | null;
    filePath?: string | null;
    fileHash?: string | null;
    mediaToken?: string | null;
    payload?: Record<string, unknown>;
    error?: string | null;
  }): number {
    const res = this.db
      .prepare('INSERT INTO uploads (date, platform, status, run_at, publish_at, file_path, file_hash, media_token, payload, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(u.date, u.platform, u.status, u.runAt ?? null, u.publishAt ?? null, u.filePath ?? null, u.fileHash ?? null, u.mediaToken ?? null, JSON.stringify(u.payload ?? {}), u.error ?? null);
    return Number(res.lastInsertRowid);
  }
  updateUpload(id: number, patch: Partial<{ status: UploadStatus; externalId: string | null; url: string | null; error: string | null; runAt: string | null; attempts: number }>) {
    const map: Record<string, string> = { status: 'status', externalId: 'external_id', url: 'url', error: 'error', runAt: 'run_at', attempts: 'attempts' };
    const keys = Object.keys(patch).filter((k) => k in map);
    if (!keys.length) return;
    this.db
      .prepare(`UPDATE uploads SET ${keys.map((k) => `${map[k]} = ?`).join(', ')} WHERE id = ?`)
      .run(...keys.map((k) => (patch as Record<string, string | number | null>)[k]), id);
  }
  private toJob(r: Record<string, unknown>): UploadJob {
    return {
      id: r.id as number,
      date: r.date as string,
      platform: r.platform as Platform,
      status: r.status as UploadStatus,
      externalId: (r.external_id as string) ?? null,
      url: (r.url as string) ?? null,
      error: (r.error as string) ?? null,
      runAt: (r.run_at as string) ?? null,
      publishAt: (r.publish_at as string) ?? null,
      attempts: Number(r.attempts ?? 0),
      createdAt: r.created_at as string,
      filePath: (r.file_path as string) ?? null,
      fileHash: (r.file_hash as string) ?? null,
      mediaToken: (r.media_token as string) ?? null,
      payload: JSON.parse((r.payload as string) || '{}'),
    };
  }
  getUpload(id: number): UploadJob | undefined {
    const r = this.db.prepare('SELECT * FROM uploads WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? this.toJob(r) : undefined;
  }
  listUploads(date: string): UploadRecord[] {
    return (this.db.prepare('SELECT * FROM uploads WHERE date = ? ORDER BY id DESC').all(date) as Array<Record<string, unknown>>).map((r) => {
      const { filePath: _f, fileHash: _h, mediaToken: _m, payload: _p, ...rec } = this.toJob(r);
      return rec;
    });
  }
  activeUploads(date: string, platform: Platform): UploadJob[] {
    return (
      this.db.prepare("SELECT * FROM uploads WHERE date = ? AND platform = ? AND status IN ('queued','processing','success','scheduled')").all(date, platform) as Array<
        Record<string, unknown>
      >
    ).map((r) => this.toJob(r));
  }
  uploadsWithHash(hash: string): UploadJob[] {
    return (this.db.prepare("SELECT * FROM uploads WHERE file_hash = ? AND status != 'error'").all(hash) as Array<Record<string, unknown>>).map((r) => this.toJob(r));
  }
  dueJobs(nowIso: string): UploadJob[] {
    return (this.db.prepare("SELECT * FROM uploads WHERE status = 'queued' AND (run_at IS NULL OR run_at <= ?) ORDER BY id").all(nowIso) as Array<Record<string, unknown>>).map(
      (r) => this.toJob(r),
    );
  }
  jobByMediaToken(token: string): UploadJob | undefined {
    const r = this.db.prepare('SELECT * FROM uploads WHERE media_token = ?').get(token) as Record<string, unknown> | undefined;
    return r ? this.toJob(r) : undefined;
  }
  /** Saves upload progress so a restarted job can resume instead of posting twice. */
  updatePayload(id: number, patch: Record<string, unknown>) {
    const job = this.getUpload(id);
    if (!job) return;
    this.db.prepare('UPDATE uploads SET payload = ? WHERE id = ?').run(JSON.stringify({ ...job.payload, ...patch }), id);
  }
  /** Video files whose jobs all finished more than `days` ago and are not used by any pending job. */
  staleMediaFiles(days = 7): string[] {
    const rows = this.db
      .prepare(
        `SELECT file_path FROM uploads WHERE file_path IS NOT NULL GROUP BY file_path
         HAVING SUM(CASE WHEN status IN ('queued','processing') THEN 1 ELSE 0 END) = 0 AND MAX(created_at) < datetime('now', ?)`,
      )
      .all(`-${days} days`) as Array<{ file_path: string }>;
    return rows.map((r) => r.file_path);
  }
  clearFilePath(filePath: string) {
    this.db.prepare('UPDATE uploads SET file_path = NULL WHERE file_path = ?').run(filePath);
  }
  /** Jobs interrupted by a server restart are retried. */  requeueInterrupted() {
    this.db.prepare("UPDATE uploads SET status = 'queued' WHERE status = 'processing'").run();
  }
}
