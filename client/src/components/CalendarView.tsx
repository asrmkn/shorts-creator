import { useCallback, useEffect, useState } from 'react';
import type { Character, DayPlan, Holiday, Scene, Settings } from '../../../shared/schemas';
import { api, type SettingsResponse } from '../api';
import DayDrawer from './DayDrawer';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_STYLE: Record<DayPlan['status'], string> = {
  idea: 'bg-sky-900/60 text-sky-200',
  generated: 'bg-amber-900/60 text-amber-200',
  uploaded: 'bg-emerald-900/60 text-emerald-200',
};
const STATUS_LABEL: Record<DayPlan['status'], string> = { idea: 'Idea', generated: 'Made in Flow', uploaded: 'Uploaded' };

const pad = (n: number) => String(n).padStart(2, '0');

interface Props {
  settings: Settings;
  publishing: SettingsResponse['publishing'];
  characters: Character[];
  scenes: Scene[];
  notify: (t: string, e?: boolean) => void;
  onNavigate: (v: 'characters' | 'scenes') => void;
}

export default function CalendarView({ settings, publishing, characters, scenes, notify, onNavigate }: Props) {
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [days, setDays] = useState<DayPlan[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmReplan, setConfirmReplan] = useState(false);
  const month = `${cursor.y}-${pad(cursor.m)}`;

  const load = useCallback(async () => {
    try {
      const res = await api.month(month);
      setDays(res.days);
      setHolidays(res.holidays);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }, [month, notify]);

  useEffect(() => {
    setConfirmReplan(false);
    load();
  }, [load]);

  const shift = (delta: number) => {
    const d = new Date(cursor.y, cursor.m - 1 + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const needsReplanConfirm = days.some((d) => !d.locked && d.pack);

  const generateMonth = () =>
    run('month', async () => {
      setConfirmReplan(false);
      const res = await api.generateMonth(month);
      setDays(res.days);
      notify(`Planned ${res.days.length} days ✨`);
    });

  const generatePacks = () =>
    run('packs', async () => {
      const res = await api.generatePacks(month);
      setDays(res.days);
      notify(res.errors.length ? `Done with ${res.errors.length} errors: ${res.errors[0].error}` : 'All prompt packs ready 🎬', res.errors.length > 0);
    });

  const first = new Date(cursor.y, cursor.m - 1, 1).getDay();
  const count = new Date(cursor.y, cursor.m, 0).getDate();
  const cells: Array<number | null> = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const missingSetup = !characters.length || !scenes.length;
  const stats = { total: days.length, packs: days.filter((d) => d.pack).length, uploaded: days.filter((d) => d.status === 'uploaded').length };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className="btn-ghost" onClick={() => shift(-1)}>◀</button>
        <h1 className="min-w-48 text-center text-2xl font-bold">
          {new Date(cursor.y, cursor.m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })}
        </h1>
        <button className="btn-ghost" onClick={() => shift(1)}>▶</button>
        <span className="ml-2 text-xs text-zinc-500">
          {stats.total} planned · {stats.packs} prompt packs · {stats.uploaded} uploaded
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {confirmReplan ? (
            <>
              <span className="self-center text-xs text-red-300">Replace ideas &amp; prompt packs on all unlocked days?</span>
              <button className="btn-danger" disabled={!!busy} onClick={generateMonth}>✔ Yes, re-plan</button>
              <button className="btn-ghost" onClick={() => setConfirmReplan(false)}>✖ Cancel</button>
            </>
          ) : (
            <button className="btn-primary" disabled={!!busy || missingSetup} onClick={() => (needsReplanConfirm ? setConfirmReplan(true) : generateMonth())}>
              {busy === 'month' ? 'Planning…' : days.length ? '🔄 Re-plan month' : '✨ Plan this month'}
            </button>
          )}
          <button className="btn-ghost" disabled={!!busy || !days.length} onClick={generatePacks}>
            {busy === 'packs' ? 'Writing prompts…' : '🎬 Generate all prompt packs'}
          </button>
          <a className="btn-ghost" href={`/api/months/${month}/export.csv`}>⬇ CSV</a>
          <a className="btn-ghost" href={`/api/months/${month}/export.pdf`}>⬇ PDF</a>
        </div>
      </div>

      {missingSetup && (
        <div className="card mb-4 border-orange-800 text-sm">
          Before planning a month, create your recurring cast and stunt locations:{' '}
          <button className="text-orange-400 underline" onClick={() => onNavigate('characters')}>Characters</button> and{' '}
          <button className="text-orange-400 underline" onClick={() => onNavigate('scenes')}>Scenes</button>. Each page has a one-click AI starter set.
        </div>
      )}

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className="px-1 pb-1 text-xs font-semibold text-zinc-400">
            {w} <span className="font-normal text-zinc-600">· {settings.weeklyThemes[i]}</span>
          </div>
        ))}
        {cells.map((n, i) => {
          if (!n) return <div key={i} />;
          const date = `${month}-${pad(n)}`;
          const plan = byDate.get(date);
          const hols = holidays.filter((h) => h.date === date);
          const lead = plan && characters.find((c) => c.id === plan.characterIds[0]);
          return (
            <button
              key={i}
              onClick={() => plan && setSelected(date)}
              className={`group flex min-h-32 flex-col rounded-lg border p-2 text-left transition ${
                date === today ? 'border-orange-500' : 'border-zinc-800'
              } ${plan ? 'bg-zinc-900 hover:border-zinc-500' : 'cursor-default bg-zinc-900/40'}`}
            >
              <div className="flex items-center gap-1">
                <span className={`text-sm font-bold ${date === today ? 'text-orange-400' : ''}`}>{n}</span>
                {plan?.locked && <span title="Locked">🔒</span>}
                {lead && <span className="text-xs">{lead.vehicleType === 'bike' ? '🏍️' : '🏎️'}</span>}
                {plan && <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[plan.status]}`}>{STATUS_LABEL[plan.status]}</span>}
              </div>
              {hols.map((h) => (
                <div key={h.name} className="mt-1 truncate text-[10px] text-pink-300" title={`${h.name} (${h.regions.join(', ')})`}>
                  🎉 {h.name} · {h.regions.join('/')}
                </div>
              ))}
              {plan ? (
                <>
                  <div className="mt-1 text-[11px] font-semibold text-orange-300">{plan.theme}</div>
                  {plan.series && <div className="text-[10px] text-pink-300">{plan.series} · Ep {plan.episode}</div>}
                  <div className="mt-0.5 line-clamp-3 text-xs text-zinc-300">{plan.concept}</div>
                  <div className="mt-auto pt-1 text-[10px] text-zinc-500">{plan.pack ? '🎬 prompt pack ready' : '💡 idea only'}</div>
                </>
              ) : (
                <div className="mt-auto text-[10px] text-zinc-600">—</div>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <DayDrawer
          date={selected}
          characters={characters}
          scenes={scenes}
          settings={settings}
          publishing={publishing}
          notify={notify}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
