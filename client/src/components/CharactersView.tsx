import { useState } from 'react';
import type { Character, CharacterInput } from '../../../shared/schemas';
import { characterDescriptor, voiceDescriptor } from '../../../shared/flowPrompt';
import { api } from '../api';
import EntityEditor, { type Field } from './EntityEditor';

const FIELDS: Field<CharacterInput>[] = [
  { key: 'name', label: 'Display name (nickname allowed)', placeholder: 'Jax "Blaze" Rivera' },
  { key: 'promptName', label: 'Prompt name (one word, used in Flow)', placeholder: 'Jax' },
  { key: 'role', label: 'Role', placeholder: 'show-off stunt rider' },
  { key: 'age', label: 'Age (21+)', type: 'number' },
  { key: 'vehicleType', label: 'Vehicle type', type: 'select', options: ['bike', 'car'] },
  { key: 'helmet', label: 'Helmet', type: 'select', options: ['full-face', 'open-face', 'none'] },
  { key: 'appearance', label: 'Appearance: visual only (age range, build, hair, one stand-out detail)', type: 'textarea' },
  { key: 'outfit', label: 'Outfit, top to bottom (exact colours)', type: 'textarea' },
  { key: 'helmetLook', label: 'Helmet look', type: 'textarea', placeholder: 'a matte black full-face helmet with an orange mohawk fin' },
  { key: 'vehicle', label: 'Vehicle (colour, livery, one fun detail, no brands)', type: 'textarea' },
  { key: 'personality', label: 'Personality (story only, never in prompts)' },
  { key: 'catchphrase', label: 'Catchphrase (wins)' },
  { key: 'failLine', label: 'Fail line (funny fails)' },
  { key: 'voiceAccent', label: 'Voice accent', placeholder: 'American / British / Australian…' },
  { key: 'voiceDescription', label: 'Voice lock (gender & age, accent, pitch, pace, energy)', placeholder: "a young man's light voice with a London accent, quick and breathless" },
  { key: 'signatureMove', label: 'Signature move (Name: present-tense action)', type: 'textarea', placeholder: 'Phoenix Flip: launches off the ramp and backflips through a ring of cold-spark fountains' },
  { key: 'quirk', label: 'On-camera quirk (a short visible action)', type: 'textarea', placeholder: 'kisses his glove and points to the sky' },
  { key: 'backstory', label: 'Backstory (one line)', type: 'textarea' },
  { key: 'relationships', label: 'Relationships & rivalries', type: 'textarea' },
];

const EMPTY: CharacterInput = {
  name: '', promptName: '', role: '', age: 25, appearance: '', outfit: '', helmet: 'full-face', helmetLook: '', vehicle: '', vehicleType: 'bike', personality: '', catchphrase: '', failLine: '',
  voiceAccent: 'American', voiceDescription: '', signatureMove: '', quirk: '', backstory: '', relationships: '',
};

interface Props {
  characters: Character[];
  reload: () => Promise<void>;
  notify: (t: string, e?: boolean) => void;
}

export default function CharactersView({ characters, reload, notify }: Props) {
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const created = await api.generateCharacters(characters.length ? 3 : 6, brief);
      await reload();
      notify(created.length ? `Added ${created.length} characters` : 'No new characters to add. Try a brief, or switch to a real AI provider in Settings.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <EntityEditor<CharacterInput>
      title="Character bible"
      intro="Your recurring cast is what makes viewers come back. Give them big personalities that clash or play off each other (show-off, cool pro, clumsy rookie, lovable villain, wildcard), plus a signature move and a quirk viewers will remember. Their exact look, vehicle and voice are repeated in every prompt so Veo keeps them consistent."
      items={characters}
      fields={FIELDS}
      empty={EMPTY}
      heading={(c) => `${c.vehicleType === 'bike' ? '🏍️' : '🏎️'} ${c.name}`}
      summary={(c) => (
        <>
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">{c.role} · {c.age} · {c.voiceAccent}</p>
          <p className="py-1 text-base font-bold italic text-white">“{c.catchphrase}”</p>
          {c.signatureMove && (
            <p className="rounded-md bg-orange-950/50 px-2 py-1 text-orange-200">⚡ <b>Signature:</b> {c.signatureMove}</p>
          )}
          <p><b>Personality:</b> {c.personality}</p>
          {c.quirk && <p><b>Quirk:</b> {c.quirk}</p>}
          {c.backstory && <p><b>Backstory:</b> {c.backstory}</p>}
          {c.relationships && <p className="text-pink-200"><b>Drama:</b> {c.relationships}</p>}
          <details className="pt-1 text-zinc-400">
            <summary className="cursor-pointer select-none">Look & voice (used in every prompt)</summary>
            <p className="mt-1">{characterDescriptor(c as Character)}</p>
            <p className="mt-1">🎙 {voiceDescriptor(c as Character)}</p>
          </details>
        </>
      )}
      onSave={async (c, id) => {
        await (id ? api.updateCharacter(id, c) : api.addCharacter(c));
        await reload();
      }}
      onDelete={async (id) => {
        await api.deleteCharacter(id);
        await reload();
      }}
      notify={notify}
      generator={
        <>
          <input className="input w-72" placeholder="Optional brief, e.g. 'add a female motocross pro'" value={brief} onChange={(e) => setBrief(e.target.value)} />
          <button className="btn-primary" disabled={busy} onClick={generate}>{busy ? 'Creating…' : characters.length ? '✨ Add 3 more characters' : '✨ Generate starter cast'}</button>
        </>
      }
    />
  );
}
