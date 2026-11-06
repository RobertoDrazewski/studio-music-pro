# API reference

Base path `/api`. JSON in and out. Session is an httpOnly cookie (`sid`) set at login, so the front end must send requests with `credentials: 'include'` (same origin needs nothing special).

Errors always have the shape `{ "error": "message", "code"?: "MACHINE_CODE" }`.

| Status | Meaning |
|---|---|
| 400 | Invalid input |
| 401 | Not logged in |
| 403 | Not allowed, or `code: PASSWORD_CHANGE_REQUIRED` |
| 404 | Not found (also used when a resource belongs to someone else) |
| 413 | File too large |
| 429 | Quota or rate limit (`AI_QUOTA_EXCEEDED`, `MASTER_QUOTA_EXCEEDED`) |
| 502/503/504 | AI provider problem, or `AI_BUDGET_EXCEEDED`, `AI_INVALID_OUTPUT` |

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | 10 failed attempts / 15 min / IP |
| POST | `/auth/logout` | | |
| GET | `/auth/me` | | `{ user, mode, quota: { ai, master, voice } }` |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` | min 10 chars. Required after a temporary password |

## Super admin (role `superadmin` only)
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/admin/users` | | users with usage |
| POST | `/admin/users` | `{ email, name, aiMonthlyQuota?, masterDailyQuota?, plan? }` | returns `temporaryPassword` ONCE |
| PATCH | `/admin/users/:id` | any of `name, active, aiMonthlyQuota, masterDailyQuota, plan` | `active:false` signs the user out |
| POST | `/admin/users/:id/reset-password` | | returns a new `temporaryPassword` |
| GET | `/admin/usage` | | month spend vs budget, per-user usage, job counts |

## Projects (own projects only)
| Method | Path | Body |
|---|---|---|
| GET | `/projects` | list without code |
| POST | `/projects` | `{ title, code }` |
| GET | `/projects/:id` | |
| PUT | `/projects/:id` | `{ title?, code? }` → also returns `validation: { ok, errors, warnings }` |
| DELETE | `/projects/:id` | |
| POST | `/projects/:id/share` | `{ enabled: boolean }` → `shareSlug` |

## Public sharing (no login)
`GET /share/:slug` → `{ song: { title, code, author, updatedAt } }`. The browser plays it with the same engine.

## AI
| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/ai/guide` | | language reference text |
| GET | `/ai/quota` | | |
| POST | `/ai/voice` | `{ text, voice: female\|male, style?, onlyCached? }` | Returns `audio/mpeg`. Cached by content (header `X-Voice-Cached`); a cached clip is free. `onlyCached` never spends (404 `VOICE_NOT_CACHED`). 429 `VOICE_QUOTA_EXCEEDED`, 503 `AI_BUDGET_EXCEEDED` |
| POST | `/ai/generate` | `{ prompt, code?, style? }` | `code` present = edit that song. Returns `{ code, warnings, quota }`. The code is always valid for the Pulse parser |

## Master and export
The browser renders the song offline and uploads WAV files. Cloudflare rejects request bodies over 100 MB, so the web app sends **each file in its own request** (upload session). A single multipart request also works for scripts and small files.

### Upload session (what the web app uses)

| Method | Path | Notes |
|---|---|---|
| POST | `/master/uploads` | `201 { uploadId, maxFileMb, maxStems }`. At most 3 open sessions per user; sessions expire after 1 hour |
| PUT | `/master/uploads/:id/mix` | raw body, `Content-Type: audio/wav` |
| PUT | `/master/uploads/:id/stems/:name` | raw WAV body; the name is sanitized and ends up inside the ZIP |
| POST | `/master` | JSON `{ uploadId, kind?, title?, preset?, targetLufs?, code? }` starts the job and consumes the session |

### Single multipart request

`POST /master` as `multipart/form-data`:

| Field | Required | Notes |
|---|---|---|
| `mix` | yes | WAV file (full mix) |
| `stems` | no | up to 16 WAV files, repeat the field |
| `kind` | no | `master` (default) or `mp3` (plain MP3, no mastering) |
| `title` | no | used for file names |
| `preset` | no | `clean` (default), `punch`, `warm`, `loud` |
| `targetLufs` | no | -23 to -6. Default depends on preset |
| `code` | no | song source, saved inside the ZIP |

Returns `202 { job }`. Then:

| Method | Path | Notes |
|---|---|---|
| GET | `/master/jobs/:id` | poll every 1–2 s: `status` is `queued`, `running`, `done` or `failed` |
| GET | `/master/jobs/:id/download` | the ZIP (`master`) or MP3 (`mp3`). Files expire after `JOB_TTL_HOURS` |
| GET | `/master/jobs` | last 30 jobs |
| GET | `/master/presets` | |

ZIP contents: `master/*.wav` (24-bit, 44.1 kHz), `master/*.mp3` (320 kbps), `mix/*.wav`, `stems/*.wav`, `project/*.pulse`, `README.txt` with the loudness report.
