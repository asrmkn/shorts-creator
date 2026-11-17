import type { Character, CharacterInput, Clip, DayPack, Holiday, Line, OutlineDay, Scene, SceneFeature, SceneInput } from '../../shared/schemas';
import { NEGATIVE_NOUNS, SAFETY_LINE, isSpokenQuirk, promptNameOf, splitMove } from '../../shared/flowPrompt';
import { toSpelling } from '../../shared/regional';

/**
 * Deterministic, offline content for the "mock" provider (no API key needed). It follows the same
 * Flow and Shorts rules as the AI path, with grounded live-action motorsport characters and closed
 * proving-ground venues so Veo 3.1 Lite renders realistic humans and vehicles.
 */

export const MOCK_CHARACTERS: CharacterInput[] = [
  {
    name: 'Jax "Blaze" Rivera',
    promptName: 'Jax',
    role: 'show-off stunt rider and crowd favourite',
    age: 27,
    appearance: 'a tall, athletic Latino man in his late twenties with a tight black skin-fade haircut, medium olive skin, trimmed dark stubble and a faint scar on his left eyebrow',
    outfit: 'a black leather race suit with orange flame stripes down both arms and black riding gloves',
    helmet: 'full-face',
    helmetLook: 'a matte carbon-fibre full-face motocross helmet with a dark iridium visor and orange chin vent',
    vehicle: 'a matte-black 450cc motocross bike with anodized orange fork tubes, carbon exhaust muffler and a white 07 number plate',
    vehicleType: 'bike',
    personality: 'confident, charismatic pro stunt rider who treats every practice run like a stadium final',
    catchphrase: 'Light it up!',
    failLine: 'Okay, that one was for the crowd.',
    voiceAccent: 'American (Texan)',
    voiceDescription: "a man's deep, booming voice with a Texan accent, punchy and hyped like a stadium announcer",
    signatureMove: 'Phoenix Flip: launches off the ramp and backflips through a ring of cold-spark fountains, landing rear wheel first',
    quirk: 'kisses his glove and points to the sky',
    backstory: 'Former national supercross privateer who built his own stunt compound.',
    relationships: 'Best friends with Kira and always trying to out-do her; mentor to Ollie; sworn rival of Dex.',
  },
  {
    name: 'Kira "Drift Queen" Walsh',
    promptName: 'Kira',
    role: 'ice-cool drift champion',
    age: 26,
    appearance: 'a slim woman in her mid-twenties with a long platinum-blonde braid, sun-freckled skin and sharp hazel eyes',
    outfit: 'a white bomber-style FIA race jacket with teal stripes, black suede racing gloves and dark aviator sunglasses pushed up on her head',
    helmet: 'none',
    helmetLook: '',
    vehicle: 'a widebody pearl-white and teal rear-wheel-drive drift coupe with a carbon GT rear wing and forged bronze wheels',
    vehicleType: 'car',
    personality: 'unflappable, dry-humoured precision driver who puts her rear bumper millimetres from the clipping wall',
    catchphrase: 'Too easy, mate.',
    failLine: 'Right. Nobody saw that.',
    voiceAccent: 'Australian',
    voiceDescription: "a woman's relaxed, playful voice with an Australian accent and a laid-back pace",
    signatureMove: 'Smoke Signal: drifts in a long, sweeping arc that leaves a thick wall of white tyre smoke along the clipping line',
    quirk: 'checks a handheld digital tyre-pressure gauge',
    backstory: "Learned to drift on gravel station tracks outside Adelaide before winning pro drift series.",
    relationships: 'Friendly rivalry with Jax; secretly coaching Ollie; shuts down Dex with lap times.',
  },
  {
    name: 'Ollie "Crash-Test" Bennett',
    promptName: 'Ollie',
    role: 'scrappy rookie rider and underdog',
    age: 22,
    appearance: 'a lean, wiry man in his early twenties with tousled ginger hair, weathered freckles across his nose and an eager grin',
    outfit: 'a red-and-white technical motocross jersey over chest armour, black Cordura riding pants and scuffed black motocross boots',
    helmet: 'full-face',
    helmetLook: 'a gloss-white full-face supermoto helmet with twin red racing stripes',
    vehicle: 'an agile bright-red 250cc supermoto bike with black spoked wheels and knobby tyres',
    vehicleType: 'bike',
    personality: 'earnest, nervous before the drop, relentlessly gutsy once the clutch is out',
    catchphrase: 'Right. Here goes nothing!',
    failLine: 'That was on purpose.',
    voiceAccent: 'British (London)',
    voiceDescription: "a young man's light, expressive voice with a London accent, quick and breathless",
    signatureMove: 'Wobble: pulls a wild, wobbling wheelie that looks doomed but never falls',
    quirk: 'whispers to the camera like a nature-documentary narrator',
    backstory: 'Started as the paddock tyre technician before earning a rookie spot on the stunt team.',
    relationships: "Hero-worships Jax; Kira is his secret coach; constantly challenged by Dex.",
  },
  {
    name: 'Dex "Viper" Kane',
    promptName: 'Dex',
    role: 'lovable villain of the rival crew',
    age: 32,
    appearance: 'a broad, muscular man in his thirties with a close-cropped buzzcut, a sculpted dark beard and intense brown eyes',
    outfit: 'a green-and-black leather racing jacket with carbon shoulder pads, black leather racing gloves and dark aviator sunglasses',
    helmet: 'none',
    helmetLook: '',
    vehicle: 'a satin-black widebody V8 muscle car with dark-green racing stripes, functional hood intake and a visible roll cage',
    vehicleType: 'car',
    personality: 'smug, theatrical and over-confident; schemes to steal the spotlight and hates losing by a tenth of a second',
    catchphrase: 'Catch me if you can.',
    failLine: 'I let you win. Obviously.',
    voiceAccent: 'Canadian',
    voiceDescription: "a man's deep, gravelly voice with a Canadian accent, slow and smug like a movie villain",
    signatureMove: 'Venom Spin: spins tight 360 donuts inside a ring of his own tyre smoke',
    quirk: 'gives three slow sarcastic claps',
    backstory: 'Lost the national stunt invitational to Jax by one point and has been plotting a rematch ever since.',
    relationships: 'Nemesis of Jax; keeps challenging Ollie; deeply respectful of Nana.',
  },
  {
    name: 'Maya "Turbo" Brooks',
    promptName: 'Maya',
    role: 'race engineer and electric supermoto rider',
    age: 24,
    appearance: 'an athletic Black woman in her early twenties with dark braids tied in a low bun and a small smudge of grease on her cheekbone',
    outfit: 'a titanium-grey and purple perforated leather supermoto suit with kneesliders and a ruggedized wrist lap-timer',
    helmet: 'full-face',
    helmetLook: 'a forged-carbon full-face helmet with a tinted visor',
    vehicle: 'a high-torque purple electric supermoto bike with an exposed aluminium trellis frame and carbon-fibre rims',
    vehicleType: 'bike',
    personality: 'analytical, data-driven rider who calculates launch speed and ramp angle down to the degree',
    catchphrase: 'Physics says yes!',
    failLine: 'Data collected. Going again.',
    voiceAccent: 'American (Detroit)',
    voiceDescription: "a young woman's quick, witty voice with an American accent that speeds up when she gets excited",
    signatureMove: 'Rocket Ramp: launches off a precision-built ramp into a twisting mid-air superman',
    quirk: 'taps the stopwatch button on her rugged wrist lap-timer',
    backstory: 'Mechanical engineering graduate who builds and rides the team prototype bikes.',
    relationships: "Engineers the crew's ramps; keeps beating Dex with telemetry; Ollie's best friend.",
  },
  {
    name: 'Nana Nitro',
    promptName: 'Nana',
    role: 'veteran rally legend and wildcard',
    age: 58,
    appearance: 'a poised silver-haired woman in her late fifties with a neat low bun, weathered sun-lined skin around sharp eyes and a calm half-smile',
    outfit: 'a classic navy-and-silver quilted FIA rally race suit with dark-brown leather driving gloves',
    helmet: 'open-face',
    helmetLook: 'a heritage gloss-white open-face FIA rally helmet with an adjustable sun peak and intercom mic',
    vehicle: 'a heritage white-and-gold wide-arch rally hatchback with gravel mudflaps, auxiliary rally light pods and tarmac rally wheels',
    vehicleType: 'car',
    personality: 'cool-headed veteran rally champion who effortlessly out-drives riders half her age',
    catchphrase: "Kettle's on, dears!",
    failLine: 'A hair too much throttle.',
    voiceAccent: 'New Zealand',
    voiceDescription: "an older woman's warm, composed voice with a New Zealand accent, gentle but authoritative",
    signatureMove: 'Sunday Roast: pulls a full-speed handbrake slide and parks perfectly between two hay bales',
    quirk: 'clicks a mechanical chrome rally chronograph',
    backstory: 'Real name Margaret Hughes: a three-time 1980s gravel rally champion and the paddock chief instructor.',
    relationships: 'Everyone calls her Nana; the only driver Dex never trash-talks; mentors Ollie and Kira.',
  },
];

export const MOCK_SCENES: SceneInput[] = [
  {
    name: 'Volcano Rim Rally', regionFlavor: 'NZ', vibe: 'raw volcanic-gravel motorsport realism', features: ['ramp', 'dirt'],
    location: 'a closed black volcanic-gravel rally stage on a high ridge in New Zealand with dark basalt rock walls, orange jersey barriers and a red steel timing gantry in the background',
    lighting: 'warm 4000K golden-hour sunset casting long directional shadows across the dark gravel', timeOfDay: 'twilight', weather: 'clear sky with light gravel dust hanging in the air',
    setPieces: 'a compacted basalt-gravel launch ramp, a banked rock-wall hairpin turn, orange concrete safety barriers',
    cameraStyle: 'low-angle 35mm gimbal tracking and telephoto compression against the basalt ridge', ambient: 'wind across open rock, distant generator hum',
  },
  {
    name: 'Skyscraper Gap Jump', regionFlavor: 'Global', vibe: 'industrial container-port proving ground', features: ['ramp', 'tarmac'],
    location: 'a closed concrete shipping-port pier at night with tall stacked steel containers, floodlit yellow dock cranes in the background and heavy tyre-wall barriers',
    lighting: 'crisp 5000K port floodlights with city skyline reflections across the water', timeOfDay: 'night', weather: 'clear, light coastal wind',
    setPieces: 'a heavy steel-truss launch ramp, a painted yellow landing zone box, rows of tyre barriers',
    cameraStyle: 'tracking shots alongside the ramp, slow motion at the peak', ambient: 'harbour wind, distant water lapping against concrete pilings',
  },
  {
    name: 'Monster Ramp Desert', regionFlavor: 'US', vibe: 'big-show desert proving ground', features: ['ramp', 'dirt', 'crowd', 'sparks'],
    location: 'a closed Nevada desert proving ground with a compacted dirt jump line, parked heavy haul trucks behind the barriers and grandstands',
    lighting: 'warm 3800K golden-hour sun with long shadows and natural lens flare', timeOfDay: 'sunset', weather: 'clear, light desert dust',
    setPieces: 'a compacted dirt launch ramp, cold-spark fountains beside the landing zone, red-and-white safety barriers',
    cameraStyle: 'wide reveals and landing-ramp tracking shots', ambient: 'cheering crowd in the grandstands, desert wind',
  },
  {
    name: 'Double-Decker Docklands', regionFlavor: 'UK', vibe: 'gritty British docklands film lot', features: ['ramp', 'wall', 'wet', 'tarmac', 'water'],
    location: 'a closed-off rain-soaked London docklands film lot with red-brick warehouses, wet cobblestones and stacked shipping containers',
    lighting: 'warm 3200K amber streetlights reflecting in wet puddles', timeOfDay: 'night', weather: 'steady rain',
    setPieces: 'a steel launch ramp beside parked red double-decker buses, a curved concrete clipping wall, a wet cobblestone straight',
    cameraStyle: 'gimbal follow shots and low puddle-level reflections', ambient: 'steady rain on metal roofs, a distant harbour horn',
  },
  {
    name: 'Outback Road-Train Run', regionFlavor: 'AU', vibe: 'sun-baked outback proving track', features: ['ramp', 'dirt', 'obstacles'],
    location: 'a closed red-dirt outback station proving track with a parked flatbed trailer ramp and a steel windmill water tank on the horizon',
    lighting: 'bright 5600K midday sun with subtle heat shimmer over the red dirt', timeOfDay: 'midday', weather: 'hot and dry',
    setPieces: 'the steel flatbed trailer ramp, a slalom of hay bales, the steel windmill landmark',
    cameraStyle: 'helmet-mounted action camera and low dust-level tracking', ambient: 'cicadas buzzing, dry outback wind',
  },
  {
    name: 'Aurora Ice Arena', regionFlavor: 'CA', vibe: 'floodlit winter ice track', features: ['ice', 'ramp', 'obstacles'],
    location: 'a ploughed frozen-lake ice proving track in Canada ringed by snow-covered pine trees and snowbank safety walls',
    lighting: 'crisp 5000K track floodlights with soft green aurora light in the night sky', timeOfDay: 'night', weather: 'crisp, light snowfall',
    setPieces: 'marker-cone slalom gates, compacted snow-bank spray walls, a compacted snow launch ramp',
    cameraStyle: 'low ice-level tracking and wide aerial sweeps', ambient: 'creaking ice, soft wind in the pines',
  },
  {
    name: 'Abandoned Theme Park', regionFlavor: 'Global', vibe: 'industrial steelworks skidpad', features: ['ramp', 'tarmac', 'wall', 'obstacles'],
    location: 'a closed decommissioned steelworks yard with weathered brick blast-furnace towers, a wide cured-asphalt skidpad and concrete barriers',
    lighting: 'cool 4500K floodlights cutting through light evening mist', timeOfDay: 'night', weather: 'light mist',
    setPieces: 'a steel kicker ramp, a curved concrete clipping wall, a row of orange marker cones',
    cameraStyle: 'slow push-ins and low-angle tracking shots', ambient: 'wind through steel girders, distant industrial hum',
  },
  {
    name: 'Cargo Jet Escape', regionFlavor: 'Global', vibe: 'airfield tarmac proving ground', features: ['tarmac', 'ramp', 'obstacles'],
    location: 'a closed airfield hangar apron with a parked twin-turboprop cargo aircraft in the background and wide concrete tarmac',
    lighting: 'bright 5500K overcast daylight with crisp diffused shadows', timeOfDay: 'midday', weather: 'windy',
    setPieces: 'a portable steel launch ramp, walls of stacked tyres, a long runway straight',
    cameraStyle: 'low bumper cams and high-speed side-tracking shots', ambient: 'wind across the open runway, distant airfield hum',
  },
  {
    name: 'Golden Coast Beach Bash', regionFlavor: 'AU', vibe: 'sunrise coastal sand track', features: ['sand', 'ramp', 'water', 'obstacles'],
    location: 'a closed hard-packed coastal sand track beside rolling surf with a timber lifeguard tower in the background',
    lighting: 'warm 3600K sunrise light glinting off wet sand and sea spray', timeOfDay: 'sunrise', weather: 'sunny and breezy',
    setPieces: 'compacted sand-dune kickers, a shallow tidal splash straight, a slalom of orange marker cones',
    cameraStyle: 'low sand-level tracking, slow-motion sand spray', ambient: 'waves breaking, coastal wind',
  },
  {
    name: 'Alpine Hairpin Course', regionFlavor: 'Global', vibe: 'closed mountain hillclimb stage', features: ['tarmac', 'obstacles'],
    location: 'a closed mountain hillclimb tarmac course with tight switchback hairpins, stone parapet walls and red-and-white Armco barriers',
    lighting: 'warm 4200K morning sunlight breaking through low valley mist', timeOfDay: 'early morning', weather: 'low cloud in the valley below',
    setPieces: 'back-to-back tarmac hairpins, a stone bridge crossing, a painted finish line',
    cameraStyle: 'chase cams and slow-motion apex shots', ambient: 'cool mountain wind, echoing exhaust note',
  },
  {
    name: 'Neon Underpass', regionFlavor: 'Global', vibe: 'sodium-lit highway tunnel film set', features: ['tarmac', 'wall', 'wet', 'sparks'],
    location: 'a closed concrete highway tunnel film set with ribbed concrete walls, wet asphalt and rows of overhead tunnel light fixtures',
    lighting: 'warm 3200K amber sodium-vapour tunnel lights and cool 5000K LED strips reflecting on wet asphalt', timeOfDay: 'night', weather: 'damp pavement',
    setPieces: 'a banked concrete tunnel wall, a gate of cold-spark fountains, a low stage-haze bank',
    cameraStyle: 'handheld 35mm close-ups and slow motion through the sparks', ambient: 'water dripping in the tunnel, deep acoustic echo',
  },
  {
    name: 'Mega Stadium Finale', regionFlavor: 'US', vibe: 'championship supercross stadium', features: ['ramp', 'dirt', 'crowd', 'sparks'],
    location: 'a packed indoor motorsport stadium with giant LED scoreboards, sculpted red-clay dirt jumps and a high-density airbag landing ramp',
    lighting: 'bright 5600K stadium floodlights and bursts of cold-spark fountains', timeOfDay: 'night', weather: 'clear indoor air',
    setPieces: 'a triple-jump dirt rhythm section, cold-spark cannons, a pro airbag landing zone',
    cameraStyle: 'trackside gimbal POV and slow-motion landings', ambient: 'roaring stadium crowd, an echoing PA announcer',
  },
];
type Travel = 'pass' | 'static' | 'circle';

interface Stunt {
  key: string;
  type: 'bike' | 'car';
  short: string;
  text: string;
  tag: string;
  airborne: boolean;
  travel: Travel;
  /** Props the stunt needs that a scene may not mention (listed in the Setting line). */
  props?: string;
  needs?: SceneFeature[];
  anyOf?: SceneFeature[];
}

const STUNTS: Stunt[] = [
  { key: 'long-wheelie', type: 'bike', short: 'Endless Wheelie', text: 'holds a long, steady wheelie across the open course', tag: '#Wheelie', airborne: false, travel: 'pass' },
  { key: 'foam-stoppie', type: 'bike', short: 'Inches-Away Stoppie', text: 'brakes into a stoppie and stops inches from a wall of soft foam blocks', tag: '#Stoppie', airborne: false, travel: 'pass', props: 'a waist-high wall of soft foam blocks' },
  { key: 'backflip', type: 'bike', short: 'Backflip', text: 'launches off the ramp and rotates once backwards, landing rear wheel first', tag: '#Backflip', airborne: true, travel: 'pass', needs: ['ramp'] },
  { key: 'superman-sparks', type: 'bike', short: 'Superman Through Sparks', text: 'launches off the ramp into a no-hands superman pose through a ring of cold-spark fountains', tag: '#SupermanJump', airborne: true, travel: 'pass', needs: ['ramp', 'sparks'] },
  { key: 'wall-ride', type: 'bike', short: 'Wall Ride', text: 'rides sideways along the curved wall', tag: '#WallRide', airborne: false, travel: 'pass', needs: ['wall'] },
  { key: 'whip', type: 'bike', short: 'Whip Jump', text: 'launches off the ramp and whips the bike sideways in mid-air', tag: '#WhipJump', airborne: true, travel: 'pass', needs: ['ramp'] },
  { key: 'circle-wheelie', type: 'bike', short: 'Circle Wheelie', text: 'pulls a wheelie in a tight circle around a ring of traffic cones', tag: '#Wheelie', airborne: false, travel: 'circle', props: 'a small ring of orange traffic cones' },
  { key: 'smoke-wheelie', type: 'bike', short: 'Smoke Wall Wheelie', text: 'pulls a stand-up wheelie through a bank of coloured smoke', tag: '#Wheelie', airborne: false, travel: 'pass', props: 'a bank of harmless coloured smoke' },
  { key: 'mega-jump', type: 'bike', short: 'Mega Jump', text: 'launches off the ramp and flies the full length of the landing zone', tag: '#BigAir', airborne: true, travel: 'pass', needs: ['ramp'] },
  { key: 'splash-wheelie', type: 'bike', short: 'Splash Wheelie', text: 'wheelies through shallow water, sending up a wall of spray', tag: '#Wheelie', airborne: false, travel: 'pass', anyOf: ['water', 'wet'] },
  { key: 'wheelie-slalom', type: 'bike', short: 'Wheelie Slalom', text: 'weaves a wheelie through a line of cones', tag: '#Wheelie', airborne: false, travel: 'pass', props: 'a straight line of orange cones', needs: ['obstacles'] },
  { key: 'heel-clicker', type: 'bike', short: 'Heel Clicker', text: 'launches off the ramp and clicks both heels together over the handlebars', tag: '#FreestyleMotocross', airborne: true, travel: 'pass', needs: ['ramp'] },
  { key: 'ice-lean', type: 'bike', short: 'Ice Lean', text: 'leans the bike almost flat through an icy corner, spraying ice crystals', tag: '#IceRacing', airborne: false, travel: 'pass', needs: ['ice'] },
  { key: 'sand-slide', type: 'bike', short: 'Sand Slide', text: 'power-slides across the sand, throwing up a golden rooster tail', tag: '#Motocross', airborne: false, travel: 'pass', needs: ['sand'] },
  { key: 'seat-stand', type: 'bike', short: 'Seat Stand Wheelie', text: 'stands on the seat while the bike rolls in a slow wheelie', tag: '#FreestyleMotocross', airborne: false, travel: 'pass' },
  { key: 'pivot', type: 'bike', short: 'Front-Wheel Pivot', text: 'brakes hard and pivots the bike 180 degrees on its front wheel', tag: '#Stoppie', airborne: false, travel: 'static' },
  { key: 'tyre-ring-drift', type: 'car', short: 'Tyre Ring Drift', text: 'drifts in a tight circle around a ring of stacked tyres', tag: '#Drift', airborne: false, travel: 'circle', props: 'a ring of stacked tyres' },
  { key: '360-park', type: 'car', short: '360 Park', text: 'spins 360 degrees and slides perfectly into a gap between two hay bales', tag: '#Drift', airborne: false, travel: 'static', props: 'two hay bales with a car-sized gap between them' },
  { key: 'two-wheel', type: 'car', short: 'Two-Wheel Ski', text: 'tilts up onto two wheels and drives along the straight', tag: '#CarStunts', airborne: false, travel: 'pass', needs: ['tarmac'] },
  { key: 'j-turn', type: 'car', short: 'J-Turn', text: 'reverses at speed, spins 180 degrees and drives off forwards in one move', tag: '#JTurn', airborne: false, travel: 'static' },
  { key: 'splash-jump', type: 'car', short: 'Splash Jump', text: 'launches off the ramp and lands with a huge splash in shallow water', tag: '#CarJump', airborne: true, travel: 'pass', needs: ['ramp', 'water'] },
  { key: 'figure-eight', type: 'car', short: 'Figure-Eight Drift', text: 'drifts a figure eight between two cold-spark fountains', tag: '#Drift', airborne: false, travel: 'circle', needs: ['sparks'] },
  { key: 'line-stop', type: 'car', short: 'Line Stop', text: 'slides sideways and stops exactly on a painted line', tag: '#Drift', airborne: false, travel: 'static', props: 'a bright painted stop line', needs: ['tarmac'] },
  { key: 'spark-corridor', type: 'car', short: 'Spark Corridor Drift', text: 'drifts through a corridor of cold-spark fountains', tag: '#Drift', airborne: false, travel: 'pass', needs: ['sparks'] },
  { key: 'donut-circle', type: 'car', short: 'Donut Circle', text: 'spins donuts in a ring around a single traffic cone', tag: '#Donuts', airborne: false, travel: 'circle', props: 'a single orange traffic cone' },
  { key: 'wave-slide', type: 'car', short: 'Wave Slide', text: 'power-slides through deep puddles, sending up a huge wave of water', tag: '#Drift', airborne: false, travel: 'pass', anyOf: ['water', 'wet'] },
  { key: 'ice-drift', type: 'car', short: 'Ice Drift', text: 'drifts across the ice in one long arc, spraying snow', tag: '#Drift', airborne: false, travel: 'pass', needs: ['ice'] },
  { key: 'sand-drift', type: 'car', short: 'Sand Drift', text: 'drifts across the sand, throwing up a golden rooster tail', tag: '#Drift', airborne: false, travel: 'pass', needs: ['sand'] },
  { key: 'drift-slalom', type: 'car', short: 'Drift Slalom', text: 'drifts left and right through a line of cones', tag: '#Drift', airborne: false, travel: 'pass', props: 'a straight line of orange cones', needs: ['obstacles'] },
  { key: 'reverse-180', type: 'car', short: 'Reverse 180', text: 'reverses through a narrow gate of cones, flicks 180 degrees and powers away', tag: '#CarStunts', airborne: false, travel: 'static', props: 'a narrow gate of two cones' },
  { key: 'big-air', type: 'car', short: 'Big Air Jump', text: 'launches off the ramp and lands flat on all four wheels', tag: '#CarJump', airborne: true, travel: 'pass', needs: ['ramp'] },
  { key: 'wall-kiss', type: 'car', short: 'Wall Kiss Drift', text: 'drifts so close to the curved wall that the rear bumper almost touches it', tag: '#Drift', airborne: false, travel: 'pass', needs: ['wall'] },
];

const GENERIC_NAMES: Array<[RegExp, string]> = [
  [/backflip|flip/i, 'Backflip'],
  [/wheelie/i, 'Wheelie'],
  [/donut/i, 'Donuts'],
  [/handbrake/i, 'Slide'],
  [/drift/i, 'Drift'],
  [/superman/i, 'Superman'],
];

function signatureStunt(c: Character): Stunt | null {
  if (!c.signatureMove) return null;
  const { name, description } = splitMove(c.signatureMove);
  const generic = GENERIC_NAMES.find(([re]) => re.test(description))?.[1] ?? '';
  // Add a searchable trick word ("Wobble" -> "Wobble Wheelie") unless the name already implies it.
  const short = name && generic && !GENERIC_NAMES.find(([, g]) => g === generic)![0].test(name) ? `${name} ${generic}` : name || 'Signature Move';
  const needs: SceneFeature[] = [...(/ramp/i.test(description) ? (['ramp'] as SceneFeature[]) : []), ...(/spark/i.test(description) ? (['sparks'] as SceneFeature[]) : [])];
  return {
    key: `sig-${promptNameOf(c).toLowerCase()}`,
    type: c.vehicleType,
    short,
    text: description,
    tag: c.vehicleType === 'bike' ? '#FreestyleMotocross' : '#Drift',
    airborne: /launch|jump|flip|\bair\b/i.test(description),
    travel: /donut|spin|park/i.test(description) ? 'static' : 'pass',
    props: /hay bale/i.test(description) ? 'two hay bales with a car-sized gap between them' : undefined,
    needs,
  };
}

const fits = (s: Stunt, scene: Scene) =>
  (s.needs ?? []).every((f) => scene.features.includes(f)) && (!s.anyOf || s.anyOf.some((f) => scene.features.includes(f)));

const FEATURE_WORDS: Partial<Record<SceneFeature, RegExp>> = {
  ramp: /ramp|kicker/i,
  wall: /wall/i,
  water: /water|splash|puddle|surf/i,
  wet: /puddle|splash|wet/i,
  sparks: /spark/i,
  obstacles: /cone|bale|gate|slalom|ball|tyres/i,
};

/** The scene's set pieces that this stunt actually uses (e.g. only the ramp for a jump). */
function usedSetPieces(s: Stunt, scene: Scene): string[] {
  const pieces = scene.setPieces.split(/,\s*(?![^()]*\))/).map((p) => p.trim()).filter(Boolean);
  const wanted = [...(s.needs ?? []), ...(s.anyOf ?? []).filter((f) => scene.features.includes(f))];
  return [...new Set(wanted.flatMap((f) => pieces.filter((p) => FEATURE_WORDS[f]?.test(p)).slice(0, 1)))];
}

export function findStunt(stuntKey: string, characters: Character[]): Stunt | undefined {
  const key = stuntKey.split('@')[0];
  return STUNTS.find((s) => `${s.type}:${s.key}` === key) ?? characters.map(signatureStunt).find((s) => s && `${s.type}:${s.key}` === key) ?? undefined;
}

interface Beat {
  action: (l: string, o: string) => string;
  speaker: 'lead' | 'other';
  line: (lead: Character, other?: Character) => string;
  emotion: string;
}

interface Twist {
  key: string;
  solo?: boolean;
  villainOnly?: boolean;
  friendlyOnly?: boolean;
  sameVehicle?: boolean;
  /** The rival lost a bet/prank/trophy, so a revenge CTA makes sense. */
  rivalLost?: boolean;
  /** Only usable in scenes where this returns true. */
  when?: (scene: Scene) => boolean;
  /** Prop the lead ends up holding in the CTA clip. */
  leadProp?: string;
  concept: (l: string, o: string) => string;
  hookText: (l: string, o: string) => string;
  tension: (l: string, o: string) => string;
  pinned: (l: string, o: string) => string;
  setup?: Beat;
  stuntDetail?: string;
  payoff: Beat & { sfx: string };
}

const TWISTS: Twist[] = [
  {
    key: 'bet',
    rivalLost: true,
    leadProp: 'a shiny coin',
    concept: (l, o) => `${o} bets ${l} cannot pull it off`,
    hookText: () => 'LOSER BUYS LUNCH.',
    tension: (l, o) => `${o} bet ${l} can't pull it off. Loser buys lunch.`,
    pinned: (l, o) => `Who's buying lunch next time, ${l} or ${o}? 🍔`,
    setup: { action: (_l, o) => `${o} holds up a shiny coin and raises an eyebrow`, speaker: 'other', line: () => "Bet you can't pull it off. Loser buys lunch.", emotion: 'smirking' },
    payoff: { action: (l, o) => `${o} flicks the shiny coin to ${l}, eyebrows raised in disbelief`, speaker: 'other', line: () => 'Fine. Lunch is on me.', emotion: 'sighing', sfx: 'a coin pinging through the air' },
  },
  {
    key: 'copycat',
    sameVehicle: true,
    concept: (_l, o) => `${o} tries to copy it and fails`,
    hookText: () => 'COPYCAT ALERT.',
    tension: (l, o) => `${l} pulls it off. Then ${o} wants a turn.`,
    pinned: (_l, o) => `Should ${o} try again tomorrow? 😂`,
    payoff: {
      action: (_l, o) => `${o} walks over covered in soft foam crumbs after a failed attempt`,
      speaker: 'other',
      line: (_lead, other) => other?.failLine || 'That was on purpose.',
      emotion: 'sheepish',
      sfx: 'soft foam crumbs pattering to the ground',
    },
  },
  {
    key: 'vow',
    sameVehicle: true,
    concept: (_l, o) => `${o} vows to go even bigger next time`,
    hookText: () => 'CHALLENGE ACCEPTED.',
    tension: (l, o) => `${l} sets the bar. ${o} is already planning a comeback.`,
    pinned: (_l, o) => `Can ${o} top that? 👇`,
    payoff: { action: (l, o) => `${o} steps up to ${l} and points at the run with a challenging grin`, speaker: 'other', line: () => 'Tomorrow, I go bigger.', emotion: 'smug', sfx: 'gravel crunching underfoot' },
  },
  {
    key: 'near-miss',
    solo: true,
    concept: (l) => `${l} nearly loses it but saves it`,
    hookText: () => 'THIS ALMOST WENT WRONG.',
    tension: () => 'One run. No second chances.',
    pinned: () => 'Rate that save from 1 to 10 👇',
    payoff: { action: (l) => `${l} lets out a huge breath and starts laughing`, speaker: 'lead', line: (lead) => lead.catchphrase, emotion: 'relieved', sfx: 'a long relieved exhale' },
  },
  {
    key: 'prank',
    rivalLost: true,
    villainOnly: true,
    leadProp: 'the rubber chicken',
    concept: (l, o) => `${o} pranks ${l} with a rubber chicken`,
    hookText: () => 'WHO DID THIS?!',
    tension: (l) => `Someone left a surprise on ${l}'s ride.`,
    pinned: (l, o) => `Should ${l} get revenge on ${o}? 🐔`,
    setup: { action: (l, o) => `${o} chuckles and tapes a rubber chicken to the front of ${l}'s vehicle`, speaker: 'other', line: () => 'Good luck, champ.', emotion: 'snickering' },
    stuntDetail: 'with a rubber chicken taped to the front of the vehicle',
    payoff: { action: (l, o) => `${l} holds up the rubber chicken while ${o} facepalms`, speaker: 'lead', line: (_lead, other) => `Nice try, ${other ? promptNameOf(other) : 'mate'}.`, emotion: 'laughing', sfx: 'a rubber chicken squeak' },
  },
  {
    key: 'trophy',
    rivalLost: true,
    villainOnly: true,
    leadProp: 'a big golden trophy',
    concept: (l, o) => `${l} goes to win back a trophy ${o} stole`,
    hookText: (_l, o) => `${o.toUpperCase()} STOLE MY TROPHY.`,
    tension: (l, o) => `${o} stole the trophy. ${l} wants it back.`,
    pinned: (l, o) => `${o} wants a rematch. Who takes it, ${l} or ${o}? 🏆`,
    setup: { action: (_l, o) => `${o} holds up a big golden trophy and smirks`, speaker: 'other', line: () => 'Want your trophy back? Earn it.', emotion: 'taunting' },
    payoff: { action: (l, o) => `${l} takes the golden trophy from ${o} and lifts it high while ${o} gives three slow sarcastic claps`, speaker: 'other', line: (_lead, other) => other?.failLine || 'Lucky. Pure luck.', emotion: 'grumbling', sfx: 'three slow claps' },
  },
  {
    key: 'stopwatch',
    concept: (_l, o) => `${o} times the run on a stopwatch`,
    hookText: () => 'BEAT THE CLOCK.',
    tension: (l, o) => `${o} has a stopwatch. ${l} has one shot.`,
    pinned: () => 'How fast do you think that was? ⏱️',
    setup: { action: (_l, o) => `${o} holds up a big stopwatch, thumb on the button`, speaker: 'other', line: () => "Clock's running. Go!", emotion: 'focused' },
    payoff: { action: (_l, o) => `${o} stares at the stopwatch, mouth falling open`, speaker: 'other', line: () => 'Six point two! New record!', emotion: 'stunned', sfx: 'a stopwatch click' },
  },
  {
    key: 'mentor',
    friendlyOnly: true,
    concept: (l, o) => `${o} coaches ${l} through it`,
    hookText: () => 'LESSON ONE.',
    tension: (l, o) => `${o} has one tip for ${l}.`,
    pinned: (l, o) => `What should ${o} teach ${l} next? 👇`,
    setup: { action: (l, o) => `${o} rests a hand on ${l}'s shoulder and nods`, speaker: 'other', line: () => 'Eyes up. Trust the ride.', emotion: 'calm' },
    payoff: { action: (l, o) => `${o} and ${l} share a big high five`, speaker: 'lead', line: (lead) => lead.catchphrase, emotion: 'beaming', sfx: 'a loud high-five clap' },
  },
  {
    key: 'charm',
    friendlyOnly: true,
    leadProp: 'a tiny golden horseshoe charm',
    concept: (l, o) => `${o} lends ${l} a lucky charm`,
    hookText: () => 'LUCK OR SKILL?',
    tension: (l, o) => `${o} swears this charm works. ${l} isn't so sure.`,
    pinned: () => 'Luck or skill? 👇',
    setup: { action: (l, o) => `${o} hands ${l} a tiny golden horseshoe charm`, speaker: 'other', line: () => "Lucky charm. Don't lose it.", emotion: 'serious' },
    payoff: { action: (l) => `${l} kisses the tiny golden horseshoe charm and holds it up`, speaker: 'lead', line: (lead) => lead.catchphrase, emotion: 'grinning', sfx: 'a tiny charm jingling' },
  },
  {
    key: 'biscuit',
    friendlyOnly: true,
    leadProp: 'a biscuit',
    concept: (l, o) => `${o} promises ${l} a biscuit if it works`,
    hookText: () => 'WILL WORK FOR BISCUITS.',
    tension: (l, o) => `${o} brought biscuits. ${l} has to earn one.`,
    pinned: () => 'Best stunt snack? 🍪',
    setup: { action: (_l, o) => `${o} holds up a plate of biscuits`, speaker: 'other', line: () => 'Pull it off and these are yours.', emotion: 'sweetly' },
    payoff: { action: (l, o) => `${o} hands ${l} a biscuit with a proud smile`, speaker: 'lead', line: () => 'Worth it.', emotion: 'chewing happily', sfx: 'a biscuit crunch' },
  },
  {
    key: 'last-light',
    when: (s) => /sunset|dusk|twilight|golden/i.test(`${s.timeOfDay} ${s.lighting}`),
    solo: true,
    concept: (l) => `${l} has one run before the light goes`,
    hookText: () => 'ONE SHOT LEFT.',
    tension: () => 'The light is fading. One run left.',
    pinned: () => 'Rate this run from 1 to 10 👇',
    payoff: { action: (l) => `${l} looks back at the run and pumps a fist`, speaker: 'lead', line: (lead) => lead.catchphrase, emotion: 'fired up', sfx: 'the engine settling into idle' },
  },
];

/** Weekly story arcs: episodes escalate, with a finale on Showdown day. */
/** Showdown finales must pay off the rivalry. */
const FINALE_TWISTS = ['bet', 'trophy', 'stopwatch', 'vow'];

const ARCS = {
  villain: { episodes: ['prank', 'bet', 'stopwatch'], finale: 'trophy' },
  friendly: { episodes: ['bet', 'stopwatch', 'mentor'], finale: 'vow' },
};

const isVillain = (c: Character) => /rival|villain|nemesis/i.test(c.role);
const pick = <T,>(arr: T[], i: number) => arr[((i % arr.length) + arr.length) % arr.length];
const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function feasible(t: Twist, lead: Character, other?: Character, scene?: Scene): boolean {
  if (t.when && scene && !t.when(scene)) return false;
  if (t.solo) return true;
  if (!other) return false;
  if (t.villainOnly && !isVillain(other)) return false;
  if (t.friendlyOnly && (isVillain(other) || isVillain(lead))) return false;
  if (t.sameVehicle && other.vehicleType !== lead.vehicleType) return false;
  return true;
}

export interface MockHistory {
  concepts: string[];
  stuntKeys: string[];
}

export function mockOutline(dates: string[], themes: string[], characters: Character[], scenes: Scene[], history: MockHistory, holidays: Holiday[] = []): OutlineDay[] {
  const used = new Set(history.stuntKeys.map((k) => k.split('@')[0]));
  const heroes = characters.filter((c) => !isVillain(c));
  const villain = characters.find(isVillain);
  const episodes = new Map<string, number>();
  const seriesTwists = new Map<string, Set<string>>();
  const twistUse = new Map<string, number>();
  let lastTwist = '';
  let lastScene = '';

  return dates.map((date, i) => {
    const theme = themes[i];
    const dayOfMonth = Number(date.slice(8, 10));
    // Arcs follow calendar weeks (Sunday to Saturday) so Showdown Saturday is always the finale.
    const firstWeekday = new Date(`${date.slice(0, 8)}01T00:00:00Z`).getUTCDay();
    const block = Math.floor((dayOfMonth - 1 + firstWeekday) / 7);
    // Each week features one rivalry; alternate villain weeks with friendly rivalries.
    const hero = heroes.length ? pick(heroes, block + Number(date.slice(5, 7))) : characters[0];
    const friendlyRival = heroes.find((c) => c.id !== hero.id && c.vehicleType !== hero.vehicleType) ?? heroes.find((c) => c.id !== hero.id);
    const rival = villain && block % 2 === 0 ? villain : friendlyRival ?? villain;
    const arcType = rival && isVillain(rival) ? 'villain' : 'friendly';
    const series = rival ? `${promptNameOf(hero)} vs ${promptNameOf(rival)}` : '';

    const showdown = /showdown|saturday/i.test(theme);
    const preferBike = /wheel|two-wheel|bike|moto|flying/i.test(theme) || (!/drift|throttle|car/i.test(theme) && i % 2 === 0);
    const typed = characters.filter((c) => c.vehicleType === (preferBike ? 'bike' : 'car'));
    const preferred = showdown ? hero : pick(typed.length ? typed : characters, i);
    const preferSignature = i % 4 === 0;

    const tryLead = (who: Character): { stunt: Stunt; scene: Scene } | null => {
      const pool: Stunt[] = [...(signatureStunt(who) ? [signatureStunt(who)!] : []), ...STUNTS.filter((s) => s.type === who.vehicleType)];
      // Prefer tricks that match the day's theme (Flying = airborne, Drift = drifting), then anything that fits.
      const themed = (s: Stunt) => (/flying/i.test(theme) ? s.airborne : /drift/i.test(theme) ? /drift|slide/i.test(`${s.short} ${s.text}`) : true);
      for (const strict of [true, false]) {
        for (let k = 0; k < scenes.length; k++) {
          const sc = pick(scenes, i * 5 + k);
          if (sc.id === lastScene && scenes.length > 1) continue;
          const candidates = pool.filter((s) => !used.has(`${s.type}:${s.key}`) && fits(s, sc) && (!strict || themed(s)));
          const choice = (preferSignature ? candidates.find((s) => s.key.startsWith('sig-')) : undefined) ?? candidates.find((s) => !s.key.startsWith('sig-')) ?? candidates[0];
          if (choice) return { stunt: choice, scene: sc };
        }
      }
      return null;
    };

    // If the preferred lead has used every trick, hand the day to someone else (same vehicle type first) before repeating.
    const leadOrder = [preferred, ...characters.filter((c) => c.id !== preferred.id && c.vehicleType === preferred.vehicleType), ...characters.filter((c) => c.vehicleType !== preferred.vehicleType)];
    let lead = preferred;
    let found: { stunt: Stunt; scene: Scene } | null = null;
    for (const who of leadOrder) {
      found = tryLead(who);
      if (found) {
        lead = who;
        break;
      }
    }
    let stunt: Stunt;
    let scene: Scene;
    let stuntKey: string;
    if (found) {
      ({ stunt, scene } = found);
      stuntKey = `${stunt.type}:${stunt.key}`;
    } else {
      // Every move has been used recently: allow a repeat, but only in a new location.
      const pool: Stunt[] = [...(signatureStunt(lead) ? [signatureStunt(lead)!] : []), ...STUNTS.filter((s) => s.type === lead.vehicleType)];
      scene = pick(scenes, i);
      stunt = pool.find((s) => fits(s, scene)) ?? pool[0];
      stuntKey = `${stunt.type}:${stunt.key}@${scene.id}`;
    }
    used.add(stuntKey.split('@')[0]);
    lastScene = scene.id;

    let twist: Twist | undefined;
    let other: Character | undefined;
    const partner = rival && lead.id === hero.id ? rival : rival && lead.id === rival.id ? hero : undefined;
    if (partner) {
      // Series episode: follow the weekly arc so episodes build on each other.
      const arc = ARCS[arcType];
      const ep = (episodes.get(series) ?? 0) + 1;
      const usedInSeries = seriesTwists.get(series) ?? new Set<string>();
      const order = showdown ? [arc.finale, ...FINALE_TWISTS] : [pick(arc.episodes, ep - 1), ...arc.episodes, ...TWISTS.filter((x) => x.key !== arc.finale).map((x) => x.key)];
      const options = order.map((k) => TWISTS.find((x) => x.key === k)!).filter((x) => !x.solo && feasible(x, lead, partner, scene));
      const t = options.find((x) => !usedInSeries.has(x.key)) ?? options[0];
      if (t) {
        twist = t;
        other = partner;
        seriesTwists.set(series, usedInSeries.add(t.key));
      }
    }
    if (!twist) {
      const others = characters.filter((c) => c.id !== lead.id);
      const arcKeys = new Set([...ARCS.villain.episodes, ARCS.villain.finale, ...ARCS.friendly.episodes, ARCS.friendly.finale]);
      const candidates: Array<{ t: Twist; o?: Character }> = [];
      for (const t of TWISTS) {
        if (t.key === lastTwist) continue;
        if (t.solo) {
          if (!t.when || t.when(scene)) candidates.push({ t });
        } else for (const o of others) if (feasible(t, lead, o, scene)) candidates.push({ t, o });
      }
      // Prefer the least-used twist, and keep arc twists for the series episodes.
      candidates.sort((a, b) => (twistUse.get(a.t.key) ?? 0) + (arcKeys.has(a.t.key) ? 1 : 0) - ((twistUse.get(b.t.key) ?? 0) + (arcKeys.has(b.t.key) ? 1 : 0)));
      const top = candidates.filter((c) => (twistUse.get(c.t.key) ?? 0) + (arcKeys.has(c.t.key) ? 1 : 0) === (twistUse.get(candidates[0].t.key) ?? 0) + (arcKeys.has(candidates[0].t.key) ? 1 : 0));
      const choice = pick(top, i);
      twist = choice.t;
      other = choice.o;
    }
    lastTwist = twist.key;
    twistUse.set(twist.key, (twistUse.get(twist.key) ?? 0) + 1);

    const L = promptNameOf(lead);
    const O = other ? promptNameOf(other) : '';
    const holiday = holidays.find((h) => h.date === date);
    const concept = `${holiday ? `${holiday.name} special. ` : ''}${L} attempts the ${stunt.short} (${stunt.text}) at ${scene.name}. Twist: ${twist.concept(L, O)}.`;
    const inSeries = !!other && !!rival && [lead.id, other.id].sort().join() === [hero.id, rival.id].sort().join();
    const episode = inSeries ? (episodes.get(series) ?? 0) + 1 : 0;
    if (inSeries) episodes.set(series, episode);
    return { date, theme, concept, characterIds: other ? [lead.id, other.id] : [lead.id], sceneId: scene.id, series: inSeries ? series : '', episode, stuntKey };
  });
}

const SHOTS = {
  setup: [
    { shotSize: 'Medium shot', angle: 'eye-level', movement: 'static camera with a subtle handheld drift', lens: '35mm lens' },
    { shotSize: 'Medium shot', angle: 'low angle', movement: 'slow push-in', lens: '35mm lens' },
    { shotSize: 'Medium shot', angle: 'eye-level', movement: 'slow dolly to the left', lens: '24mm lens' },
  ],
  stunt: {
    pass: [
      { shotSize: 'Wide shot', angle: 'low angle', movement: 'camera trucking alongside the run', lens: 'wide-angle lens' },
      { shotSize: 'Full shot', angle: 'ground level', movement: 'static camera as the vehicle passes close to the lens', lens: 'wide-angle lens' },
      { shotSize: 'Wide shot', angle: 'side-on', movement: 'smooth tracking shot', lens: '50mm lens' },
    ],
    static: [
      { shotSize: 'Full shot', angle: 'low angle', movement: 'slow orbit around the vehicle', lens: '24mm lens' },
      { shotSize: 'Wide shot', angle: 'high angle', movement: 'static camera looking down on the move', lens: '35mm lens' },
    ],
    circle: [
      { shotSize: 'Wide shot', angle: 'high angle', movement: 'slow crane up as the vehicle circles', lens: '24mm lens' },
      { shotSize: 'Full shot', angle: 'ground level', movement: 'static camera at the centre of the circle', lens: 'wide-angle lens' },
    ],
  },
  payoff: [
    { shotSize: 'Medium shot', angle: 'hip height', movement: 'static camera', lens: '35mm lens' },
    { shotSize: 'Medium shot', angle: 'eye-level', movement: 'slow push-in', lens: '50mm lens' },
  ],
  cta: [
    { shotSize: 'Medium close-up', angle: 'eye-level', movement: 'static camera', lens: '50mm lens, shallow depth of field' },
    { shotSize: 'Close-up', angle: 'slightly low angle', movement: 'slow push-in', lens: '85mm lens, shallow depth of field' },
  ],
};

const INTROS = ['One take. No excuses.', 'Watch closely.', "Let's do this.", 'Hold my helmet.', 'This one is for the crew.'];
const REPLIES = ['Deal.', 'Watch me.', 'Easy.', 'You are on.'];

/** CTAs are 4 s clips, so at most 6 words. Rematch lines are only used when the series really continues. */
const CTAS = ['Like, share and subscribe for more!', 'Like it, share it, subscribe!', 'Like, share, subscribe. Daily stunts!', 'Smash like, share, and subscribe!', 'Like, share and subscribe, crew!'];
const NEXT_EP_CTAS: Array<(o: string) => string> = [
  (o) => `${o} wants revenge. Like, share, subscribe!`,
  () => 'Round two soon. Like, share, subscribe!',
  () => 'Rematch is coming. Like, share, subscribe!',
];

const QUESTIONS: Array<(l: string, o: string) => string> = [
  () => 'Rate the landing from 1 to 10 👇',
  (l, o) => (o ? `Team ${l} or team ${o}? 👇` : `What should ${l} try next? 👇`),
  () => 'Which location should we hit next? 👇',
  (l) => `Give ${l} a score out of 10 👇`,
];

const HOLIDAY_DRESSING: Array<[RegExp, string]> = [
  [/christmas/i, 'tinsel on the safety barriers, strings of fairy lights and a small decorated tree'],
  [/halloween/i, 'carved pumpkins along the barriers and orange string lights'],
  [/independence/i, 'red, white and blue bunting on the barriers'],
  [/new year/i, 'gold balloons and strings of fairy lights on the barriers'],
  [/bonfire/i, 'a safe, distant bonfire glow and sparkler-style light strings'],
  [/valentine/i, 'red heart balloons tied to the barriers'],
  [/thanksgiving|black friday/i, 'autumn leaves and orange bunting on the barriers'],
];

function engineSound(c: Character, revving: boolean): string {
  if (/electric/i.test(c.vehicle)) return revving ? 'a rising electric whine' : 'a soft electric hum';
  if (c.vehicleType === 'bike') return revving ? 'a high-revving dirt-bike engine' : 'a dirt-bike engine ticking over';
  return revving ? 'a roaring engine at full throttle' : 'an engine idling with a deep burble';
}

function surfaceSound(scene: Scene, c: Character): string {
  const f = scene.features;
  if (f.includes('ice')) return 'studded tyres crunching on ice';
  if (f.includes('sand')) return 'sand hissing under the tyres';
  if (f.includes('wet') || f.includes('water')) return 'tyres hissing through puddles';
  if (f.includes('dirt')) return 'knobby tyres spitting gravel';
  return c.vehicleType === 'car' ? 'tyres squealing' : 'tyres chirping';
}

/** "whispers to the camera like a narrator" -> "whispering to the camera like a narrator" */
function asManner(quirk: string): string {
  const [verb, ...rest] = quirk.split(' ');
  const base = verb.replace(/es$/, '').replace(/s$/, '');
  const gerund = base.endsWith('e') ? `${base.slice(0, -1)}ing` : `${base}ing`;
  return [gerund, ...rest].join(' ');
}

export interface MockPackOptions {
  hasNextEpisode?: boolean;
  holiday?: Holiday;
}

export function mockDayPack(day: OutlineDay, characters: Character[], scene: Scene, dayIndex: number, usedCtas: string[], opts: MockPackOptions = {}): DayPack {
  const cast = day.characterIds.map((id) => characters.find((c) => c.id === id)).filter((c): c is Character => !!c);
  const lead = cast[0] ?? characters[0];
  const other = cast[1];
  const L = promptNameOf(lead);
  const O = other ? promptNameOf(other) : '';
  const stunt = findStunt(day.stuntKey, characters) ?? STUNTS.find((s) => s.type === lead.vehicleType)!;
  const twist = TWISTS.find((t) => day.concept.includes(`Twist: ${t.concept(L, O)}.`)) ?? TWISTS.find((t) => t.solo)!;
  const seed = hash(`${day.date}|${day.stuntKey}`);
  const crowd = scene.features.includes('crowd') ? ', the crowd roaring' : '';
  const helmeted = lead.helmet !== 'none';
  const spokenQuirk = !!lead.quirk && isSpokenQuirk(lead.quirk);
  const setup = twist.setup && other ? twist.setup : undefined;

  // Setup: the other character's challenge (if any) and the lead's reply; spoken quirks become the delivery style.
  const leadSetupLine = setup
    ? pick([...REPLIES, ...(lead.catchphrase.split(' ').length <= 5 ? [lead.catchphrase] : [])], seed)
    : seed % 3 === 0
      ? lead.catchphrase
      : pick(INTROS, seed);
  const setupLines: Line[] = [
    ...(setup ? [{ speaker: O, text: setup.line(lead, other), emotion: setup.emotion }] : []),
    { speaker: L, text: leadSetupLine, emotion: spokenQuirk ? asManner(lead.quirk) : setup ? 'grinning' : 'pumped up' },
  ];
  const leadBeat = lead.quirk && !spokenQuirk ? `${L} ${lead.quirk}` : `${L} sizes up the run with a confident grin`;
  const setupAction = setup ? `${leadBeat}; nearby, ${setup.action(L, O)}.` : `${leadBeat}.`;

  const nextEp = NEXT_EP_CTAS.map((f, i) => ({ text: f(O), revenge: i === 0 })).filter((c) => !c.revenge || twist.rivalLost).map((c) => c.text);
  const ctaPool = opts.hasNextEpisode && other ? nextEp : CTAS;
  const ctaLine = ctaPool.find((c, i) => i >= seed % ctaPool.length && !usedCtas.includes(c)) ?? ctaPool.find((c) => !usedCtas.includes(c)) ?? pick(ctaPool, seed);
  const payoffSpeaker = twist.payoff.speaker === 'other' && other ? O : L;
  const stuntShot = pick(SHOTS.stunt[stunt.travel], seed);

  const clips: Clip[] = [
    {
      beat: 'setup',
      durationSec: 8,
      ...pick(SHOTS.setup, seed),
      ...(setup ? { shotSize: 'Medium two-shot' } : {}),
      onScreen: setup ? [L, O] : [L],
      startFrame: `${L} stands beside the idling ${lead.vehicleType} at the start mark${helmeted ? ', helmet held under one arm' : ''}${setup ? `, ${O} standing beside ${L}` : ''}.`,
      action: setupAction,
      endFrame: `${L} stands ready at the start mark beside the idling ${lead.vehicleType} looking down the course.`,
      lines: setupLines,
      sfx: `${engineSound(lead, false)}, a soft gust of wind`,
      continuity: `Opening shot at the start mark with ${L}'s ${lead.vehicleType} idling behind.`,
    },
    {
      beat: 'stunt',
      durationSec: 8,
      ...stuntShot,
      onScreen: [L],
      startFrame: `${L} launches from the start mark on the exact same course with the same background landmarks and lighting.`,
      action: `${L} ${stunt.text}${twist.stuntDetail ? `, ${twist.stuntDetail}` : ''}${
        twist.key === 'near-miss' ? (stunt.airborne ? ', wobbling hard at the peak before landing perfectly' : ', wobbling hard before regaining control') : ''
      }. Slow motion from 3s to 5s at ${stunt.airborne ? 'the peak' : 'the most extreme moment'}.`,
      endFrame: `${L}'s ${lead.vehicleType} brakes smoothly to a stable stop in the run-off zone.`,
      lines: [],
      sfx: `${engineSound(lead, true)}, ${surfaceSound(scene, lead)}${stunt.airborne ? ', a heavy suspension thump on landing' : ''}, ${L} lets out a long wordless whoop${crowd}`,
      continuity: helmeted ? `${L} now wears the helmet and is at the start of the run.` : `${L} is now in the driver's seat at the start of the run.`,
    },
    {
      beat: 'payoff',
      durationSec: 6,
      ...pick(SHOTS.payoff, seed),
      ...(other ? { shotSize: 'Medium two-shot' } : {}),
      onScreen: other ? [L, O] : [L],
      startFrame: `${L} stands beside the stopped ${lead.vehicleType} in the run-off zone${helmeted ? ', helmet held under one arm' : ''}${other ? `, ${O} standing right beside ${L}` : ''}.`,
      action: `${twist.payoff.action(L, O)}.`,
      endFrame: `${L} stands beside the stopped ${lead.vehicleType} in the run-off zone smiling toward the camera.`,
      lines: [{ speaker: payoffSpeaker, text: twist.payoff.line(lead, other), emotion: twist.payoff.emotion }],
      sfx: `${engineSound(lead, false)}, ${twist.payoff.sfx}`,
      continuity: `Moments after the run, ${L} ${lead.vehicleType === 'car' ? 'stands beside the stopped car in the run-off zone' : `stands beside the stopped bike in the run-off zone${helmeted ? ' with the helmet off' : ''}`}.`,
    },
    {
      beat: 'cta',
      durationSec: 4,
      ...pick(SHOTS.cta, seed),
      onScreen: [L],
      startFrame: `${L} stands in the exact same spot beside the stopped ${lead.vehicleType} in the run-off zone${helmeted ? ', helmet held under one arm' : ''}, facing the camera.`,
      action: `${L} stands beside the ${lead.vehicleType}, looks straight into the camera and grins${twist.leadProp ? `, holding ${twist.leadProp}` : ''}.`,
      endFrame: `${L} holds a steady confident grin beside the stopped ${lead.vehicleType} as the shot settles.`,
      lines: [{ speaker: L, text: ctaLine, emotion: 'excited' }],
      sfx: 'a cooling engine ticking',
      continuity: `Direct continuation of Clip 3 in the same spot beside the stopped ${lead.vehicleType}${helmeted ? ', helmet still off' : ''}.`,
    },
  ];

  const holiday = opts.holiday;
  const dressing = holiday ? (HOLIDAY_DRESSING.find(([re]) => re.test(holiday.name))?.[1] ?? `festive ${holiday.name} decorations along the barriers`) : '';
  // Titles are US English, so only US holidays are named in them (and only when they fit inside 55 chars).
  const holidayWord = holiday && holiday.regions.includes('US') ? `${holiday.name.split(' / ')[0].replace(/ Day$/, '')} ` : '';
  const emoji = pick(['🏆', '', '🔥', '', '😱', ''], seed);
  const head = other ? `${L} vs ${O}: ` : `${L}'s `;
  let title = `${head}${holidayWord}${stunt.short}`;
  if (title.length > 55) title = `${head}${stunt.short}`;
  if (title.length + scene.name.length + 4 <= 50) title += ` at ${scene.name}`;
  if (emoji && title.length + 3 <= 50) title += ` ${emoji}`;
  const tension = twist.tension(L, O);
  const question = pick(QUESTIONS, seed)(L, O);
  const hashtags = [...new Set([lead.vehicleType === 'bike' ? '#MotorcycleStunts' : '#CarStunts', stunt.tag, '#AIvideo'])];
  const seriesTag = day.series ? ` (${day.series} · Ep ${day.episode})` : '';
  const description = `${tension}${seriesTag}\n${question}\n\n${SAFETY_LINE}\n\n${hashtags.join(' ')}`;
  const igTags = [
    ...new Set([
      lead.vehicleType === 'bike' ? '#motorcyclestunts' : '#carstunts',
      stunt.tag.toLowerCase(),
      '#aivideo',
      lead.vehicleType === 'bike' ? '#stuntriding' : '#drifting',
      ...(day.series ? [`#${day.series.replace(/\W/g, '').toLowerCase()}`] : []),
    ]),
  ].slice(0, 5);
  const stuntSet = [stunt.props, ...usedSetPieces(stunt, scene)].filter(Boolean).join('; ');

  const us = (s: string) => toSpelling(s, 'en-US');
  const enGB = { title: toSpelling(title, 'en-GB'), description: toSpelling(description, 'en-GB') };
  return {
    hookVisual: `the ${stunt.airborne ? 'peak of the jump' : 'most extreme moment'} of ${L}'s ${stunt.short} in slow motion`,
    hookText: twist.hookText(L, O),
    clips,
    negativeNouns: NEGATIVE_NOUNS,
    stuntSet,
    dressing,
    editNotes: day.series ? [`Optional end text for the series: ${day.series.toUpperCase()} · EP ${day.episode}`] : [],
    metadata: {
      title: us(title),
      description: us(description),
      hashtags,
      tags: [lead.vehicleType === 'bike' ? 'motorcycle stunts' : 'car stunts', stunt.short.toLowerCase(), 'AI stunt video', ...(day.series ? [day.series] : [])],
      enGB: enGB.title !== us(title) || enGB.description !== us(description) ? enGB : null,
      instagramCaption: us(`${tension}${emoji ? ` ${emoji}` : ''}\n${question}\n🎬 AI-generated fiction. Never try this.\n\n${igTags.join(' ')}`),
      instagramHashtags: igTags,
      pinnedComment: twist.pinned(L, O),
    },
    generatedBy: 'mock',
  };
}
