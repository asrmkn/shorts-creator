import type { AudienceTime, Holiday, Region } from './schemas';

export const REGION_INFO: Record<Region, { label: string; timezone: string }> = {
  US: { label: 'United States', timezone: 'America/New_York' },
  UK: { label: 'United Kingdom', timezone: 'Europe/London' },
  AU: { label: 'Australia', timezone: 'Australia/Sydney' },
  CA: { label: 'Canada', timezone: 'America/Toronto' },
  NZ: { label: 'New Zealand', timezone: 'Pacific/Auckland' },
};

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function tzOffsetMs(tz: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Converts a wall-clock time in `tz` to a UTC Date (DST-aware). */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - tzOffsetMs(tz, guess);
  result = guess - tzOffsetMs(tz, result);
  return new Date(result);
}

export function formatInTz(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}

/**
 * Shorts are distributed globally and YouTube says posting time barely matters, so the app publishes
 * once per day at one global UTC slot. This table only shows what that slot means for each audience.
 * Evening windows follow Buffer's 2026 analysis of 1.8M videos (peaks 18:00-21:00 local).
 */
const AUDIENCES: Array<{ label: string; timezone: string; window: string }> = [
  { label: 'US East / Toronto', timezone: 'America/New_York', window: '18:00-21:00' },
  { label: 'US / Canada Pacific', timezone: 'America/Los_Angeles', window: '18:00-21:00' },
  { label: 'United Kingdom', timezone: 'Europe/London', window: '18:00-22:00' },
  { label: 'Sydney / Melbourne', timezone: 'Australia/Sydney', window: '18:00-21:00' },
  { label: 'Perth', timezone: 'Australia/Perth', window: '18:00-21:00' },
  { label: 'New Zealand', timezone: 'Pacific/Auckland', window: '18:00-21:00' },
];

export const DEFAULT_PUBLISH_SLOT_UTC = '20:00';

/** The publish instant for a plan date: that date at the global UTC slot. */
export function publishInstant(date: string, slotUtc: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = slotUtc.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm));
}

export function audienceTimes(instant: Date, userTz: string): { yourTime: string; audiences: AudienceTime[] } {
  return {
    yourTime: formatInTz(instant, userTz),
    audiences: AUDIENCES.map((a) => ({ label: a.label, timezone: a.timezone, window: a.window, localTime: formatInTz(instant, a.timezone) })),
  };
}
function nthWeekday(year: number, month: number, dow: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
  return isoDate(year, month, day);
}

function lastWeekday(year: number, month: number, dow: number): string {
  const last = daysInMonth(year, month);
  const lastDow = new Date(Date.UTC(year, month - 1, last)).getUTCDay();
  return isoDate(year, month, last - ((lastDow - dow + 7) % 7));
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const ALL: Region[] = ['US', 'UK', 'AU', 'CA', 'NZ'];

export function holidaysForMonth(year: number, month: number): Holiday[] {
  const list: Holiday[] = [];
  const add = (date: string, name: string, regions: Region[]) => list.push({ date, name, regions });
  const fixed = (m: number, d: number, name: string, regions: Region[]) => add(isoDate(year, m, d), name, regions);

  fixed(1, 1, "New Year's Day", ALL);
  fixed(1, 26, 'Australia Day', ['AU']);
  fixed(2, 6, 'Waitangi Day', ['NZ']);
  fixed(2, 14, "Valentine's Day", ALL);
  fixed(3, 17, "St Patrick's Day", ['US', 'UK', 'CA']);
  fixed(4, 25, 'Anzac Day', ['AU', 'NZ']);
  fixed(7, 1, 'Canada Day', ['CA']);
  fixed(7, 4, 'Independence Day', ['US']);
  fixed(10, 31, 'Halloween', ['US', 'UK', 'CA', 'AU', 'NZ']);
  fixed(11, 5, 'Bonfire Night', ['UK', 'NZ']);
  fixed(11, 11, 'Veterans / Remembrance Day', ALL);
  fixed(12, 25, 'Christmas Day', ALL);
  fixed(12, 26, 'Boxing Day', ['UK', 'AU', 'CA', 'NZ']);
  fixed(12, 31, "New Year's Eve", ALL);

  add(nthWeekday(year, 1, 1, 3), 'Martin Luther King Jr. Day', ['US']);
  add(nthWeekday(year, 2, 0, 2), 'Super Bowl Sunday', ['US']);
  add(nthWeekday(year, 5, 0, 2), "Mother's Day", ['US', 'CA', 'AU', 'NZ']);
  add(lastWeekday(year, 5, 1), 'Memorial Day', ['US']);
  add(nthWeekday(year, 6, 0, 3), "Father's Day", ['US', 'UK', 'CA']);
  add(nthWeekday(year, 9, 1, 1), 'Labor Day', ['US', 'CA']);
  add(nthWeekday(year, 9, 0, 1), "Father's Day (AU/NZ)", ['AU', 'NZ']);
  add(nthWeekday(year, 10, 1, 2), 'Thanksgiving (Canada)', ['CA']);
  const thanksgiving = nthWeekday(year, 11, 4, 4);
  add(thanksgiving, 'Thanksgiving', ['US']);
  const tg = new Date(thanksgiving + 'T00:00:00Z');
  tg.setUTCDate(tg.getUTCDate() + 1);
  add(tg.toISOString().slice(0, 10), 'Black Friday', ['US', 'UK', 'CA', 'AU']);

  const easter = easterSunday(year);
  add(easter.toISOString().slice(0, 10), 'Easter Sunday', ALL);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  add(goodFriday.toISOString().slice(0, 10), 'Good Friday', ALL);
  const shift = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  add(shift(easter, 1), 'Easter Monday', ['UK', 'AU', 'CA', 'NZ']);
  add(shift(easter, -21), 'Mothering Sunday', ['UK']);

  const prefix = `${year}-${pad(month)}-`;
  return list.filter((h) => h.date.startsWith(prefix)).sort((a, b) => a.date.localeCompare(b.date));
}

export function seasonNote(month: number): string {
  const north = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'][month - 1];
  const south = { winter: 'summer', spring: 'autumn', summer: 'winter', autumn: 'spring' }[north as 'winter'];
  return `Northern Hemisphere (US/UK/CA): ${north}. Southern Hemisphere (AU/NZ): ${south}.`;
}

// [American, British] pairs, longest forms first so plurals are matched before singulars.
const SPELLING: Array<[string, string]> = [
  ['tires', 'tyres'],
  ['tire', 'tyre'],
  ['colors', 'colours'],
  ['colored', 'coloured'],
  ['color', 'colour'],
  ['favorite', 'favourite'],
  ['neighborhood', 'neighbourhood'],
  ['center', 'centre'],
  ['meters', 'metres'],
  ['gasoline', 'petrol'],
  ['practicing', 'practising'],
  ['maneuvers', 'manoeuvres'],
  ['maneuver', 'manoeuvre'],
  ['curb', 'kerb'],
  ['gray', 'grey'],
];

/** Converts between US English (the channel default) and British English (en-GB localization). */
export function toSpelling(text: string, target: 'en-US' | 'en-GB'): string {
  let out = text;
  for (const [us, uk] of SPELLING) {
    const [from, to] = target === 'en-GB' ? [us, uk] : [uk, us];
    out = out.replace(new RegExp(`\\b${from}\\b`, 'gi'), (match) =>
      match === match.toUpperCase() ? to.toUpperCase() : match[0] === match[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to,
    );
  }
  return out;
}