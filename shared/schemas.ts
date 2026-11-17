import { z } from 'zod';

export const REGIONS = ['US', 'UK', 'AU', 'CA', 'NZ'] as const;
export const RegionSchema = z.enum(REGIONS);
export type Region = z.infer<typeof RegionSchema>;

export const STATUSES = ['idea', 'generated', 'uploaded'] as const;
export const StatusSchema = z.enum(STATUSES);
export type Status = z.infer<typeof StatusSchema>;

export const PROVIDERS = ['mock', 'gemini', 'openai', 'anthropic', 'ollama'] as const;
export const ProviderSchema = z.enum(PROVIDERS);
export type ProviderName = z.infer<typeof ProviderSchema>;

export const PLATFORMS = ['youtube', 'instagram', 'tiktok'] as const;
export const PlatformSchema = z.enum(PLATFORMS);
export type Platform = z.infer<typeof PlatformSchema>;

export const FLOW_MODELS = ['veo-3.1-lite', 'omni-flash-1.2'] as const;
export const FlowModelSchema = z.enum(FLOW_MODELS);
export type FlowModel = z.infer<typeof FlowModelSchema>;

export const SCENE_FEATURES = ['ramp', 'wall', 'water', 'sparks', 'dirt', 'tarmac', 'ice', 'sand', 'wet', 'crowd', 'obstacles'] as const;
export const SceneFeatureSchema = z.enum(SCENE_FEATURES);
export type SceneFeature = z.infer<typeof SceneFeatureSchema>;

export const HELMETS = ['full-face', 'open-face', 'none'] as const;

export const CharacterInputSchema = z.object({
  name: z.string().min(1),
  /** One word, no quotes; the only name used inside video prompts. */
  promptName: z.string().default(''),
  role: z.string().min(1),
  age: z.coerce.number().int().min(21).max(80),
  appearance: z.string().min(1),
  outfit: z.string().min(1),
  helmet: z.enum(HELMETS).default('full-face'),
  helmetLook: z.string().default(''),
  vehicle: z.string().min(1),
  vehicleType: z.enum(['bike', 'car']),
  personality: z.string().min(1),
  catchphrase: z.string().min(1),
  failLine: z.string().default(''),
  voiceAccent: z.string().min(1),
  voiceDescription: z.string().min(1),
  signatureMove: z.string().default(''),
  quirk: z.string().default(''),
  backstory: z.string().default(''),
  relationships: z.string().default(''),
});
export type CharacterInput = z.infer<typeof CharacterInputSchema>;
export const CharacterSchema = CharacterInputSchema.extend({ id: z.string() });
export type Character = z.infer<typeof CharacterSchema>;

export const SceneInputSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  lighting: z.string().min(1),
  timeOfDay: z.string().min(1),
  weather: z.string().min(1),
  cameraStyle: z.string().min(1),
  regionFlavor: z.enum(['US', 'UK', 'AU', 'CA', 'NZ', 'Global']),
  setPieces: z.string().default(''),
  vibe: z.string().default(''),
  ambient: z.string().default(''),
  features: z.array(SceneFeatureSchema).default([]),
});
export type SceneInput = z.infer<typeof SceneInputSchema>;
export const SceneSchema = SceneInputSchema.extend({ id: z.string() });
export type Scene = z.infer<typeof SceneSchema>;

export const OutlineDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  theme: z.string().min(1),
  concept: z.string().min(1),
  characterIds: z.array(z.string()).min(1).max(3),
  sceneId: z.string(),
  series: z.string().default(''),
  episode: z.number().int().min(0).default(0),
  /** Normalised stunt identity used to stop the same trick repeating. */
  stuntKey: z.string().default(''),
});
export type OutlineDay = z.infer<typeof OutlineDaySchema>;
export const MonthOutlineSchema = z.object({ days: z.array(OutlineDaySchema) });

export const BEATS = ['setup', 'stunt', 'payoff', 'cta'] as const;

export const LineSchema = z.object({
  speaker: z.string().min(1),
  text: z.string().min(1),
  emotion: z.string().default(''),
});
export type Line = z.infer<typeof LineSchema>;

export const ClipSchema = z.object({
  beat: z.enum(BEATS),
  durationSec: z.number().int().min(3).max(15),
  shotSize: z.string().min(1),
  angle: z.string().min(1),
  movement: z.string().min(1),
  lens: z.string().default(''),
  /** promptNames of the characters visible in this shot, left to right. */
  onScreen: z.array(z.string()).min(1).max(3),
  /** Exact visual state at 0.0s so Veo Lite matches the previous clip's saved end frame. */
  startFrame: z.string().default(''),
  action: z.string().min(1),
  /** Exact visual state on the final frame so the user can click Save frame cleanly. */
  endFrame: z.string().default(''),
  lines: z.array(LineSchema).max(2).default([]),
  sfx: z.string().min(1),
  continuity: z.string().default(''),
});
export type Clip = z.infer<typeof ClipSchema>;

export const MetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  hashtags: z.array(z.string()).min(1),
  tags: z.array(z.string()).default([]),
  enGB: z.object({ title: z.string(), description: z.string() }).nullable().default(null),
  instagramCaption: z.string().min(1),
  instagramHashtags: z.array(z.string()).default([]),
  pinnedComment: z.string().default(''),
});
export type Metadata = z.infer<typeof MetadataSchema>;

export const DayPackSchema = z
  .object({
    hookVisual: z.string().min(1),
    hookText: z.string().default(''),
    clips: z.array(ClipSchema).min(3).max(5),
    negativeNouns: z.string().default(''),
    /** Set pieces and props this stunt actually uses (listed in setup/stunt clips). */
    stuntSet: z.string().default(''),
    /** Extra set dressing shown in every clip, e.g. holiday decorations. */
    dressing: z.string().default(''),
    editNotes: z.array(z.string()).default([]),
    metadata: MetadataSchema,
    generatedBy: z.string().default('unknown'),
  })
  .refine((p) => {
    const total = p.clips.reduce((s, c) => s + c.durationSec, 0);
    return total >= 10 && total <= 30;
  }, 'Total clip duration must be between 10 and 30 seconds')
  .refine((p) => {
    const cta = p.clips.at(-1);
    const text = cta?.lines[0]?.text ?? '';
    return cta?.beat === 'cta' && cta.lines.length === 1 && /like/i.test(text) && /share/i.test(text) && /subscribe/i.test(text);
  }, 'The last clip must be a CTA clip with one line asking to like, share and subscribe');
export type DayPack = z.infer<typeof DayPackSchema>;

export const DayPlanSchema = OutlineDaySchema.extend({
  status: StatusSchema.default('idea'),
  locked: z.boolean().default(false),
  notes: z.string().default(''),
  pack: DayPackSchema.optional(),
});
export type DayPlan = z.infer<typeof DayPlanSchema>;

export const SettingsSchema = z.object({
  provider: ProviderSchema,
  model: z.string(),
  targetModel: FlowModelSchema,
  userTimezone: z.string(),
  /** Daily global publish time, HH:MM in UTC. */
  publishSlotUtc: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour time such as 20:00'),
  /** text: full visual locks in every prompt; ingredients: @Name references to Flow Characters. */
  characterMode: z.enum(['text', 'ingredients']),
  channelName: z.string(),
  channelBrief: z.string(),
  weeklyThemes: z.array(z.string()).length(7), // index 0 = Sunday
});
export type Settings = z.infer<typeof SettingsSchema>;

export interface AudienceTime {
  label: string;
  timezone: string;
  localTime: string;
  window: string;
}

export interface Holiday {
  date: string;
  name: string;
  regions: Region[];
}

export type UploadStatus = 'queued' | 'processing' | 'success' | 'scheduled' | 'error';

export interface UploadRecord {
  id: number;
  date: string;
  platform: Platform;
  status: UploadStatus;
  externalId: string | null;
  url: string | null;
  error: string | null;
  runAt: string | null;
  publishAt: string | null;
  attempts: number;
  createdAt: string;
}
