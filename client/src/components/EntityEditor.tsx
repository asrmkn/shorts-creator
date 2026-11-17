import { useState, type ReactNode } from 'react';

export interface Field<T> {
  key: keyof T & string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'select' | 'tags';
  options?: string[];
  placeholder?: string;
}

interface Props<T extends Record<string, unknown>> {
  title: string;
  intro: ReactNode;
  items: Array<T & { id: string }>;
  fields: Field<T>[];
  empty: T;
  summary: (item: T) => ReactNode;
  heading: (item: T) => string;
  onSave: (item: T, id?: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  generator: ReactNode;
  notify: (t: string, e?: boolean) => void;
}

export default function EntityEditor<T extends Record<string, unknown>>({ title, intro, items, fields, empty, summary, heading, onSave, onDelete, generator, notify }: Props<T>) {
  const [editing, setEditing] = useState<{ id?: string; value: T } | null>(null);
  const [busy, setBusy] = useState(false);
  // In-app confirmation: native confirm() is silently blocked in VS Code's embedded browser.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await onDelete(id);
      setConfirmingId(null);
      if (editing?.id === id) setEditing(null);
      notify('Deleted');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await onSave(editing.value, editing.id);
      setEditing(null);
      notify('Saved');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {generator}
          <button className="btn-ghost" onClick={() => setEditing({ value: { ...empty } })}>＋ Add manually</button>
        </div>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-zinc-400">{intro}</p>

      {editing && (
        <div className="card mb-4 border-orange-700">
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => {
              const raw = editing.value[f.key];
              const v = Array.isArray(raw) ? raw.join(', ') : (raw as string | number);
              const set = (val: string) =>
                setEditing({
                  ...editing,
                  value: {
                    ...editing.value,
                    [f.key]: f.type === 'number' ? Number(val) : f.type === 'tags' ? val.split(',').map((x) => x.trim()).filter(Boolean) : val,
                  },
                });
              return (
                <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <label className="label">{f.label}</label>
                  {f.type === 'tags' ? (
                    <>
                      <input className="input" placeholder={f.placeholder} defaultValue={v} onBlur={(e) => set(e.target.value)} />
                      {f.options && <p className="mt-1 text-[10px] text-zinc-500">Choose from: {f.options.join(', ')}</p>}
                    </>
                  ) : f.type === 'textarea' ? (
                    <textarea className="input min-h-14" placeholder={f.placeholder} value={v} onChange={(e) => set(e.target.value)} />
                  ) : f.type === 'select' ? (
                    <select className="input" value={v} onChange={(e) => set(e.target.value)}>
                      {f.options!.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="input" type={f.type ?? 'text'} placeholder={f.placeholder} value={v ?? ''} onChange={(e) => set(e.target.value)} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={save}>Save</button>
            <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {!items.length && !editing && <div className="card text-sm text-zinc-400">Nothing here yet. Use the AI generator or add one manually.</div>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="card flex flex-col">
            <h3 className="mb-2 font-bold text-orange-300">{heading(item)}</h3>
            <div className="flex-1 space-y-1 text-xs text-zinc-300">{summary(item)}</div>
            <div className="mt-3 flex gap-2">
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing({ id: item.id, value: item })}>✏️ Edit</button>
              {confirmingId === item.id ? (
                <>
                  <span className="self-center text-xs text-red-300">Delete?</span>
                  <button className="btn-danger px-2 py-1 text-xs" disabled={busy} onClick={() => remove(item.id)}>✔ Yes</button>
                  <button className="btn-ghost px-2 py-1 text-xs" disabled={busy} onClick={() => setConfirmingId(null)}>✖ No</button>
                </>
              ) : (
                <button className="btn-danger px-2 py-1 text-xs" onClick={() => setConfirmingId(item.id)}>🗑 Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
