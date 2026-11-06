# studio-music-pro

Live-coding music studio for the browser. Write a few lines of code, press play and hear it; edit while it plays; generate songs with AI; master and export the whole project.

Status: **v0.1, complete product**: API in `server/`, web app in `web/public/` (plain HTML, CSS and ES modules, no build step).

## What it does

- Browser studio: the song is code, typed into an editor with live highlighting. The demo types itself. Edits go live on the next bar and errors never stop the music.
- Mixer with mute/solo per instrument, oscilloscope, public share pages with social previews.
- Admin page for the super admin: create accesses (temporary password shown once), quotas, disable, reset password, AI spend.

- Login with accounts created by the super admin (no public sign-up while in trial mode).
- Per-user monthly AI quota and daily master quota, plus a global monthly AI budget that stops generation.
- Projects (songs as code), with public share links.
- AI generation through the OpenAI API. The key stays on the server. Every answer is validated by the language parser and repaired once automatically if invalid.
- Mastering with ffmpeg (two-pass loudness normalization, true-peak safe) delivered as a ZIP: master WAV + MP3, mix, stems, source code and a loudness report.

## Requirements

- Node 20 or newer (22 recommended)
- ffmpeg and ffprobe in the PATH (only needed for mastering)

## Run locally

```bash
npm install
npm run setup        # creates .env with a random secret and prints the admin login (once)
```

Open `.env` and set `OPENAI_API_KEY=...` (the studio works without it, only the AI assistant needs it). To see which models your key can use: `npm run ai:models`, then set `OPENAI_MODEL` and the matching `OPENAI_PRICE_*`.

```bash
npm run dev          # http://localhost:3000
```

Sign in with the admin email and password that `npm run setup` printed. Use the **Admin** button to create more accesses.

For the **Master** export, `ffmpeg` and `ffprobe` must be installed (`brew install ffmpeg` on macOS). Everything else works without them. Audio plays after your first click, because browsers block sound until then.

Tip: `npm run setup -- --email you@example.com --password "a long password"` chooses the admin login yourself.

## Deploy on the VPS (Docker)

```bash
cp .env.example .env     # fill it in
docker compose up -d --build
```

The container listens on `127.0.0.1:3000`. Point the tunnel route for `studio.puma-code.com` to `http://localhost:3000`. For Coolify plus a Cloudflare tunnel see `docs/DEPLOY.md`. Data (SQLite + temporary files) lives in `./data`, back it up with a plain copy while the app is stopped, or use `sqlite3 data/studio.db ".backup out.db"`.

After the first start, remove `SUPERADMIN_PASSWORD` from `.env`. If you forget a password: `docker compose exec studio node scripts/admin-password.js you@example.com`.

## Product name

The name is one constant in `web/public/js/config.js` (`APP_NAME`) plus the `APP_NAME` environment variable for the server, and `<title>`/manifest in `web/public/`.

## Costs

AI voices are spoken (not sung) by OpenAI's text-to-speech and are created only when a user presses Generate; clips are cached in `data/voices` (back it up or let it regenerate), each user has a monthly voice quota and the cost counts toward `AI_MONTHLY_BUDGET_USD`. Microphone takes are recorded in the browser and stored only in that browser (nothing is uploaded).

Everything runs on your VPS. The only variable cost is OpenAI. To choose the model, run `npm run ai:models` (lists what your key can use), set `OPENAI_MODEL`, and update `OPENAI_PRICE_*` to that model's prices. A stronger model writes better songs but costs more per generation, so watch `/api/admin/usage`. Three layers limit it: the credit limit in the OpenAI dashboard, `AI_MONTHLY_BUDGET_USD` (stops the whole app), and the per-user quota. Spend is an estimate based on `OPENAI_PRICE_*`, so keep those prices up to date.

## Tests

```bash
npm test
```

53 tests cover the parser, the scheduling rules, authentication, quotas, sharing, static files and security headers, the AI flow with a fake OpenAI server, and real mastering with ffmpeg (needs ffmpeg installed).

## Docs

- `docs/API.md`: endpoints
- `docs/IMAGE_PROMPTS.md`: prompts for the front end images
- `docs/DEPLOY.md`: Coolify + Cloudflare tunnel step by step
- `shared/lang/`: the Pulse language (spec, parser, scheduling plan, AI guide, demo song). The server and the browser import the same files.
- `web/public/js/engine.js`: the audio engine (Tone.js): live playback and offline rendering share one code path, so the export sounds like what you heard.

## Security notes

- Passwords hashed with bcrypt; sessions are httpOnly, SameSite=Lax cookies (secure in production); password change signs out other sessions.
- Login is rate limited; unknown emails and wrong passwords return the same error.
- Uploads accept only real WAV files (signature checked), have size and duration limits and are deleted after processing.
- Mastering uses ffmpeg with an argument list (no shell) and a timeout.
- Dependency note: `npm audit` reports moderate advisories inside `archiver`'s file-globbing dependencies. This app never uses globbing (it adds files one by one), so they are not reachable.
