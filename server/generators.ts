import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CharacterInputSchema,
  DayPackSchema,
  MonthOutlineSchema,
  SCENE_FEATURES,
  SceneInputSchema,
  type Character,
  type DayPack,
  type DayPlan,
  type OutlineDay,
  type Scene,
  type Settings,
} from '../shared/schemas';
import { daysInMonth, holidaysForMonth, isoDate, seasonNote, toSpelling, weekday } from '../shared/regional';
import {
  MODEL_PROFILES,
  NEGATIVE_NOUNS,
  SAFETY_LINE,
  clean,
  promptNameOf,
  sceneLock,
  validatePack,
  vehicleLock,
  visualLock,
  voiceLock,
} from '../shared/flowPrompt';
import { createProvider, extractJson, type LLMProvider } from './llm/provider';
import { MOCK_CHARACTERS, MOCK_SCENES, mockDayPack, mockOutline } from './llm/mock';
import type { Store } from './db';

/** Errors caused by the user's input/state; reported as HTTP 400. */
export class UserError extends Error {}

const SYSTEM = `You are the showrunner and Google Veo 3.1 Lite technical director for a photorealistic live-action YouTube Shorts motorsport channel.
Videos are generated clip by clip in Google Flow (Veo 3.1 Lite / Omni Flash, 9:16 vertical) with native audio and spoken dialogue, chained via Save Frame / Frames-to-Video.
Visual mandate: 100% grounded, photorealistic live-action motorsport cinematography (Red Bull / Gymkhana / Goodwood / X-Games realism). Never use cartoon, toy, sci-fi, neon-underglow, or fantasy props.
Audience: teens and adults (13+) who love motorsport, in the US, UK, Australia, Canada and New Zealand.
Hard rules: fictional adult riders (21+) on closed proving grounds with safety barriers; nobody stands in a vehicle's path; no public roads or traffic; no injuries, crashes, blood or sabotage;
fire is always stage-safe cold-spark fountains; no homemade or DIY equipment; no real brand names, logos or trademarks; never invite viewers to try the stunts.
Always return strictly valid JSON matching the requested shape, and never use double quotation marks inside string values.`;

export function providerFor(settings: Settings): LLMProvider {
  return createProvider(settings.provider, settings.model);
}

async function askJson<T>(provider: LLMProvider, user: string, schema: z.ZodType<T>, check?: (value: T) => string[]): Promise<T> {
  let prompt = user;
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await provider.complete({ system: SYSTEM, user: prompt });
    try {
      const value = schema.parse(extractJson(raw));
      const problems = check?.(value) ?? [];
      if (!problems.length) return value;
      lastError = problems.join(' | ');
    } catch (err) {
      lastError = err instanceof z.ZodError ? JSON.stringify(err.issues.slice(0, 8)) : String(err);
    }
    prompt = `${user}\n\nYour previous answer had these problems: ${lastError}\nFix every problem and return the corrected JSON only.`;
  }
  throw new Error(`AI response failed validation: ${lastError}`);
}

export async function generateCharacters(settings: Settings, count: number, brief: string, existing: Character[] = []): Promise<Character[]> {
  const provider = providerFor(settings);
  const taken = new Set(existing.map((c) => c.name));
  if (provider.name === 'mock') return MOCK_CHARACTERS.filter((c) => !taken.has(c.name)).slice(0, count).map((c) => ({ ...CharacterInputSchema.parse(c), id: randomUUID() }));
  const out = await askJson(
    provider,
    `Create ${count} recurring characters for the stunt Shorts channel "${settings.channelName}". Brief: ${brief || settings.channelBrief}
${existing.length ? `Existing cast (do not duplicate; give the new characters relationships with them): ${existing.map((c) => `${c.name} (${c.role})`).join('; ')}` : ''}
Make them ENTERTAINING and instantly memorable, grounded in live-action motorsport realism:
- Contrasting paddock personalities (the show-off FMX pro, the ice-cool drift champion, the scrappy rookie, the smug rival captain, the data-driven race engineer, the veteran rally legend). Avoid cartoon or toy tropes.
- All characters are adults aged 21 or older with realistic human features, FIA/FIM-grade race suits or riding gear, and mechanically authentic unbranded stunt bikes/cars.
- promptName: a single first name with no quotes or nickname (used inside video prompts). name: display name, nickname allowed.
- appearance (age range, build, skin, hair, one stand-out face detail) and outfit (top to bottom) must be purely visual, 35-60 words combined, no personality words, no numbers like engine size.
- helmet: "full-face", "open-face" or "none" (car drivers usually none). helmetLook: the helmet's exact look, or empty.
- vehicle: colour, livery and one fun detail, 15-25 words, no real brands. vehicleType: "bike" or "car".
- voiceDescription: 12-20 words in this order: gender and age, ONE accent, pitch and timbre, pace, default energy. voiceAccent: the accent name.
- signatureMove: "Move Name: present-tense verb phrase", e.g. "Phoenix Flip: launches off the ramp and backflips through a ring of cold-spark fountains". Stage-safe effects only.
- quirk: a concrete present-tense action Veo can render in under 3 seconds (e.g. "sips from an iced coffee cup").
- catchphrase (2-6 words, for wins) and failLine (2-6 words, for funny fails), family-friendly.
- backstory: one funny line. relationships: rivalries, friendships and mentors within the cast.
Return {"characters":[{"name","promptName","role","age","appearance","outfit","helmet","helmetLook","vehicle","vehicleType","personality","catchphrase","failLine","voiceAccent","voiceDescription","signatureMove","quirk","backstory","relationships"}]}`,
    z.object({ characters: z.array(CharacterInputSchema).min(1) }),
  );
  return out.characters.map((c) => ({ ...c, id: randomUUID() }));
}

export async function generateScenes(settings: Settings, count: number, existing: Scene[]): Promise<Scene[]> {
  const provider = providerFor(settings);
  const taken = new Set(existing.map((s) => s.name));
  if (provider.name === 'mock')
    return MOCK_SCENES.filter((s) => !taken.has(s.name)).slice(0, count).map((s) => ({ ...SceneInputSchema.parse(s), id: randomUUID() }));
  const out = await askJson(
    provider,
    `Suggest ${count} new SPECTACULAR closed-course stunt locations for vertical Shorts. Avoid these existing ones: ${[...taken].join(', ') || 'none'}.
Each location should be a photorealistic, real-world closed motorsport proving ground or film lot (e.g. a volcanic-gravel quarry rally stage, a floodlit container-port pier, a desert proving ground, a rain-soaked docklands film lot, an outback station track, a frozen-lake ice track, an indoor supercross stadium).
- location: describe it as a closed proving ground or film set with a clear background landmark visible in every clip. No public roads.
- lighting: include the Kelvin colour temperature and light direction so lighting stays consistent across all 4 clips.
- setPieces: 2-4 physical props or obstacles the stunts can use (ramps, curved walls, shallow water, cold-spark fountains, foam pits, cones).
- features: the matching tags from ${JSON.stringify(SCENE_FEATURES)}.
- ambient: the constant background sound in a few words (e.g. "cicadas buzzing, hot wind"). Include a crowd only if the location has spectators.
- vibe: the mood in a few words. Dramatic lighting and weather. cameraStyle ideas suited to 9:16 framing.
- Mix places that feel local to US, UK, Australian, Canadian and NZ viewers with global ones. No real brands or trademarks (say "helmet-mounted action camera", "giant video screen").
Return {"scenes":[{"name","location","lighting","timeOfDay","weather","cameraStyle","regionFlavor":"US"|"UK"|"AU"|"CA"|"NZ"|"Global","setPieces","features","ambient","vibe"}]}`,
    z.object({ scenes: z.array(SceneInputSchema).min(1) }),
  );
  return out.scenes.map((s) => ({ ...s, id: randomUUID() }));
}

export async function generateMonth(store: Store, year: number, month: number): Promise<DayPlan[]> {
  const settings = store.getSettings();
  const characters = store.listCharacters();
  const scenes = store.listScenes();
  if (!characters.length || !scenes.length) throw new UserError('Create at least one character and one scene first.');

  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const existing = new Map(store.listDays(prefix).map((d) => [d.date, d]));
  const dates = Array.from({ length: daysInMonth(year, month) }, (_, i) => isoDate(year, month, i + 1)).filter((d) => !existing.get(d)?.locked);
  if (!dates.length) return store.listDays(prefix);
  const themes = dates.map((d) => settings.weeklyThemes[weekday(d)]);
  const history = store.recentHistory(`${prefix}-01`, 60);
  const locked = [...existing.values()].filter((d) => d.locked);
  const holidays = holidaysForMonth(year, month);
  const avoidKeys = [...history.stuntKeys, ...locked.map((d) => d.stuntKey)];
  const avoidConcepts = [...history.concepts, ...locked.map((d) => d.concept)];

  const provider = providerFor(settings);
  let outline: OutlineDay[];
  if (provider.name === 'mock') {
    outline = mockOutline(dates, themes, characters, scenes, { concepts: avoidConcepts, stuntKeys: avoidKeys }, holidays);
  } else {
    const res = await askJson(
      provider,
      `Plan one stunt Short per day for these dates, as weekly story arcs.
Channel brief: ${settings.channelBrief}
Season: ${seasonNote(month)}
Holidays (make that day a themed special): ${holidays.map((h) => `${h.date} ${h.name} (${h.regions.join('/')})`).join('; ') || 'none'}
Characters (use ids): ${characters.map((c) => `${c.id} = ${promptNameOf(c)}, ${c.role}, ${c.vehicleType}${c.signatureMove ? `, signature move ${clean(c.signatureMove)}` : ''}${c.relationships ? `, relationships: ${c.relationships}` : ''}`).join('; ')}
Scenes (use ids): ${scenes.map((s) => `${s.id} = ${s.name} (features: ${s.features.join(', ') || 'none'}; set pieces: ${s.setPieces || 'none'})`).join('; ')}
Dates and themes: ${dates.map((d, i) => `${d}: ${themes[i]}`).join('; ')}
Rules:
- Each week is a series: a recurring rivalry between two characters (series = "A vs B"), with an episode number for days that feature both, building to a payoff on Showdown day. Other days can feature other cast members (series empty, episode 0).
- Each concept: ONE stunt that physically fits the scene's features and set pieces, plus "Twist:" a mini-story (bets, harmless pranks such as a rubber chicken, stolen trophies, copycats who fail into foam blocks, near-misses). Copy/one-up twists only between characters with the same vehicle type.
- stuntKey: a short normalised id of the trick, e.g. "bike:backflip" or "car:j-turn". Never reuse these recent keys: ${avoidKeys.slice(0, 80).join(', ') || 'none'}; never repeat a stuntKey within this month; signature moves at most once a month each.
- Do not resemble these previous concepts: ${avoidConcepts.slice(0, 40).join(' | ') || 'none'}
- Stage-safe effects only; nobody in a vehicle's path; no homemade equipment; no public roads.
Return {"days":[{"date","theme","concept","characterIds":[1-3 ids, lead first],"sceneId","series","episode","stuntKey"}]} with exactly one entry per listed date.`,
      MonthOutlineSchema,
      (v) => {
        const keys = v.days.map((d) => d.stuntKey.split('@')[0]).filter(Boolean);
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        const reused = keys.filter((k) => avoidKeys.includes(k));
        return [
          ...(dupes.length ? [`stuntKey repeated within the month: ${[...new Set(dupes)].join(', ')}`] : []),
          ...(reused.length ? [`stuntKey reused from recent history: ${reused.join(', ')}`] : []),
        ];
      },
    );
    const byDate = new Map(res.days.map((d) => [d.date, d]));
    const fallback = mockOutline(dates, themes, characters, scenes, { concepts: avoidConcepts, stuntKeys: avoidKeys }, holidays);
    outline = dates.map((date, i) => sanitizeOutline(byDate.get(date), fallback[i], characters, scenes));
  }

  for (const day of outline) {
    const prev = existing.get(day.date);
    store.saveDay({ ...day, status: 'idea', locked: false, notes: prev?.notes ?? '' });
  }
  return store.listDays(prefix);
}

function sanitizeOutline(day: OutlineDay | undefined, fallback: OutlineDay, characters: Character[], scenes: Scene[]): OutlineDay {
  if (!day) return fallback;
  const ids = day.characterIds.filter((id) => characters.some((c) => c.id === id));
  return {
    ...day,
    date: fallback.date,
    theme: day.theme || fallback.theme,
    concept: clean(day.concept),
    characterIds: ids.length ? ids : fallback.characterIds,
    sceneId: scenes.some((s) => s.id === day.sceneId) ? day.sceneId : fallback.sceneId,
    stuntKey: day.stuntKey || fallback.stuntKey,
  };
}

export async function generateDayPack(store: Store, date: string): Promise<DayPlan> {
  const day = store.getDay(date);
  if (!day) throw new UserError(`No plan for ${date}. Generate the month first.`);
  if (day.locked) throw new UserError(`${date} is locked. Unlock it to regenerate.`);
  const settings = store.getSettings();
  const characters = store.listCharacters();
  const scene = store.listScenes().find((s) => s.id === day.sceneId);
  if (!scene) throw new UserError(`The scene for ${date} no longer exists. Pick another scene.`);
  const history = store.recentHistory(date, 30);
  const [y, m, d] = date.split('-').map(Number);
  const holiday = holidaysForMonth(y, m).filter((h) => h.date === date);
  const profile = MODEL_PROFILES[settings.targetModel];
  const hasNextEpisode = !!day.series && store.listDays(date.slice(0, 7)).some((x) => x.series === day.series && x.date > date);

  const provider = providerFor(settings);
  let pack: DayPack;
  if (provider.name === 'mock') {
    pack = mockDayPack(day, characters, scene, d, history.ctas, { hasNextEpisode, holiday: holiday[0] });
  } else {
    const cast = day.characterIds.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c);
    const durations = profile.durations.filter((n) => n <= 10);
    pack = await askJson(
      provider,
      `Write the Google Flow production pack for this Short. Target model: ${profile.label}; allowed clip lengths: ${durations.join(', ')} seconds.
Date: ${date} (${day.theme})${holiday.length ? `, holiday special: ${holiday.map((h) => `${h.name} in ${h.regions.join('/')}`).join(', ')}` : ''}${day.series ? `, series ${day.series} episode ${day.episode}${hasNextEpisode ? ' (the series continues later this month)' : ' (last episode this month: do not promise a rematch)'}` : ''}
Concept: ${day.concept}
Scene: ${scene.name}: ${sceneLock(scene)}; set pieces: ${scene.setPieces || 'none'}; features: ${scene.features.join(', ') || 'none'}; ambient: ${scene.ambient || 'n/a'}
Cast (use promptName exactly):
${cast.map((c) => `- ${promptNameOf(c)}: ${visualLock(c, false)}; vehicle: ${vehicleLock(c)}; helmet: ${c.helmet}; voice: ${voiceLock(c)}; personality: ${c.personality}; quirk: ${c.quirk || 'none'}; catchphrase: ${c.catchphrase}; failLine: ${c.failLine || 'none'}`).join('\n')}
Flow prompt rules (each clip is generated separately, so each must be one focused moment):
- Exactly 4 clips in this order with beats "setup", "stunt", "payoff", "cta"; total 10-30 seconds; every durationSec from the allowed lengths (suggested 8, 8, 6, 4).
- One action beat per clip (max 45 words, present tense, physical, never "then"; no idioms like "jaw on the floor": describe the expression).
- Fit the verbs to the stunt: only jumps "land"; say "pull it off" and "after the run" for ground tricks; slow motion "at the peak" only for jumps.
- Nobody rides or drives outside the stunt clip (the stunt clip is the only one with helmets on). A rival's failed attempt or bigger version happens off screen; show only the reaction.
- Props stay with whoever holds them: if the lead holds a prop in the cta clip, an earlier clip must show it being handed over.
- If a quirk involves speaking (whispering, narrating), give that character a matching dialogue line and put the manner in "emotion".
- Camera per clip: one shotSize, one angle, ONE movement (never "then"), optional lens; choose shots that suit the stunt (orbit or high angle for on-the-spot tricks, tracking for runs).
- onScreen: promptNames visible in the shot, left to right. Every speaker must be on screen.
- Dialogue: lines [{speaker, text, emotion}], max 2 per clip; total spoken words per clip at most floor(2.2 x seconds) - 2 (8s: 15 words, 6s: 11 words, 4s: 6 words). No quotation marks.
- The stunt clip has NO dialogue (faces are hidden by helmets); put a wordless whoop in sfx.
- The cta clip (4 s) shows only the lead, helmet off, with exactly one line of at most 6 words asking viewers to like, share and subscribe${hasNextEpisode ? ', optionally teasing the next episode' : ''}. Do not reuse: ${history.ctas.slice(0, 10).join(' | ') || 'n/a'}
- sfx: specific to the vehicle and surface (no crowd unless the scene has one). continuity: what changed since the previous clip (helmet on/off, props, positions).
- startFrame: exact visual state at 0.0s so Veo Lite matches the previous clip's saved end frame. endFrame: exact visual state on the final frame so the user can click Save frame cleanly.
- stuntSet: only the set pieces and props this stunt uses (e.g. "a waist-high wall of soft foam blocks"). dressing: ${holiday.length ? `${holiday[0].name} decorations on the set` : 'empty'}.
- hookVisual: the most striking 1.5 seconds (used as a cold open). hookText: a 2-5 word on-screen conflict caption for the edit, e.g. DEX STOLE MY TROPHY.
- Stage-safe effects (cold-spark fountains), no injuries, crashes, blood or sabotage, no real brands.
Metadata (one global upload; US English):
- title: at most 50 characters, formula "Hero vs Rival: Trick Name" or "Hero's Trick Name at Place", use a searchable trick word (wheelie, backflip, drift), at most one emoji, no superlatives or clickbait, never "would you try".
- description: line 1 = story tension WITHOUT revealing the outcome (plus series and episode), line 2 = a judging question (rate it, pick a side; never invite imitation), then a blank line, then exactly: ${SAFETY_LINE}
- hashtags: exactly 3 relevant ones (vehicle type, trick, #AIvideo). tags: 3-6 keyword phrases.
- instagramCaption: tension + question + "🎬 AI-generated fiction. Never try this." + up to 5 hashtags (no #Shorts); instagramHashtags: those hashtags.
- pinnedComment: a cliffhanger question that sets up the next episode.
Return {"hookVisual","hookText","stuntSet","dressing","clips":[{"beat","durationSec","shotSize","angle","movement","lens","onScreen":[],"startFrame","action","endFrame","lines":[{"speaker","text","emotion"}],"sfx","continuity"}],"metadata":{"title","description","hashtags":[],"tags":[],"instagramCaption","instagramHashtags":[],"pinnedComment"}}`,
      DayPackSchema,
      (p) => validatePack(polishPack(p, 'ai'), characters, settings.targetModel, scene),
    );
  }
  const polished = polishPack(pack, provider.name === 'mock' ? 'mock' : `${provider.name}`);
  const updated: DayPlan = { ...day, pack: polished, status: day.status === 'uploaded' ? 'uploaded' : 'idea' };
  store.saveDay(updated);
  return updated;
}

const BRAND_FIXES: Array<[RegExp, string]> = [
  [/\bgo ?pro\b/gi, 'helmet-mounted action camera'],
  [/\bjumbotron\b/gi, 'giant video screen'],
];
const tidy = (s: string) => BRAND_FIXES.reduce((t, [re, to]) => t.replace(re, to), clean(s));
const hashtag = (h: string) => `#${h.replace(/^#+/, '').replace(/\s+/g, '')}`;

/** Enforces Flow and platform rules regardless of which model produced the pack. */
export function polishPack(pack: DayPack, generatedBy: string): DayPack {
  const clips = pack.clips.map((c) => ({
    ...c,
    startFrame: tidy(c.startFrame),
    action: tidy(c.action),
    endFrame: tidy(c.endFrame),
    sfx: tidy(c.sfx),
    continuity: tidy(c.continuity),
    onScreen: c.onScreen.map(clean),
    lines: c.lines.map((l) => ({ ...l, speaker: clean(l.speaker), text: tidy(l.text), emotion: clean(l.emotion) })),
  }));
  const m = pack.metadata;
  const us = (s: string) => toSpelling(s, 'en-US');
  let title = us(clean(m.title));
  if (title.length > 60) title = `${title.slice(0, 59).trimEnd()}…`;
  const hashtags = [...new Set(m.hashtags.map(hashtag))].filter((h) => !/^#shorts$/i.test(h)).slice(0, 3);
  const finalTags = hashtags.length ? hashtags : ['#AIvideo'];
  // Rebuild the tail so the description always ends with the safety line and exactly the cleaned hashtags.
  const body = us(m.description.replace(/"/g, ''))
    .split('\n')
    .filter((line) => !/^\s*(#\w+\s*)+$/.test(line) && !line.includes(SAFETY_LINE))
    .join('\n')
    .trim();
  const description = `${body}\n\n${SAFETY_LINE}\n\n${finalTags.join(' ')}`;
  const igTags = [...new Set(m.instagramHashtags.map((h) => hashtag(h).toLowerCase()))].filter((h) => h !== '#shorts').slice(0, 5);
  let caption = us(m.instagramCaption.replace(/#\w+/g, '').trim());
  caption = `${caption}\n\n${igTags.join(' ')}`.trim();
  const gb = { title: toSpelling(title, 'en-GB'), description: toSpelling(description, 'en-GB') };
  return {
    ...pack,
    hookText: clean(pack.hookText).toUpperCase(),
    hookVisual: tidy(pack.hookVisual),
    stuntSet: tidy(pack.stuntSet),
    dressing: tidy(pack.dressing),
    clips,
    negativeNouns: pack.negativeNouns || NEGATIVE_NOUNS,
    metadata: {
      ...m,
      title,
      description,
      hashtags: finalTags,
      tags: m.tags.map(clean).filter(Boolean).slice(0, 8),
      enGB: gb.title !== title || gb.description !== description ? gb : null,
      instagramCaption: caption,
      instagramHashtags: igTags,
      pinnedComment: us(clean(m.pinnedComment)),
    },
    generatedBy,
  };
}
