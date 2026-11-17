# 🏍️ StuntShorts Studio

An AI content planner for **bike & car stunt YouTube Shorts**. Each month it plans one Short per day as weekly story arcs and writes **ready-to-paste Google Flow prompts** (Omni Flash 1.2 or Veo 3.1 Lite). Every prompt uses your recurring characters and locations, includes spoken dialogue, and ends with a character asking viewers to **Like, Share & Subscribe**. One upload reaches viewers in the US, UK, Australia, Canada and New Zealand at a single daily time slot, and the app can publish to YouTube Shorts and Instagram Reels.

> The app doesn't generate video itself. It gives you the prompts; you make the clips in [Google Flow](https://labs.google/flow), export the MP4, and upload it here.

## Features

| Area | What you get |
| --- | --- |
| 📅 Monthly calendar | Plan a whole month in one click. Each calendar week (Sunday to Saturday) is a rivalry series, such as *Ollie vs Dex* Ep 1 to 3, that ends in a finale on Showdown Saturday. Villain weeks alternate with friendly rivalries, and 11 different story twists rotate without repeating within an arc. Tricks never repeat within 60 days and always fit the location (no wall rides where there's no wall). US/UK/AU/CA/NZ holidays become themed specials with set decorations. Weekday themes are used for planning only. |
| 🧑‍🚀 Character bible | A recurring cast with big, contrasting personalities. Each has a one-word prompt name, a visual-only look, helmet type, vehicle livery, voice lock, signature move, on-camera quirk, win and fail lines, backstory and rivalries. Only the visual and voice details go into prompts. |
| 🏜️ Scene library | Blockbuster-style closed sets with set pieces, an ambient sound, a mood and feature tags (ramp, wall, water, sparks…) that decide which tricks fit. |
| 🎬 Daily prompt pack | Four single-beat clips (setup 8 s → stunt 8 s → payoff 6 s → a 4 s CTA of at most 6 words = 26 s). Each clip's prompt follows the same order: shot, setting, the characters in shot, one action, dialogue (no quotation marks), audio (SFX, ambient, no music), style, then inline exclusions. You also get a "before you generate" checklist, separate edit notes (cold open, captions, music bed) and copy buttons for each clip.<br>• **Characters:** the lead's vehicle is shown only in setup and stunt shots. Car drivers wear a helmet for stunts.<br>• **Set pieces:** only the ones the trick uses are listed.<br>• **Flow Characters mode:** Settings can switch prompts to @Name references. |
| ✅ Prompt checks | Every pack is checked for clip length against the chosen model, spoken words that won't fit, dialogue during helmeted stunts, speakers who aren't on screen, double camera moves, quotation marks, real brand names, safety-filter wording, and wording that invites copying. AI output that fails a check is sent back for another try. |
| 🔊 Voice preview | Hear the dialogue in each character's accent using your browser's built-in text-to-speech. |
| 📦 Publishing kit | A US-English title (≤ 50 characters, "Hero vs Rival: Trick"), a description that builds tension without spoilers, 3 hashtags, keywords, an automatic en-GB localization when the spelling differs, an Instagram caption (≤ 5 hashtags) and a cliffhanger comment to pin. |
| ⏰ One global slot | Publishes daily at one UTC time (default 20:00 UTC = 01:30 IST, 15:00 New York, 20:00 London, 07:00 Sydney the next day). |
| 🚀 Publishing | Uploads run as background jobs, which retry temporary failures and resume after a restart without posting twice:<br>• **YouTube:** resumable chunked upload, AI-content disclosure, scheduling, en-GB localization, the series playlist, and a comment posted once the video is public.<br>• **Instagram Reels:** published at the same slot.<br>• **Safety guards:** blocks duplicate uploads, re-uploading the same file, publishing demo-template packs, landscape or over-3-minute videos, and packs with imitation wording or brand names. |
| ⬇ Export | Download the month as CSV (includes full Flow production sheets) or PDF. |

## Quick start

```powershell
npm install
copy .env.example .env    # add an AI key (Gemini recommended)
npm run dev               # opens the client on http://localhost:5173 (API on :5174)
```

1. **Settings:** choose your AI writer and the Google Flow model you use.
2. **Characters:** click **✨ Generate starter cast**, then make them yours.
3. **Scenes:** click **✨ Generate starter locations**.
4. **Calendar:** click **✨ Plan this month**, then **🎬 Generate all prompt packs**.
5. **Make the clips:** open a day and follow *Before you generate*:
   - In Flow, pick the model and Portrait.
   - Create a Flow Character for each cast member.
   - Paste each clip's prompt.
   - Use **Save frame** to chain the clips together.
6. **Edit:** apply the edit notes (cold open, hook caption, "AI-generated fiction" badge, one music bed) and export the MP4.
7. **Publish:** mark the day **🎥 Generated in Flow**, then upload. It goes live at the daily slot.

The **offline demo templates** (provider `mock`) need no key and are good for learning the workflow. Publishing is blocked for those packs, because YouTube's inauthentic-content policy doesn't monetize channels built on generic templates. Set `ALLOW_MOCK_PUBLISH=1` only if you understand the risk.

## AI providers

| Provider | `.env` key | Default model |
| --- | --- | --- |
| Google Gemini (recommended) | `GEMINI_API_KEY` ([get one](https://aistudio.google.com/apikey)) | `gemini-2.5-flash` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` |
| Ollama (local) | `OLLAMA_URL` | `llama3.1` |

## Google Flow models

| Setting | Clip lengths | Notes |
| --- | --- | --- |
| Omni Flash 1.2 (default) | 3–15 s (over 10 s needs a Google AI Plus, Pro or Ultra plan) | Prompts add "Single continuous shot, no scene cuts", because Omni cuts between shots by default. |
| Veo 3.1 Lite | 4, 6 or 8 s (Ingredients mode: 8 s only) | Trim in Scenebuilder if you use Ingredients. |

Flow has no negative-prompt box, so exclusions are written inline ("No subtitles or on-screen text. No music."). The noun list shown under *Negative prompt* is only for the Veo API's `negativePrompt` field.

## Publishing setup

### YouTube Shorts
1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable **YouTube Data API v3**.
2. Configure the OAuth consent screen and add yourself as a test user.
3. Create an **OAuth client ID** of type *Web application*, with the redirect URI `http://localhost:5174/api/auth/youtube/callback`.
4. Put `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in `.env`, restart, then go to **Settings → Connect YouTube**.
   - The app asks for the `youtube.force-ssl` scope, which it needs for playlists and comments. If you connected an earlier version, use **Reconnect**.

**What every upload includes:**
- Category: *Autos & Vehicles*
- Language: `en`, with an `en-GB` localization when the spelling differs
- `containsSyntheticMedia: true` (the AI-content disclosure)
- `selfDeclaredMadeForKids: false`
- When scheduled: uploaded as `private` with `publishAt` set to the daily slot. The slot must be at least 2 hours away so processing finishes first, and a job that runs late never sends a past `publishAt` (which would publish immediately).
- After upload: the video is added to the series playlist, and the cliffhanger comment is posted 10 minutes after it goes public. Pinning the comment and setting the *Related video* have to be done in YouTube Studio, because the API doesn't support them.

**Quota:** `videos.insert` has its own bucket of 100 calls per day, so quota isn't a limit for one Short a day.

### Instagram Reels (optional)
1. Use an Instagram **Business or Creator** account linked to a Facebook Page, with a Graph API token that has `instagram_content_publish`.
2. Instagram downloads the video from a public URL, so expose this server (for example `cloudflared tunnel --url http://localhost:5174`) and set `PUBLIC_BASE_URL`.
3. Set `IG_USER_ID`, `IG_ACCESS_TOKEN` and (optionally) `IG_GRAPH_VERSION`, which defaults to `v24.0`. Export with faststart (H.264/AAC): the app warns when the file isn't.

Videos are served only through a per-job `/media/<token>` link while the job is pending, until 24 hours after its run time. Files are deleted 7 days after their jobs finish. The Graph API can't schedule posts, so the app's job queue publishes the Reel at the daily slot. The server must be running at that time.

### TikTok (disabled by default)
TikTok is blocked in India, and apps TikTok hasn't audited can only post privately (`SELF_ONLY`), so publishing is off. An operator in a country where TikTok is allowed can set `TIKTOK_ENABLED=1` and `TIKTOK_ACCESS_TOKEN`. The app then follows TikTok's posting flow: it checks the creator's allowed privacy settings first and refuses anything more public than `TIKTOK_PRIVACY`. It uploads files up to 64 MB in one chunk and larger files in 10 MB chunks, polls until the post finishes, and labels the video as AI-generated (`is_aigc`).

## Corporate proxy

- **npm:** this project's `.npmrc` sets `proxy`/`https-proxy` to `http://127.0.0.1:9000`. Change or delete it to match your network.
- **Server (AI/upload calls):** set `HTTPS_PROXY=http://127.0.0.1:9000` (and optionally `NO_PROXY=localhost,127.0.0.1`) in `.env`. The server applies it to all outbound calls on startup.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | API server and Vite client with hot reload |
| `npm run build` then `npm start` | Production build, served on http://localhost:5174 |
| `npm test` | Unit and API tests (Vitest, offline mock AI) |
| `npm run typecheck` | TypeScript check |

Data is stored locally in `data/stuntshorts.db` (SQLite via Node's built-in `node:sqlite`; requires Node 22.5+). Uploaded videos go in `data/media/`.

## Content safety and channel health

**What the prompts enforce:**
- Fictional adult riders (21+) on closed film sets with safety barriers.
- Fire effects are stage-safe cold-spark fountains.
- Nobody stands in a vehicle's path.
- No public roads, injuries, sabotage or real brands.
- Titles and descriptions never invite viewers to copy the stunts. They ask viewers to rate or pick a side instead.

**Safety line:** every description includes *"🎬 AI-generated fiction (made with Google Flow). Fictional riders on closed sets. Never try these stunts."* Add the small on-screen "AI-generated fiction" badge from the edit notes too.

**Avoid repetitive content:** YouTube does not monetize mass-produced or templated content. Plan with a real AI writer, keep the weekly story arcs, and edit concepts so each episode feels unique.

**Planned:** an analytics feedback loop and caption upload.
