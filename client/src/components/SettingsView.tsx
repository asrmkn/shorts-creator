import { useState } from 'react';
import { FLOW_MODELS, PROVIDERS, type Settings } from '../../../shared/schemas';
import { MODEL_PROFILES } from '../../../shared/flowPrompt';
import { audienceTimes, publishInstant } from '../../../shared/regional';
import { api, type SettingsResponse } from '../api';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIMEZONES = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
const PROVIDER_LABEL: Record<Settings['provider'], string> = {
  mock: 'Offline demo templates (no key, not for publishing)',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic Claude',
  ollama: 'Ollama (local)',
};

interface Props {
  data: SettingsResponse;
  reload: () => Promise<void>;
  notify: (t: string, e?: boolean) => void;
}

export default function SettingsView({ data, reload, notify }: Props) {
  const [s, setS] = useState<Settings>(data.settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const yt = data.publishing.youtube;
  const today = new Date().toISOString().slice(0, 10);
    const preview = /^([01]\d|2[0-3]):[0-5]\d$/.test(s.publishSlotUtc) ? audienceTimes(publishInstant(today, s.publishSlotUtc), s.userTimezone) : null;

  const save = async () => {
    try {
      await api.saveSettings(s);
      await reload();
      notify('Settings saved');
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">🤖 AI & channel</h2>
        <div>
          <label className="label">AI writer</label>
          <select className="input" value={s.provider} onChange={(e) => set('provider', e.target.value as Settings['provider'])}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]} {data.providers[p] ? '' : '(no API key in .env)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">AI model (optional)</label>
          <input className="input" placeholder="default for provider, e.g. gemini-2.5-flash" value={s.model} onChange={(e) => set('model', e.target.value)} />
        </div>
        <div>
          <label className="label">Google Flow video model</label>
          <select className="input" value={s.targetModel} onChange={(e) => set('targetModel', e.target.value as Settings['targetModel'])}>
            {FLOW_MODELS.map((m) => (
              <option key={m} value={m}>{MODEL_PROFILES[m].label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">{MODEL_PROFILES[s.targetModel].notes.join(' ')} Clip lengths in the prompts are checked against this model.</p>
        </div>
        <div>
          <label className="label">Character prompts</label>
          <select className="input" value={s.characterMode} onChange={(e) => set('characterMode', e.target.value as Settings['characterMode'])}>
            <option value="text">Full text descriptions (works without setup)</option>
            <option value="ingredients">Flow Characters (@Name references, best consistency)</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">Ingredients mode needs a Flow Character for each cast member, with 1-2 reference images and a saved voice.</p>
        </div>
        <div>
          <label className="label">Channel name</label>
          <input className="input" value={s.channelName} onChange={(e) => set('channelName', e.target.value)} />
        </div>
        <div>
          <label className="label">Channel brief</label>
          <textarea className="input min-h-20" value={s.channelBrief} onChange={(e) => set('channelBrief', e.target.value)} />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">⏰ Daily publish slot</h2>
        <p className="text-xs text-zinc-400">
          Shorts go to every country from one upload, and YouTube says posting time matters little, so the app publishes once a day at a single global time. The default of 20:00 UTC lands in the US afternoon, UK prime time and AU/NZ breakfast. After 28 days, adjust it using YouTube Studio's "When your viewers are on YouTube" report.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Slot (UTC, HH:MM)</label>
            <input className="input" value={s.publishSlotUtc} onChange={(e) => set('publishSlotUtc', e.target.value)} placeholder="20:00" />
          </div>
          <div>
            <label className="label">Your timezone</label>
            <select className="input" value={s.userTimezone} onChange={(e) => set('userTimezone', e.target.value)}>
              {(TIMEZONES.includes(s.userTimezone) ? TIMEZONES : [s.userTimezone, ...TIMEZONES]).map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
        {preview && (
          <>
            {Number(s.publishSlotUtc.slice(0, 2)) < 6 && (
              <p className="text-xs text-amber-300">Slots before 06:00 UTC go live on the previous evening in the Americas, a day before the planned date.</p>
            )}
          <table className="w-full text-xs">
            <tbody>
              <tr className="text-orange-300"><td className="py-1">You</td><td>{preview.yourTime}</td></tr>
              {preview.audiences.map((a) => (
                <tr key={a.label} className="border-t border-zinc-800"><td className="py-1">{a.label}</td><td>{a.localTime}</td></tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </section>

      <section className="card space-y-3 lg:col-span-2">
        <h2 className="text-lg font-bold">🗓️ Weekly themes</h2>
        <p className="text-xs text-zinc-400">Used for planning only, not shown to viewers (a Saturday upload arrives on Sunday in Australia).</p>
        <div className="grid gap-2 md:grid-cols-2">
          {WEEKDAYS.map((d, i) => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-24 text-sm text-zinc-400">{d}</span>
              <input className="input" value={s.weeklyThemes[i]} onChange={(e) => set('weeklyThemes', s.weeklyThemes.map((t, j) => (j === i ? e.target.value : t)))} />
            </div>
          ))}
        </div>
      </section>

      <div className="lg:col-span-2">
        <button className="btn-primary" onClick={save}>💾 Save settings</button>
      </div>

      <section className="card space-y-3 lg:col-span-2">
        <h2 className="text-lg font-bold">🚀 Publishing accounts</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="w-40">▶️ YouTube Shorts</span>
          {!yt.configured ? (
            <span className="text-zinc-500">Add YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET to .env (see README)</span>
          ) : yt.connected ? (
            <>
              <span className="text-emerald-400">Connected</span>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => { await api.disconnectYouTube(); await reload(); }}>Disconnect</button>
            </>
          ) : (
            <>
              {yt.needsReconnect && <span className="text-amber-300">Reconnect to allow playlists and comments.</span>}
              <a className="btn-primary" href="/api/auth/youtube">{yt.needsReconnect ? 'Reconnect YouTube' : 'Connect YouTube'}</a>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="w-40">📸 Instagram Reels</span>
          {data.publishing.instagram.configured ? <span className="text-emerald-400">Configured</span> : <span className="text-zinc-500">Set IG_USER_ID, IG_ACCESS_TOKEN and PUBLIC_BASE_URL in .env</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="w-40">🎵 TikTok</span>
          {!data.publishing.tiktok.enabled ? (
            <span className="text-zinc-500">Off. TikTok is blocked in India, and unaudited apps can only post privately (see README).</span>
          ) : data.publishing.tiktok.configured ? (
            <span className="text-emerald-400">Configured</span>
          ) : (
            <span className="text-zinc-500">Set TIKTOK_ACCESS_TOKEN in .env</span>
          )}
        </div>
        {!data.publishing.mockPublishAllowed && s.provider === 'mock' && (
          <p className="text-xs text-amber-300">Packs from the offline demo templates can't be published. Pick a real AI writer above.</p>
        )}
      </section>
    </div>
  );
}
