import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audienceTimes, holidaysForMonth, publishInstant, toSpelling, zonedTimeToUtc } from '../shared/regional';
import { EXCLUSION_LINE, MODEL_PROFILES, SAFETY_LINE, blockingIssues, buildFlowPrompt, validatePack, vehicleLock } from '../shared/flowPrompt';
import { CharacterInputSchema, DayPackSchema, SceneInputSchema, type Character, type DayPack, type DayPlan, type Scene } from '../shared/schemas';
import { MOCK_CHARACTERS, MOCK_SCENES, findStunt, mockDayPack, mockOutline } from '../server/llm/mock';
import { polishPack } from '../server/generators';
import { extractJson } from '../server/llm/provider';
import { inspectVideo, shortsProblems } from '../server/mp4';
import { makeMp4 } from './mp4';

const characters: Character[] = MOCK_CHARACTERS.map((c, i) => ({ ...CharacterInputSchema.parse(c), id: `c${i}` }));
const scenes: Scene[] = MOCK_SCENES.map((s, i) => ({ ...SceneInputSchema.parse(s), id: `s${i}` }));
const THEMES = ['Stunt Sunday Remix', 'Drift Monday', 'Two-Wheel Tuesday', 'Wheelie Wednesday', 'Throttle Thursday', 'Flying Friday', 'Showdown Saturday'];
const dates = Array.from({ length: 31 }, (_, i) => `2026-12-${String(i + 1).padStart(2, '0')}`);
const themes = dates.map((d) => THEMES[new Date(`${d}T00:00:00Z`).getUTCDay()]);
const holidays = holidaysForMonth(2026, 12);
const outline = mockOutline(dates, themes, characters, scenes, { concepts: [], stuntKeys: [] }, holidays);
const sceneOf = (d: { sceneId: string }) => scenes.find((s) => s.id === d.sceneId)!;
const plans: DayPlan[] = outline.map((d, i) => ({
  ...d,
  status: 'idea',
  locked: false,
  notes: '',
  pack: mockDayPack(d, characters, sceneOf(d), i + 1, [], {
    hasNextEpisode: !!d.series && outline.some((x) => x.series === d.series && x.date > d.date),
    holiday: holidays.find((h) => h.date === d.date),
  }),
}));
const byId = (id: string) => characters.find((c) => c.id === id)!;

describe('publish timing', () => {
  it('converts zoned wall-clock time to UTC across DST', () => {
    expect(zonedTimeToUtc('2026-07-15', '18:00', 'America/New_York').toISOString()).toBe('2026-07-15T22:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-15', '18:00', 'America/New_York').toISOString()).toBe('2026-12-15T23:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-15', '19:30', 'Australia/Sydney').toISOString()).toBe('2026-12-15T08:30:00.000Z');
  });

  it('maps the single global slot to every audience and the creator', () => {
    const t = audienceTimes(publishInstant('2026-12-05', '20:00'), 'Asia/Kolkata');
    expect(t.yourTime).toBe('Sun 06 Dec, 01:30');
    expect(t.audiences.find((a) => a.label.startsWith('US East'))!.localTime).toBe('Sat 05 Dec, 15:00');
    expect(t.audiences.find((a) => a.label.startsWith('Sydney'))!.localTime).toBe('Sun 06 Dec, 07:00');
  });
});

describe('holidays and spelling', () => {
  it('includes moving holidays for every region', () => {
    expect(holidaysForMonth(2026, 11).find((h) => h.name === 'Thanksgiving')?.date).toBe('2026-11-26');
    expect(holidaysForMonth(2026, 4).find((h) => h.name === 'Easter Monday')?.date).toBe('2026-04-06');
    expect(holidaysForMonth(2026, 3).find((h) => h.name === 'Mothering Sunday')?.date).toBe('2026-03-15');
    expect(holidaysForMonth(2026, 9).find((h) => h.name.startsWith("Father's Day (AU"))?.date).toBe('2026-09-06');
  });

  it('converts spelling both ways and keeps capitalisation', () => {
    expect(toSpelling('Tyre smoke in every colour', 'en-US')).toBe('Tire smoke in every color');
    expect(toSpelling('Tire smoke in every color', 'en-GB')).toBe('Tyre smoke in every colour');
    expect(toSpelling('TIRE SMOKE', 'en-GB')).toBe('TYRE SMOKE');
    expect(toSpelling('a parking meter', 'en-GB')).toBe('a parking meter');
  });
});

describe('mock month planner', () => {
  it('never repeats a trick and only uses tricks the location supports', () => {
    const keys = outline.map((d) => d.stuntKey.split('@')[0]);
    expect(new Set(keys).size).toBe(keys.length);
    for (const d of outline) {
      const stunt = findStunt(d.stuntKey, characters)!;
      expect(stunt.type).toBe(byId(d.characterIds[0]).vehicleType);
      for (const f of stunt.needs ?? []) expect(sceneOf(d).features).toContain(f);
    }
  });

  it('keeps twists logical, varied and arranged in weekly arcs', () => {
    const twistCounts = new Map<string, number>();
    for (const d of outline) {
      const [lead, other] = d.characterIds.map(byId);
      const twist = d.concept.split('Twist: ')[1];
      twistCounts.set(twist.replace(lead.promptName, 'L').replace(other?.promptName ?? '~', 'O'), 1 + (twistCounts.get(twist) ?? 0));
      if (/copy it|go even bigger/.test(d.concept)) expect(other.vehicleType).toBe(lead.vehicleType);
      if (/rubber chicken|stole/.test(d.concept)) expect(other.role).toMatch(/villain|rival/);
      if (/coaches|lucky charm|biscuit/.test(d.concept)) expect(`${lead.role} ${other.role}`).not.toMatch(/villain/);
      expect(d.concept).not.toMatch(/sabotag|"/);
    }
    expect(twistCounts.size).toBeGreaterThanOrEqual(8);
    const series = outline.filter((d) => d.series);
    expect(new Set(series.map((d) => `${d.series}#${d.episode}`)).size).toBe(series.length);
    expect(new Set(series.map((d) => d.series)).size).toBeGreaterThanOrEqual(3);
    expect(series.some((d) => !/Dex/.test(d.series))).toBe(true);
    expect(outline.find((d) => d.date === '2026-12-25')!.concept).toMatch(/^Christmas Day special/);
  });

  it('produces packs that pass every Flow and publishing rule on both models', () => {
    for (const p of plans) {
      expect(DayPackSchema.safeParse(p.pack).success).toBe(true);
      expect(validatePack(p.pack!, characters, 'omni-flash-1.2', sceneOf(p))).toEqual([]);
      expect(validatePack(p.pack!, characters, 'veo-3.1-lite', sceneOf(p))).toEqual([]);
      expect(p.pack!.clips.at(-1)!.durationSec).toBe(4);
    }
  });

  it('only promises a rematch when the series continues, and dresses holiday sets', () => {
    for (const p of plans) {
      const cta = p.pack!.clips.at(-1)!.lines[0].text;
      const continues = !!p.series && plans.some((x) => x.series === p.series && x.date > p.date);
      if (/revenge|round two|rematch/i.test(cta)) expect(continues).toBe(true);
      // Revenge only makes sense after the rival lost a bet, a prank or the trophy.
      if (/revenge/i.test(cta)) expect(p.concept).toMatch(/bets|rubber chicken|trophy/);
    }
    expect(plans.find((p) => p.date === '2026-12-25')!.pack!.dressing).toMatch(/tinsel/);
  });

  it('fits twists, finales and themes to the day', () => {
    for (const d of outline) {
      if (/before the light goes/.test(d.concept)) expect(`${sceneOf(d).timeOfDay} ${sceneOf(d).lighting}`).toMatch(/sunset|dusk|twilight|golden/i);
      if (/showdown/i.test(d.theme) && d.series) expect(d.concept).toMatch(/bets|trophy|stopwatch|go even bigger/);
    }
    const flying = outline.filter((d) => /flying/i.test(d.theme)).map((d) => findStunt(d.stuntKey, characters)!);
    expect(flying.filter((s) => s.airborne).length).toBeGreaterThanOrEqual(flying.length - 1);
  });

  it('lists only the set pieces a stunt uses', () => {
    for (const p of plans) {
      const stunt = findStunt(p.stuntKey, characters)!;
      if (!stunt.needs?.includes('ramp')) expect(p.pack!.stuntSet).not.toMatch(/ramp/i);
      if (!stunt.needs?.includes('wall')) expect(p.pack!.stuntSet).not.toMatch(/\bwall\b(?! of)/i);
    }
  });

  it('fits verbs to the stunt and keeps props with the right person', () => {
    for (const p of plans) {
      const stunt = findStunt(p.stuntKey, characters)!;
      const text = p.pack!.clips.map((c) => `${c.action} ${c.continuity} ${c.sfx}`).join(' ');
      if (!stunt.airborne) expect(text).not.toMatch(/landing|at the peak/);
      if (/stopwatch/.test(p.concept)) expect(p.pack!.clips.at(-1)!.action).not.toMatch(/stopwatch/);
    }
  });
});

describe('Flow prompt builder', () => {
  const plan = plans.find((p) => p.characterIds.length === 2 && p.pack!.clips[0].lines.length === 2 && byId(p.characterIds[0]).helmet === 'full-face')!;
  const scene = sceneOf(plan);
  const [lead, other] = plan.characterIds.map(byId);
  const omni = buildFlowPrompt(plan, characters, scene, 'omni-flash-1.2')!;
  const veo = buildFlowPrompt(plan, characters, scene, 'veo-3.1-lite')!;

  it('writes one self-contained prompt per beat without quotation marks', () => {
    expect(omni.clips.map((c) => c.beat)).toEqual(['setup', 'stunt', 'payoff', 'cta']);
    for (const clip of omni.clips) {
      expect(clip.text).not.toMatch(/["“”]/);
      expect(clip.text).toContain(scene.location);
      expect(clip.text).toContain('Music: none.');
      expect(clip.text.trim().endsWith(EXCLUSION_LINE)).toBe(true);
      expect(clip.text).toContain(MODEL_PROFILES['omni-flash-1.2'].singleShotLine);
      expect(clip.text).not.toMatch(/says in an? an? /);
    }
    expect(veo.clips[0].text).not.toContain('Single continuous shot');
  });

  it('describes only the characters in shot, with helmets and vehicles matching the beat', () => {
    const [setup, stunt, payoff, cta] = omni.clips;
    expect(setup.text).toContain(other.appearance);
    expect(setup.text).not.toContain(other.vehicle);
    expect(setup.text).toContain(`${lead.promptName} on the left and ${other.promptName} on the right`);
    expect(stunt.text).not.toContain(other.appearance);
    expect(stunt.text).toContain('No spoken words.');
    expect(stunt.text).toContain(`and ${lead.helmetLook}`);
    expect(payoff.text).toContain(vehicleLock(lead));
    expect(payoff.text).not.toContain(vehicleLock(other));
    expect(cta.text).toContain(vehicleLock(lead));
    expect(cta.text).toContain(`holding ${lead.helmetLook} under one arm`);
    expect(cta.text).toMatch(new RegExp(`${lead.promptName} says in an? (?!a )[^:]+: .*like.*share.*subscribe`, 'i'));
  });

  it('puts car drivers in a helmet for stunts and supports Flow Characters mode', () => {
    const carPlan = plans.find((p) => byId(p.characterIds[0]).promptName === 'Kira')!;
    const stunt = buildFlowPrompt(carPlan, characters, sceneOf(carPlan), 'omni-flash-1.2')!.clips[1].text;
    expect(stunt).toContain('a plain white FIA full-face racing helmet');
    expect(stunt).not.toMatch(/sunglasses pushed up/);
    const ing = buildFlowPrompt(plan, characters, scene, 'omni-flash-1.2', 'ingredients')!;
    expect(ing.clips[0].text).toContain(`@${lead.promptName} in`);
    expect(ing.clips[0].text).not.toContain(lead.appearance);
    for (const clip of ing.clips) expect(clip.text).not.toMatch(/@\w+ in [^.]*\b(a|an|the|and|with|of|on)\.$/m);
    expect(ing.checklist.join(' ')).toContain(`@${lead.promptName}`);
  });

  it('keeps production notes out of prompts and includes start/end frame continuity anchors', () => {
    expect(omni.editNotes.join(' ')).toContain(plan.pack!.hookText);
    expect(omni.editNotes.join(' ')).toContain(plan.pack!.hookVisual);
    expect(omni.clips.some((c) => c.text.includes(plan.pack!.hookText))).toBe(false);
    for (const clip of omni.clips) {
      expect(clip.text).toContain('Start frame (0.0s):');
      expect(clip.text).toContain(`End frame (${clip.durationSec}.0s):`);
    }
    expect(omni.checklist.join(' ')).toMatch(/click Save frame on its final frame and use Frames to Video/);
    expect(omni.fullText.split('\n')[0]).toContain(plan.theme);
  });
});

describe('validatePack', () => {
  const base = plans[0].pack!;
  const withClip = (i: number, patch: Partial<DayPack['clips'][number]>): DayPack => ({ ...base, clips: base.clips.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const check = (p: DayPack, model: 'omni-flash-1.2' | 'veo-3.1-lite' = 'omni-flash-1.2') => validatePack(p, characters, model).join(' | ');

  it('flags each class of prompt error', () => {
    const speaker = base.clips[0].onScreen[0];
    expect(check(withClip(0, { lines: [{ speaker, text: 'He said "go"', emotion: '' }] }))).toMatch(/quotation/);
    expect(check(withClip(0, { lines: [{ speaker: 'Maya', text: 'Hi', emotion: '' }] }))).toMatch(/not on screen/);
    expect(check(withClip(2, { lines: [{ speaker: base.clips[2].onScreen[0], text: 'one two three four five six seven eight nine ten eleven twelve', emotion: '' }] }))).toMatch(/do not fit/);
    expect(check(withClip(1, { lines: [{ speaker: base.clips[1].onScreen[0], text: 'Woo', emotion: '' }] }))).toMatch(/no dialogue during the stunt/);
    expect(check(withClip(2, { durationSec: 5 }), 'veo-3.1-lite')).toMatch(/not a valid Veo 3.1 Lite length/);
    expect(check(withClip(1, { movement: 'push-in then whip-pan' }))).toMatch(/one camera movement/);
    expect(check(withClip(1, { action: `${speaker} brakes, then waves` }))).toMatch(/one action beat/);
    expect(check(withClip(2, { action: `${base.clips[2].onScreen[0]} whispers to the camera`, lines: [] }))).toMatch(/no dialogue line/);
    expect(check(withClip(1, { sfx: 'a GoPro whirring' }))).toMatch(/brand/);
    expect(check(withClip(1, { action: 'Jax crashes into a wall' }))).toMatch(/safety filters/);
    expect(check({ ...base, metadata: { ...base.metadata, instagramHashtags: ['#a', '#b', '#c', '#d', '#e', '#shorts'] } })).toMatch(/Instagram allows 5/);
  });

  it('blocks imitation wording but not the standard safety phrases', () => {
    expect(blockingIssues(validatePack({ ...base, metadata: { ...base.metadata, title: 'Would you try this?' } }, characters, 'omni-flash-1.2'))).toHaveLength(1);
    const safe = { ...base, metadata: { ...base.metadata, pinnedComment: "Don't try this at home!" } };
    expect(validatePack(safe, characters, 'omni-flash-1.2')).toEqual([]);
  });

  it('checks brand names inside character and scene text', () => {
    const branded = characters.map((c, i) => (i === 0 ? { ...c, vehicle: 'a red Ducati superbike' } : c));
    const jaxPlan = plans.find((p) => p.pack!.clips.some((c) => c.onScreen.includes('Jax')))!;
    expect(validatePack(jaxPlan.pack!, branded, 'omni-flash-1.2').join(' ')).toMatch(/Character or scene text contains a real brand name \(Ducati\)/);
  });
});

describe('polishPack', () => {
  it('enforces platform limits, spelling, safety text and rebuilt hashtags', () => {
    const raw: DayPack = {
      ...plans[0].pack!,
      clips: plans[0].pack!.clips.map((c, i) => (i === 1 ? { ...c, sfx: 'GoPro whirr' } : c)),
      metadata: {
        ...plans[0].pack!.metadata,
        title: 'Kira vs Dex: Tyre Smoke in Every Colour',
        description: 'Line one\nLine two\n\n#Shorts #Drift #Extra #More',
        hashtags: ['#Shorts', 'Drift', '#CarStunts', '#AIvideo', '#Extra'],
        instagramCaption: 'Caption #one #two',
        instagramHashtags: ['#a', '#b', '#c', '#d', '#e', '#f', '#Shorts'],
      },
    };
    const out = polishPack(raw, 'gemini');
    expect(out.metadata.title).toBe('Kira vs Dex: Tire Smoke in Every Color');
    expect(out.metadata.enGB?.title).toBe('Kira vs Dex: Tyre Smoke in Every Colour');
    expect(out.metadata.hashtags).toEqual(['#Drift', '#CarStunts', '#AIvideo']);
    expect(out.metadata.instagramHashtags).toHaveLength(5);
    expect(out.metadata.description).toBe(`Line one\nLine two\n\n${SAFETY_LINE}\n\n#Drift #CarStunts #AIvideo`);
    expect(out.clips[1].sfx).toBe('helmet-mounted action camera whirr');
    expect(out.generatedBy).toBe('gemini');
  });
});

describe('MP4 inspection', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp4-'));
  const write = (name: string, buf: Buffer) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, buf);
    return p;
  };

  it('reads duration, size, codec and layout', () => {
    const info = inspectVideo(write('ok.mp4', makeMp4({ durationSec: 26 })));
    expect(info).toMatchObject({ durationSec: 26, width: 1080, height: 1920, faststart: true, videoCodec: 'avc1', hasAudio: true });
    expect(shortsProblems(info)).toEqual({ blocking: [], warnings: [] });
  });

  it('rejects landscape or over-long videos and handles rotation and late moov', () => {
    expect(shortsProblems(inspectVideo(write('wide.mp4', makeMp4({ width: 1920, height: 1080 })))).blocking[0]).toMatch(/landscape/);
    expect(shortsProblems(inspectVideo(write('long.mp4', makeMp4({ durationSec: 200 })))).blocking[0]).toMatch(/3 minutes/);
    const rotated = inspectVideo(write('rot.mp4', makeMp4({ width: 1920, height: 1080, rotate90: true })));
    expect([rotated.width, rotated.height]).toEqual([1080, 1920]);
    expect(shortsProblems(rotated).blocking).toEqual([]);
    const slow = inspectVideo(write('slow.mp4', makeMp4({ faststart: false })));
    expect(shortsProblems(slow).warnings.join(' ')).toMatch(/faststart/);
    expect(shortsProblems(slow, { instagram: true }).blocking.join(' ')).toMatch(/faststart/);
    expect(() => inspectVideo(write('bad.mp4', Buffer.from('not a video')))).toThrow(/Not a valid MP4/);
  });
});

describe('LLM JSON extraction', () => {
  it('handles fenced or chatty model output', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here you go: {"a":2} hope that helps')).toEqual({ a: 2 });
  });
});
