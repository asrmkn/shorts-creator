import type { Character, DayPack, DayPlan, FlowModel, Scene, Settings } from './schemas';

export const SAFETY_LINE = '🎬 AI-generated fiction (made with Google Flow). Fictional riders on closed sets. Never try these stunts.';
export const STYLE_LOCK =
  'Photorealistic live-action 4K motorsport footage shot on RED V-Raptor 8K VV, natural skin pores, realistic racing fabric weave, physically accurate suspension and tire smoke, natural motion blur';
/** Flow has no negative-prompt box, so exclusions go inline as a short "No X" phrase (Omni prompt guide). */
export const EXCLUSION_LINE = 'No CGI, 3D animation, cartoon, plastic skin, subtitles or on-screen text.';
export const NEGATIVE_NOUNS =
  'cartoon, 3d render, cgi, anime, video game, plastic skin, toy vehicle, neon underglow, subtitles, captions, on-screen text, title card, watermark, extra riders, duplicated vehicles, extra wheels, warped wheels, distorted hands, melted faces, mismatched lip movement, background music';
export const CAR_STUNT_HELMET = 'a plain white FIA full-face racing helmet';

export interface ModelProfile {
  label: string;
  durations: number[];
  singleShotLine: string;
  notes: string[];
}

export const MODEL_PROFILES: Record<FlowModel, ModelProfile> = {
  'omni-flash-1.2': {
    label: 'Omni Flash 1.2',
    durations: Array.from({ length: 13 }, (_, i) => i + 3),
    // Omni makes multi-shot videos by default.
    singleShotLine: 'Single continuous shot, no scene cuts.',
    notes: ['Omni Flash 1.2 clips can be 3-15 s (over 10 s needs a Google AI Plus, Pro or Ultra plan).'],
  },
  'veo-3.1-lite': {
    label: 'Veo 3.1 Lite',
    durations: [4, 6, 8],
    singleShotLine: '',
    notes: ['Veo 3.1 Lite clips must be 4, 6 or 8 s. In Ingredients mode every clip is 8 s, so trim in Scenebuilder.'],
  },
};

export const BRAND_PATTERN =
  /\b(go ?pro|jumbotron|red ?bull|monster energy|ducati|yamaha|honda|kawasaki|suzuki|ktm|harley|bmw|toyota|nissan|subaru|mitsubishi|ford|mustang|chevrolet|chevy|dodge|porsche|ferrari|lamborghini|tesla|nike|adidas)\b/i;
export const IMITATION_PATTERN = /would you (try|do)|(?<!(never|don'?t|do not) )try (this|it)\b|you could do|if you'?d do it|you can do it too/i;
export const HARM_PATTERN = /\b(blood|bloody|injur\w*|crash(es|ed)?|sabotag\w*|explod\w*|on fire)\b/i;
const SPOKEN_QUIRK = /\b(whisper\w*|narrat\w*|says?|shouts?|sings?|yells?)\b/i;

/** Strips quotation marks (they make Veo render captions) and collapses whitespace. */
export const clean = (s: string) => s.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
export const countWords = (s: string) => clean(s).split(' ').filter(Boolean).length;
/** Max spoken words that fit naturally in a clip (~2.2 words per second, minus breathing room). */
export const wordBudget = (seconds: number) => Math.floor(2.2 * seconds) - 2;
export const CTA_MAX_WORDS = 8;
export const isSpokenQuirk = (quirk: string) => SPOKEN_QUIRK.test(quirk);

export function promptNameOf(c: Pick<Character, 'promptName' | 'name'>): string {
  return clean(c.promptName) || clean(c.name).split(' ')[0];
}

export function findByPromptName(characters: Character[], name: string): Character | undefined {
  const n = clean(name).toLowerCase();
  return characters.find((c) => promptNameOf(c).toLowerCase() === n) ?? characters.find((c) => clean(c.name).toLowerCase() === n);
}

/** "Phoenix Flip: launches off..." -> { name: 'Phoenix Flip', description: 'launches off...' } */
export function splitMove(move: string): { name: string; description: string } {
  const m = clean(move).replace(/^the\s+/i, '');
  const i = m.indexOf(':');
  return i > 0 ? { name: m.slice(0, i).trim(), description: m.slice(i + 1).trim() } : { name: '', description: m };
}

const FUNCTION_WORDS = /\s+(a|an|the|and|or|with|of|on|in|to|over|under|for|at|by)$/i;
/** Shortens a phrase to roughly `max` words, cutting at the last comma and never ending on a function word. */
export function shortPhrase(text: string, max: number): string {
  const words = clean(text).split(' ');
  if (words.length <= max) return clean(text);
  let cut = words.slice(0, max).join(' ');
  const comma = cut.lastIndexOf(',');
  if (comma > cut.length / 3) cut = cut.slice(0, comma);
  else {
    // No usable comma: cut before the last "and"/"with" so the phrase stays complete.
    const joint = Math.max(cut.lastIndexOf(' and '), cut.lastIndexOf(' with '));
    if (joint > cut.length / 3) cut = cut.slice(0, joint);
  }
  while (FUNCTION_WORDS.test(cut)) cut = cut.replace(FUNCTION_WORDS, '');
  return cut.replace(/[,;]$/, '');
}

/** Removes items worn on the head (sunglasses pushed up, caps) when a helmet goes on. */
const withoutHeadwear = (s: string) => s.replace(/,?\s*(and\s+)?[^,]*\bon (her|his|their) head\b/gi, '').replace(/\s+,/g, ',');

export function visualLock(c: Character, helmetOn: boolean): string {
  const outfit = helmetOn ? withoutHeadwear(clean(c.outfit)) : clean(c.outfit);
  const base = `${clean(c.appearance)}, wearing ${outfit}`;
  if (c.helmet === 'none' || !c.helmetLook) return helmetOn && c.vehicleType === 'car' ? `${base}, and ${CAR_STUNT_HELMET}` : base;
  return helmetOn ? `${base}, and ${clean(c.helmetLook)}` : `${base}, holding ${clean(c.helmetLook)} under one arm`;
}

/** Short anchor used with Flow Characters (@Name) so the text doesn't fight the reference images. */
export function ingredientLock(c: Character, helmetOn: boolean): string {
  const outfit = shortPhrase(helmetOn ? withoutHeadwear(clean(c.outfit)) : c.outfit, 12);
  const helmet = helmetOn ? (c.helmetLook ? `, wearing ${clean(c.helmetLook)}` : c.vehicleType === 'car' ? `, wearing ${CAR_STUNT_HELMET}` : '') : '';
  return `@${promptNameOf(c)} in ${outfit}${helmet}`;
}

export function vehicleLock(c: Character): string {
  const v = clean(c.vehicle);
  if (/unbranded/i.test(v)) return v;
  return /^(an?|the)\s/i.test(v) ? v.replace(/^(an?|the)\s+/i, 'an unbranded ') : `an unbranded ${v}`;
}

export function voiceLock(c: Character): string {
  const desc = clean(c.voiceDescription).replace(/^(an?|the)\s+/i, '');
  const accent = clean(c.voiceAccent);
  const accentWords = accent.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
  const body = accentWords.some((w) => desc.toLowerCase().includes(w)) ? desc : `${desc}, ${accent} accent`;
  return `${/^[aeiou]/i.test(body) ? 'an' : 'a'} ${body}`;
}

export function sceneLock(s: Scene): string {
  const lighting = clean(s.lighting);
  const time = clean(s.timeOfDay);
  // Avoid "sunrise, ..., warm sunrise light" style repetition.
  const parts = [clean(s.location), lighting.toLowerCase().includes(time.toLowerCase()) ? '' : time, clean(s.weather), lighting].filter(Boolean);
  return parts.join(', ');
}

/** Kept for UI summaries; prompts use the beat-aware locks above. */
export function characterDescriptor(c: Character): string {
  return `${promptNameOf(c)}: ${visualLock(c, false)}; ${c.vehicleType === 'bike' ? 'rides' : 'drives'} ${vehicleLock(c)}`;
}
export const voiceDescriptor = voiceLock;

const POSITIONS: Record<number, string[]> = { 1: ['Centred'], 2: ['On the left', 'On the right'], 3: ['On the left', 'In the centre', 'On the right'] };

export interface FlowClip {
  beat: string;
  durationSec: number;
  text: string;
}

export interface FlowPrompt {
  clips: FlowClip[];
  checklist: string[];
  editNotes: string[];
  negativeNouns: string;
  totalSeconds: number;
  fullText: string;
}

function framing(names: string[]): string {
  if (names.length === 1) return `vertical framing with ${names[0]} centred`;
  if (names.length === 2) return `vertical framing, ${names[0]} on the left and ${names[1]} on the right, close together in the centre of frame`;
  return `vertical framing, ${names.join(', ')} grouped tightly in the centre of frame`;
}

/**
 * Builds one self-contained Flow prompt per clip in a fixed order: shot, setting, subjects (only those
 * on screen), one action, dialogue (no quotes), split audio, style, exclusions.
 */
export function buildFlowPrompt(
  plan: DayPlan,
  characters: Character[],
  scene: Scene | undefined,
  model: FlowModel,
  mode: Settings['characterMode'] = 'text',
): FlowPrompt | null {
  const pack = plan.pack;
  if (!pack) return null;
  const profile = MODEL_PROFILES[model];
  const lead = characters.find((c) => c.id === plan.characterIds[0]);

  const clips = pack.clips.map((clip) => {
    const subjects = clip.onScreen.map((n) => findByPromptName(characters, n)).filter((c): c is Character => !!c);
    const helmetOn = clip.beat === 'stunt';
    const positions = POSITIONS[subjects.length] ?? POSITIONS[1];
    const subjectLines = subjects.map((c, i) => {
      const isLead = c.id === lead?.id;
      // Keep the lead's vehicle in all 4 clips so the scene and vehicle never vanish between clips.
      const vehicle = !isLead
        ? ''
        : clip.beat === 'stunt'
          ? `, ${c.vehicleType === 'bike' ? 'riding' : 'driving'} ${vehicleLock(c)}`
          : clip.beat === 'setup'
            ? `, with ${vehicleLock(c)} idling at the start mark behind`
            : `, standing beside ${vehicleLock(c)} stopped in the run-off zone`;
      const look = mode === 'ingredients' ? ingredientLock(c, helmetOn) : `${promptNameOf(c)}: ${visualLock(c, helmetOn)}`;
      return `${positions[i] ?? 'Nearby'}, ${look}${vehicle}.`;
    });
    const dialogue = clip.lines.length
      ? clip.lines.map((l) => {
          const c = findByPromptName(characters, l.speaker);
          const voice = c ? ` in ${voiceLock(c)}` : '';
          return `${c ? promptNameOf(c) : clean(l.speaker)} says${voice}${l.emotion ? `, ${clean(l.emotion)}` : ''}: ${clean(l.text)}`;
        })
      : [clip.beat === 'stunt' ? 'No spoken words.' : 'No dialogue.'];
    // Keep set pieces in all 4 clips so background landmarks never disappear between clips.
    const setPieces = clean(pack.stuntSet);
    const setting = [
      `Setting (same exact location, camera direction and lighting across all 4 clips): ${scene ? sceneLock(scene) : 'a closed stunt course'}.`,
      setPieces ? ` Set pieces: ${setPieces}.` : '',
      pack.dressing ? ` Decorations: ${clean(pack.dressing)}.` : '',
    ].join('');
    const names = subjects.map(promptNameOf);
    const lines = [
      `${clean(clip.shotSize)}, ${clean(clip.angle)}, ${clean(clip.movement)}${clip.lens ? `, ${clean(clip.lens)}` : ''}.${profile.singleShotLine ? ` ${profile.singleShotLine}` : ''}`,
      setting,
      ...(clip.startFrame ? [`Start frame (0.0s): ${clean(clip.startFrame)}`] : []),
      ...(clip.continuity ? [`Continuity: ${clean(clip.continuity)}`] : []),
      ...subjectLines,
      `Action: ${clean(clip.action)}`,
      ...(clip.endFrame ? [`End frame (${clip.durationSec}.0s): ${clean(clip.endFrame)}`] : []),
      ...dialogue,
      `Audio: SFX: ${clean(clip.sfx)}. Ambient: ${clean(scene?.ambient || 'open outdoor air')}. Music: none.`,
      `Style: ${STYLE_LOCK}, ${framing(names.length ? names : ['the subject'])}.`,
      EXCLUSION_LINE,
    ];
    return { beat: clip.beat, durationSec: clip.durationSec, text: lines.join('\n') };
  });

  const cast = plan.characterIds.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c);
  const totalSeconds = pack.clips.reduce((s, c) => s + c.durationSec, 0);
  const hasFrameAnchors = pack.clips.every((c) => c.startFrame && c.endFrame);
  const checklist = [
    `In Flow, choose ${profile.label}, set the orientation to Portrait (9:16), and set each clip to the length shown (8s, 8s, 6s, 4s).`,
    mode === 'ingredients'
      ? `Add your Flow Characters ${cast.map((c) => `@${promptNameOf(c)}`).join(' and ')} as ingredients for every clip (1-2 reference images on a plain background plus a saved voice each).`
      : `Generate each clip from text. For even better consistency, create Flow Characters for ${cast.map(promptNameOf).join(' and ')} and switch Settings to Ingredients mode.`,
    hasFrameAnchors
      ? 'For strict clip-to-clip continuity: after generating Clip 1, click Save frame on its final frame and use Frames to Video (or Extend / Jump to in Scenebuilder) as the start frame for Clip 2, then repeat for Clips 3 and 4.'
      : 'Do not chain clips with Save frame: helmets, positions and props change between beats, and the frame would contradict the prompt.',
    ...profile.notes,
  ];
  const editNotes = [
    ...(pack.hookText ? [`Cold open: move ${clean(pack.hookVisual) || 'the peak of the stunt'} (about 1.5 s) to frame 0 and overlay the text: ${pack.hookText}`] : []),
    'Add a small "AI-generated fiction" badge for the first 2 seconds.',
    'Add one music bed across the whole Short from the YouTube Audio Library. Clips are generated with music off.',
    ...pack.editNotes,
  ];
  const body = clips.map((c, i) => `--- CLIP ${i + 1} of ${clips.length} · ${c.beat.toUpperCase()} · ${c.durationSec}s ---\n${c.text}`).join('\n\n');
  const fullText = [
    `${plan.date} · ${plan.theme}${plan.series ? ` · ${plan.series} · Ep ${plan.episode}` : ''} · ~${totalSeconds}s Short`,
    `Concept: ${clean(plan.concept)}`,
    '',
    'BEFORE YOU GENERATE',
    ...checklist.map((c) => `- ${c}`),
    '',
    body,
    '',
    'EDIT NOTES (do not paste into Flow)',
    ...editNotes.map((n) => `- ${n}`),
    '',
    `Veo API negativePrompt field only (Flow has no negative box): ${pack.negativeNouns || NEGATIVE_NOUNS}`,
  ].join('\n');
  return { clips, checklist, editNotes, negativeNouns: pack.negativeNouns || NEGATIVE_NOUNS, totalSeconds, fullText };
}

/** Returns human-readable problems; an empty list means the pack follows every Flow and Shorts rule. */
export function validatePack(pack: DayPack, characters: Character[], model: FlowModel, scene?: Scene): string[] {
  const issues: string[] = [];
  const profile = MODEL_PROFILES[model];
  const known = (n: string) => !!findByPromptName(characters, n);

  pack.clips.forEach((clip, i) => {
    const at = `Clip ${i + 1} (${clip.beat})`;
    if (!profile.durations.includes(clip.durationSec)) issues.push(`${at}: ${clip.durationSec}s is not a valid ${profile.label} length (${profile.durations.join(', ')}).`);
    const words = clip.lines.reduce((s, l) => s + countWords(l.text), 0);
    if (words > wordBudget(clip.durationSec)) issues.push(`${at}: ${words} spoken words do not fit in ${clip.durationSec}s (max ${wordBudget(clip.durationSec)}).`);
    if (clip.beat === 'stunt' && clip.lines.length) issues.push(`${at}: no dialogue during the stunt (faces are hidden by helmets); use a non-verbal sound in SFX.`);
    for (const n of clip.onScreen) if (!known(n)) issues.push(`${at}: "${n}" on screen is not a character in the cast bible.`);
    for (const l of clip.lines) {
      if (!clip.onScreen.some((n) => n.toLowerCase() === clean(l.speaker).toLowerCase())) issues.push(`${at}: speaker ${l.speaker} is not on screen.`);
    }
    if (/\bthen\b/i.test(clip.movement)) issues.push(`${at}: use one camera movement per clip ("${clip.movement}").`);
    if (/\bthen\b/i.test(clip.action)) issues.push(`${at}: one action beat per clip; split "then" sequences into separate clips.`);
    if (countWords(clip.action) > 45) issues.push(`${at}: the action is too long for one beat (${countWords(clip.action)} words, max 45).`);
    for (const name of clip.onScreen) {
      const quirkSpoken = new RegExp(`\\b${name}\\b[^.;]*\\b(whisper\\w*|narrat\\w*|shouts?|sings?|yells?)\\b`, 'i').test(clip.action);
      if (quirkSpoken && !clip.lines.some((l) => clean(l.speaker).toLowerCase() === name.toLowerCase()))
        issues.push(`${at}: ${name} speaks in the action but has no dialogue line, so the model will invent words.`);
    }
    const promptText = [clip.action, clip.sfx, clip.continuity, ...clip.lines.map((l) => l.text)].join(' ');
    if (/["“”]/.test(promptText)) issues.push(`${at}: remove quotation marks (they make Veo render captions).`);
    if (BRAND_PATTERN.test(promptText)) issues.push(`${at}: contains a real brand name (${promptText.match(BRAND_PATTERN)![0]}).`);
    if (HARM_PATTERN.test(promptText)) issues.push(`${at}: wording may trip safety filters (${promptText.match(HARM_PATTERN)![0]}).`);
  });

  // Character, vehicle and scene text is pasted into prompts too.
  const castText = [...new Set(pack.clips.flatMap((c) => c.onScreen))]
    .map((n) => findByPromptName(characters, n))
    .filter((c): c is Character => !!c)
    .map((c) => `${c.appearance} ${c.outfit} ${c.helmetLook} ${c.vehicle}`)
    .join(' ');
  const sceneText = scene ? `${scene.location} ${scene.setPieces} ${scene.lighting} ${scene.ambient}` : '';
  const assets = `${castText} ${sceneText} ${pack.stuntSet} ${pack.dressing}`;
  if (BRAND_PATTERN.test(assets)) issues.push(`Character or scene text contains a real brand name (${assets.match(BRAND_PATTERN)![0]}).`);
  if (HARM_PATTERN.test(assets)) issues.push(`Character or scene text may trip safety filters (${assets.match(HARM_PATTERN)![0]}).`);

  const cta = pack.clips.at(-1);
  if (cta?.beat === 'cta') {
    if (cta.onScreen.length !== 1) issues.push('CTA clip: show only the speaker.');
    const words = countWords(cta.lines[0]?.text ?? '');
    if (words > CTA_MAX_WORDS) issues.push(`CTA clip: ${words} words (max ${CTA_MAX_WORDS}).`);
  }

  const m = pack.metadata;
  const allMeta = [m.title, m.description, m.instagramCaption, m.pinnedComment, ...pack.clips.flatMap((c) => c.lines.map((l) => l.text))].join(' ');
  if (IMITATION_PATTERN.test(allMeta)) issues.push(`Wording invites viewers to copy the stunt ("${allMeta.match(IMITATION_PATTERN)![0]}"); use a judging prompt such as "Rate the landing 1-10".`);
  if (m.title.length > 55) issues.push(`Title is ${m.title.length} characters (aim for 50 or fewer so it isn't cut off on phones).`);
  if (m.hashtags.length > 3) issues.push(`YouTube: ${m.hashtags.length} hashtags (max 3).`);
  if (m.instagramHashtags.length > 5) issues.push(`Instagram: ${m.instagramHashtags.length} hashtags (Instagram allows 5).`);
  if (m.instagramHashtags.some((h) => /^#?shorts$/i.test(h))) issues.push('Instagram: remove #Shorts.');
  if (!m.description.includes(SAFETY_LINE)) issues.push('Description is missing the AI-fiction safety line.');
  return issues;
}

/** Issues serious enough to block publishing (the rest are warnings). */
export function blockingIssues(issues: string[]): string[] {
  return issues.filter((i) => /copy the stunt|safety line|brand name|safety filters/i.test(i));
}
