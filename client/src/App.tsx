import { useCallback, useEffect, useState } from 'react';
import type { Character, Scene } from '../../shared/schemas';
import { api, type SettingsResponse } from './api';
import CalendarView from './components/CalendarView';
import CharactersView from './components/CharactersView';
import ScenesView from './components/ScenesView';
import SettingsView from './components/SettingsView';

type View = 'calendar' | 'characters' | 'scenes' | 'settings';
const TABS: Array<[View, string]> = [
  ['calendar', '📅 Calendar'],
  ['characters', '🧑‍🚀 Characters'],
  ['scenes', '🏜️ Scenes'],
  ['settings', '⚙️ Settings'],
];

export default function App() {
  const initial = (new URLSearchParams(location.search).get('view') as View) || 'calendar';
  const [view, setView] = useState<View>(initial);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), error ? 7000 : 3000);
  }, []);

  const reload = useCallback(async () => {
    try {
      const [s, c, sc] = await Promise.all([api.settings(), api.characters(), api.scenes()]);
      setSettings(s);
      setCharacters(c);
      setScenes(sc);
    } catch (e) {
      notify((e as Error).message, true);
    }
  }, [notify]);

  useEffect(() => {
    reload();
    if (new URLSearchParams(location.search).get('youtube') === 'connected') notify('YouTube connected ✅');
  }, [reload, notify]);

  const go = (v: View) => {
    setView(v);
    history.replaceState(null, '', v === 'calendar' ? '/' : `/?view=${v}`);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="text-lg font-black tracking-tight">
            <span className="text-orange-500">Stunt</span>Shorts Studio
          </div>
          <nav className="flex gap-1">
            {TABS.map(([id, label]) => (
              <button key={id} onClick={() => go(id)} className={`btn ${view === id ? 'bg-orange-500 text-black' : 'text-zinc-300 hover:bg-zinc-800'}`}>
                {label}
              </button>
            ))}
          </nav>
          {settings && (
            <div className="ml-auto text-xs text-zinc-500">
              AI: <span className="text-zinc-300">{settings.settings.provider}</span> · {settings.settings.userTimezone}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {settings && view === 'calendar' && <CalendarView settings={settings.settings} publishing={settings.publishing} characters={characters} scenes={scenes} notify={notify} onNavigate={go} />}
        {view === 'characters' && <CharactersView characters={characters} reload={reload} notify={notify} />}
        {view === 'scenes' && <ScenesView scenes={scenes} reload={reload} notify={notify} />}
        {settings && view === 'settings' && <SettingsView data={settings} reload={reload} notify={notify} />}
      </main>

      {toast && (
        <div className={`fixed bottom-4 left-1/2 z-50 max-w-xl -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${toast.error ? 'bg-red-700' : 'bg-emerald-700'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
