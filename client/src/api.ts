import type { AudienceTime, Character, CharacterInput, DayPlan, Holiday, Platform, Scene, SceneInput, Settings, UploadRecord } from '../../shared/schemas';
import type { FlowPrompt } from '../../shared/flowPrompt';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.code);
  return data as T;
}
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export interface SettingsResponse {
  settings: Settings;
  providers: Record<Settings['provider'], boolean>;
  publishing: {
    youtube: { configured: boolean; connected: boolean; needsReconnect: boolean };
    instagram: { configured: boolean };
    tiktok: { enabled: boolean; configured: boolean };
    mockPublishAllowed: boolean;
  };
}
export interface DayDetail {
  day: DayPlan;
  flow: FlowPrompt | null;
  issues: string[];
  schedule: { publishAt: string; slotUtc: string; yourTime: string; audiences: AudienceTime[] };
  uploads: UploadRecord[];
}

export const api = {
  settings: () => request<SettingsResponse>('/api/settings'),
  saveSettings: (s: Partial<Settings>) => request<Settings>('/api/settings', json('PUT', s)),

  characters: () => request<Character[]>('/api/characters'),
  addCharacter: (c: CharacterInput) => request<Character>('/api/characters', json('POST', c)),
  updateCharacter: (id: string, c: CharacterInput) => request<Character>(`/api/characters/${id}`, json('PUT', c)),
  deleteCharacter: (id: string) => request<void>(`/api/characters/${id}`, json('DELETE')),
  generateCharacters: (count: number, brief: string) => request<Character[]>('/api/characters/generate', json('POST', { count, brief })),

  scenes: () => request<Scene[]>('/api/scenes'),
  addScene: (s: SceneInput) => request<Scene>('/api/scenes', json('POST', s)),
  updateScene: (id: string, s: SceneInput) => request<Scene>(`/api/scenes/${id}`, json('PUT', s)),
  deleteScene: (id: string) => request<void>(`/api/scenes/${id}`, json('DELETE')),
  generateScenes: (count: number) => request<Scene[]>('/api/scenes/generate', json('POST', { count })),

  month: (m: string) => request<{ days: DayPlan[]; holidays: Holiday[] }>(`/api/months/${m}`),
  generateMonth: (m: string) => request<{ days: DayPlan[] }>(`/api/months/${m}/generate`, json('POST', {})),
  generatePacks: (m: string, onlyMissing = true) =>
    request<{ days: DayPlan[]; errors: Array<{ date: string; error: string }> }>(`/api/months/${m}/generate-packs`, json('POST', { onlyMissing })),

  day: (d: string) => request<DayDetail>(`/api/days/${d}`),
  updateDay: (d: string, patch: Partial<DayPlan>) => request<DayPlan>(`/api/days/${d}`, json('PUT', patch)),
  generateDay: (d: string) => request<DayPlan>(`/api/days/${d}/generate`, json('POST', {})),
  uploads: (d: string) => request<UploadRecord[]>(`/api/days/${d}/uploads`),
  publish: (d: string, file: File, platforms: Platform[], schedule: 'slot' | 'now', opts: { force?: boolean; overrideWarnings?: boolean } = {}) => {
    const fd = new FormData();
    fd.append('video', file);
    fd.append('platforms', JSON.stringify(platforms));
    fd.append('schedule', schedule);
    fd.append('force', String(!!opts.force));
    fd.append('overrideWarnings', String(!!opts.overrideWarnings));
    return request<{ uploads: UploadRecord[]; publishAt: string | null; warnings: string[] }>(`/api/days/${d}/publish`, { method: 'POST', body: fd });
  },
  disconnectYouTube: () => request<void>('/api/auth/youtube/disconnect', json('POST')),
};
