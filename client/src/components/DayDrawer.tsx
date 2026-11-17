import { useCallback, useEffect, useState } from 'react';
import type { Character, Platform, Scene, Settings, Status } from '../../../shared/schemas';
import { findByPromptName } from '../../../shared/flowPrompt';
import { api, ApiError, type DayDetail, type SettingsResponse } from '../api';

interface Props {
  date: string;
  characters: Character[];
  scenes: Scene[];
  settings: Settings;
  publishing: SettingsResponse['publishing'];
  notify: (t: string, e?: boolean) => void;
  onClose: () => void;
  onChanged: () => void;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-ghost px-2 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? '✓ Copied' : `📋 ${label}`}
    </button>
  );
}

const ACCENT_LANG: Array<[RegExp, string]> = [
  [/brit|english|london|uk/i, 'en-GB'],
  [/austral|aussie/i, 'en-AU'],
  [/canad/i, 'en-CA'],
  [/zealand|kiwi/i, 'en-NZ'],
  [/irish/i, 'en-IE'],
  [/india/i, 'en-IN'],
];

function speak(lines: Array<{ text: string; character?: Character }>) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = synth.getVoices();
  for (const { text, character } of lines) {
    const lang = ACCENT_LANG.find(([re]) => re.test(character?.voiceAccent ?? ''))?.[1] ?? 'en-US';
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith('en')) ?? null;
    const desc = character?.voiceDescription ?? '';
    u.rate = /fast|quick|hyped|excit/i.test(desc) ? 1.15 : /slow|smug|gentle/i.test(desc) ? 0.9 : 1;
    u.pitch = /deep|low|gravel/i.test(desc) ? 0.8 : /light|squeaky|playful|sing-song/i.test(desc) ? 1.2 : 1;
    synth.speak(u);
  }
}

const BEAT_STYLE: Record<string, string> = {
  setup: 'bg-sky-900/60 text-sky-200',
  stunt: 'bg-orange-900/60 text-orange-200',
  payoff: 'bg-pink-900/60 text-pink-200',
  cta: 'bg-emerald-900/60 text-emerald-200',
};
const UPLOAD_STYLE: Record<string, string> = {
  queued: 'text-sky-300',
  processing: 'text-amber-300',
  success: 'text-emerald-300',
  scheduled: 'text-emerald-300',
  error: 'text-red-300',
};

export default function DayDrawer({ date, characters, scenes, settings, publishing, notify, onClose, onChanged }: Props) {
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>(['youtube']);
  const [schedule, setSchedule] = useState<'slot' | 'now'>('slot');
  const [concept, setConcept] = useState('');
  const [override, setOverride] = useState<'force' | 'overrideWarnings' | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.day(date);
      setDetail(d);
      setConcept(d.day.concept);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }, [date, notify]);

  useEffect(() => {
    load();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('keydown', esc);
      window.speechSynthesis?.cancel();
    };
  }, [load, onClose]);

  // Poll while uploads are queued or running in the background publisher.
  const pending = detail?.uploads.some((u) => u.status === 'queued' || u.status === 'processing');
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const uploads = await api.uploads(date).catch(() => null);
      if (uploads) setDetail((d) => (d ? { ...d, uploads } : d));
      if (uploads && !uploads.some((u) => u.status === 'queued' || u.status === 'processing')) {
        load();
        onChanged();
      }
    }, 4000);
    return () => clearInterval(t);
  }, [pending, date, load, onChanged]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      await load();
      onChanged();
      if (ok) notify(ok);
    } catch (e) {
      // Duplicates and soft warnings can be overridden; imitation wording and a missing safety line cannot.
      if (e instanceof ApiError && e.code?.startsWith('duplicate')) setOverride('force');
      if (e instanceof ApiError && e.code === 'pack-warnings') setOverride('overrideWarnings');
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  if (!detail) {
    return (
      <div className="fixed inset-0 z-30 flex justify-end bg-black/60" onClick={onClose}>
        <div className="h-full w-full max-w-3xl bg-zinc-950 p-6">Loading…</div>
      </div>
    );
  }

  const { day, flow, issues, schedule: slot, uploads } = detail;
  const pack = day.pack;
  const m = pack?.metadata;
  const update = (patch: Parameters<typeof api.updateDay>[1], ok?: string) => act(() => api.updateDay(date, patch), ok);
  const dialogue = pack ? pack.clips.flatMap((c) => c.lines.map((l) => ({ text: l.text, character: findByPromptName(characters, l.speaker) }))) : [];
  const isMock = pack?.generatedBy === 'mock';
  const publishBlocked = isMock && !publishing.mockPublishAllowed;
  const availablePlatforms: Platform[] = ['youtube', 'instagram', ...(publishing.tiktok.enabled ? (['tiktok'] as Platform[]) : [])];

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/60" onClick={onClose}>
      <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start gap-3">
          <div>
            <div className="text-xs text-zinc-500">
              {new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {day.series && <span className="ml-2 rounded bg-pink-900/60 px-1.5 py-0.5 text-pink-200">{day.series} · Ep {day.episode}</span>}
            </div>
            <h2 className="text-2xl font-bold text-orange-400">{day.theme}</h2>
          </div>
          <button className="btn-ghost ml-auto" onClick={onClose}>✕</button>
        </div>

        {/* Workflow */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['idea', 'generated', 'uploaded'] as Status[]).map((s, i) => (
            <button key={s} disabled={busy} onClick={() => update({ status: s })} className={`btn ${day.status === s ? 'bg-orange-500 text-black' : 'bg-zinc-800 text-zinc-300'}`}>
              {i + 1}. {s === 'idea' ? '💡 Idea' : s === 'generated' ? '🎥 Generated in Flow' : '🚀 Uploaded'}
            </button>
          ))}
          <button disabled={busy} className="btn-ghost ml-auto" onClick={() => update({ locked: !day.locked }, day.locked ? 'Unlocked' : 'Locked 🔒')}>
            {day.locked ? '🔓 Unlock' : '🔒 Lock day'}
          </button>
        </div>

        {/* Plan */}
        <section className="card mb-4 space-y-3">
          <div>
            <label className="label">Concept</label>
            <textarea className="input min-h-16" value={concept} disabled={day.locked} onChange={(e) => setConcept(e.target.value)} />
            {concept !== day.concept && (
              <button className="btn-primary mt-2" disabled={busy} onClick={() => update({ concept }, 'Concept saved')}>Save concept</button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Cast (lead first)</label>
              <div className="flex flex-wrap gap-1">
                {characters.map((c) => {
                  const on = day.characterIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      disabled={busy || day.locked || (on && day.characterIds.length === 1) || (!on && day.characterIds.length >= 3)}
                      onClick={() => update({ characterIds: on ? day.characterIds.filter((id) => id !== c.id) : [...day.characterIds, c.id] })}
                      className={`btn px-2 py-1 text-xs ${on ? 'bg-orange-500 text-black' : 'bg-zinc-800 text-zinc-400'}`}
                    >
                      {c.vehicleType === 'bike' ? '🏍️' : '🏎️'} {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="label">Scene</label>
              <select className="input" disabled={busy || day.locked} value={day.sceneId} onChange={(e) => update({ sceneId: e.target.value })}>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button className="btn-primary" disabled={busy || day.locked} onClick={() => act(() => api.generateDay(date), 'Prompt pack ready 🎬')}>
            {busy ? 'Working…' : pack ? '🔄 Regenerate prompt pack' : '🎬 Generate prompt pack'}
          </button>
          {day.locked && <span className="ml-2 text-xs text-zinc-500">Unlock to edit or regenerate.</span>}
        </section>

        {pack && flow && (
          <>
            {isMock && (
              <div className="card mb-4 border-amber-700 text-sm text-amber-200">
                ⚠️ This pack comes from the offline demo templates. Use it to learn the workflow, but switch to a real AI provider in Settings before publishing: YouTube does not monetise channels built on generic templates.
              </div>
            )}
            {issues.length > 0 && (
              <div className="card mb-4 border-red-800">
                <h3 className="mb-1 font-bold text-red-300">Prompt checks ({issues.length})</h3>
                <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-200">
                  {issues.map((i) => <li key={i}>{i}</li>)}
                </ul>
              </div>
            )}

            {/* Flow prompts */}
            <section className="card mb-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="font-bold">🎬 Google Flow prompts</h3>
                <span className="text-xs text-zinc-500">{flow.clips.length} clips · ~{flow.totalSeconds}s · Portrait</span>
                <div className="ml-auto flex gap-2">
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => speak(dialogue)}>🔊 Preview voices</button>
                  <CopyButton text={flow.fullText} label="Copy production sheet" />
                </div>
              </div>
              <div className="mb-3 rounded-lg bg-sky-950/40 p-3 text-xs">
                <div className="mb-1 font-semibold text-sky-300">Before you generate</div>
                <ol className="list-decimal space-y-0.5 pl-5 text-zinc-300">
                  {flow.checklist.map((c) => <li key={c}>{c}</li>)}
                </ol>
              </div>
              <div className="space-y-3">
                {flow.clips.map((clip, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-black/40 p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-400">CLIP {i + 1}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${BEAT_STYLE[clip.beat] ?? ''}`}>{clip.beat}</span>
                      <span className="text-xs text-zinc-500">{clip.durationSec}s</span>
                      <span className="ml-auto"><CopyButton text={clip.text} label="Copy prompt" /></span>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-300">{clip.text}</pre>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-zinc-900 p-3 text-xs">
                <div className="mb-1 font-semibold text-zinc-300">✂️ Edit notes (not for Flow)</div>
                <ul className="list-disc space-y-0.5 pl-5 text-zinc-400">
                  {flow.editNotes.map((n) => <li key={n}>{n}</li>)}
                </ul>
                <details className="mt-2 text-zinc-500">
                  <summary className="cursor-pointer select-none">Negative prompt (Veo API only; Flow has no negative box)</summary>
                  <div className="mt-1 flex items-start gap-2">
                    <p className="flex-1">{flow.negativeNouns}</p>
                    <CopyButton text={flow.negativeNouns} />
                  </div>
                </details>
              </div>
            </section>

            {/* Publishing kit */}
            {m && (
              <section className="card mb-4 space-y-3 text-sm">
                <h3 className="font-bold">📦 Publishing kit</h3>
                <p className="text-xs text-zinc-500">
                  One upload reaches every country. English (UK) viewers see the en-GB title when one is needed.
                </p>
                <div className="flex items-start gap-2">
                  <div className="flex-1"><span className="label">YouTube title ({m.title.length}/60)</span>{m.title}</div>
                  <CopyButton text={m.title} />
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex-1 whitespace-pre-wrap"><span className="label">Description</span>{m.description}</div>
                  <CopyButton text={m.description} />
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex-1"><span className="label">Hashtags</span><span className="text-sky-300">{m.hashtags.join(' ')}</span></div>
                  <CopyButton text={m.hashtags.join(' ')} />
                </div>
                {m.enGB && (
                  <div className="rounded-lg bg-zinc-900 p-2 text-xs">
                    <span className="label">en-GB localisation (added automatically)</span>
                    <div>{m.enGB.title}</div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <div className="flex-1"><span className="label">Pinned comment (pin it in YouTube Studio)</span>{m.pinnedComment}</div>
                  <CopyButton text={m.pinnedComment} />
                </div>
                <div className="flex items-start gap-2">
                  <div className="flex-1 whitespace-pre-wrap"><span className="label">Instagram caption</span>{m.instagramCaption}</div>
                  <CopyButton text={m.instagramCaption} />
                </div>
                <p className="text-xs text-zinc-500">
                  After it goes live: pin the comment, and set the previous episode as the Related video in YouTube Studio.
                </p>
              </section>
            )}

            {/* Schedule */}
            <section className="card mb-4 text-sm">
              <h3 className="mb-2 font-bold">⏰ Publish time</h3>
              <p className="mb-2 text-xs text-zinc-400">
                Goes live at <b className="text-orange-300">{slot.slotUtc} UTC</b>, which is <b className="text-orange-300">{slot.yourTime}</b> your time. YouTube says posting time matters little for Shorts, so the app uses one global slot. Fine-tune it in Settings using YouTube Studio's "When your viewers are on YouTube" report.
              </p>
              <table className="w-full text-xs">
                <thead className="text-left text-zinc-500">
                  <tr><th className="py-1">Audience</th><th>Goes live (local)</th><th>Typical evening peak</th></tr>
                </thead>
                <tbody>
                  {slot.audiences.map((a) => (
                    <tr key={a.label} className="border-t border-zinc-800">
                      <td className="py-1">{a.label}</td>
                      <td>{a.localTime}</td>
                      <td className="text-zinc-500">{a.window}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* Publish */}
            <section className="card mb-4 space-y-3">
              <h3 className="font-bold">🚀 Publish</h3>
              <p className="text-xs text-zinc-500">
                Stitch the clips in Flow, follow the edit notes, export the MP4 and upload it here. YouTube gets the AI-content disclosure, the series playlist and the comment automatically.
              </p>
              {publishBlocked ? (
                <p className="text-sm text-amber-300">Publishing is disabled for demo-template packs. Switch to a real AI provider and regenerate this pack.</p>
              ) : (
                <>
                  <input type="file" accept="video/*" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {availablePlatforms.map((p) => (
                      <label key={p} className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={platforms.includes(p)}
                          onChange={(e) => setPlatforms(e.target.checked ? [...platforms, p] : platforms.filter((x) => x !== p))}
                        />
                        {p === 'youtube' ? 'YouTube Shorts' : p === 'instagram' ? 'Instagram Reels' : 'TikTok'}
                      </label>
                    ))}
                    <select className="input w-auto" value={schedule} onChange={(e) => setSchedule(e.target.value as 'slot' | 'now')}>
                      <option value="slot">At the daily slot ({slot.yourTime})</option>
                      <option value="now">Publish now</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className="btn-primary"
                      disabled={busy || !file || !platforms.length}
                      onClick={() =>
                        act(async () => {
                          setOverride(null);
                          const res = await api.publish(date, file!, platforms, schedule);
                          if (res.warnings.length) notify(`Queued, with warnings: ${res.warnings.join(' ')}`, true);
                        }, 'Upload queued 🚀')
                      }
                    >
                      {busy ? 'Sending…' : 'Upload'}
                    </button>
                    {override && (
                      <button
                        className="btn-danger"
                        disabled={busy || !file}
                        onClick={() =>
                          act(async () => {
                            await api.publish(date, file!, platforms, schedule, { [override]: true });
                            setOverride(null);
                          }, 'Upload queued 🚀')
                        }
                      >
                        {override === 'force' ? 'Upload anyway (duplicate)' : 'Upload anyway (I checked the warnings)'}
                      </button>
                    )}
                  </div>
                </>
              )}
              {uploads.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {uploads.map((u) => (
                    <li key={u.id} className={UPLOAD_STYLE[u.status]}>
                      {u.createdAt} · {u.platform} · <b>{u.status}</b>
                      {u.publishAt && <> · goes live {new Date(u.publishAt).toLocaleString()}</>}
                      {u.url && <> · <a className="underline" href={u.url} target="_blank" rel="noreferrer">open</a></>}
                      {u.error && <> · {u.error}</>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <section className="card">
          <label className="label">Notes</label>
          <textarea
            className="input min-h-16"
            defaultValue={day.notes}
            onBlur={(e) => e.target.value !== day.notes && update({ notes: e.target.value }, 'Notes saved')}
          />
        </section>
      </aside>
    </div>
  );
}
