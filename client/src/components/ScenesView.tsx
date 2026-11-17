import { useState } from 'react';
import { SCENE_FEATURES, type Scene, type SceneInput } from '../../../shared/schemas';
import { api } from '../api';
import EntityEditor, { type Field } from './EntityEditor';

const FIELDS: Field<SceneInput>[] = [
  { key: 'name', label: 'Name', placeholder: 'Desert Canyon Run' },
  { key: 'regionFlavor', label: 'Regional flavour', type: 'select', options: ['Global', 'US', 'UK', 'AU', 'CA', 'NZ'] },
  { key: 'location', label: 'Location (closed course or film set)', type: 'textarea' },
  { key: 'timeOfDay', label: 'Time of day' },
  { key: 'weather', label: 'Weather' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'cameraStyle', label: 'Camera style ideas' },
  { key: 'vibe', label: 'Vibe / mood', placeholder: 'spooky-fun retro carnival' },
  { key: 'ambient', label: 'Ambient sound', placeholder: 'cicadas buzzing, hot wind' },
  { key: 'setPieces', label: 'Set pieces (props & obstacles)', type: 'textarea', placeholder: 'a ramp through a giant clown head, cold-spark fountains, a foam pit' },
  { key: 'features', label: 'Features (decides which stunts fit)', type: 'tags', options: [...SCENE_FEATURES], placeholder: 'ramp, dirt, sparks' },
];

const EMPTY: SceneInput = { name: '', location: '', lighting: '', timeOfDay: '', weather: '', cameraStyle: '', regionFlavor: 'Global', setPieces: '', vibe: '', ambient: '', features: [] };

interface Props {
  scenes: Scene[];
  reload: () => Promise<void>;
  notify: (t: string, e?: boolean) => void;
}

export default function ScenesView({ scenes, reload, notify }: Props) {
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    try {
      const created = await api.generateScenes(scenes.length ? 4 : 8);
      await reload();
      notify(created.length ? `Added ${created.length} scenes` : 'No new scenes to add');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <EntityEditor<SceneInput>
      title="Scene & location library"
      intro="Blockbuster-style stunt locations that stop the scroll on their own. Each has set pieces the stunts can use (bus jumps, fire rings, foam pits) and a mood. Mix US, UK, Australian and Canadian/NZ settings so each region sees places it relates to. All stunts take place on closed courses."
      items={scenes}
      fields={FIELDS}
      empty={EMPTY}
      heading={(s) => `${s.name} · ${s.regionFlavor}`}
      summary={(s) => (
        <>
          {s.vibe && <p className="pb-1 text-sm font-semibold italic text-white">{s.vibe}</p>}
          <p>{s.location}</p>
          {s.setPieces && <p className="rounded-md bg-orange-950/50 px-2 py-1 text-orange-200">🎯 <b>Set pieces:</b> {s.setPieces}</p>}
          <p><b>When:</b> {s.timeOfDay}, {s.weather}</p>
          <p><b>Light:</b> {s.lighting}</p>
          <p><b>Camera:</b> {s.cameraStyle}</p>
          {s.ambient && <p><b>Sound:</b> {s.ambient}</p>}
          {s.features.length > 0 && <p className="text-zinc-500">Features: {s.features.join(', ')}</p>}
        </>
      )}
      onSave={async (s, id) => {
        await (id ? api.updateScene(id, s) : api.addScene(s));
        await reload();
      }}
      onDelete={async (id) => {
        await api.deleteScene(id);
        await reload();
      }}
      notify={notify}
      generator={<button className="btn-primary" disabled={busy} onClick={generate}>{busy ? 'Creating…' : scenes.length ? '✨ Suggest 4 more scenes' : '✨ Generate starter locations'}</button>}
    />
  );
}
