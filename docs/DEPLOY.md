# Deploy: Coolify + Cloudflare tunnel

Goal: the app running on your VPS under Coolify and reachable at `https://studio.puma-code.com` (use whatever `.puma-code.com` subdomain you prefer). No new paid service is needed: Coolify, the tunnel and the subdomain are what you already have. The only variable cost is the OpenAI API (see "Costs").

Before you start, test locally (`README.md`) and push the repository to GitHub.

## 1. Create the application in Coolify

1. **Project → New resource → Application** and pick the GitHub repository (use the same GitHub connection as your other apps, or a "Public/Private repository" source).
2. Branch: `main`. **Build pack: Dockerfile**. Base directory `/`. Dockerfile location `/Dockerfile`.
3. **Ports Exposes: `3000`**.
4. **Domains**: enter `http://studio.puma-code.com` (with `http://`, not `https://`: Cloudflare terminates TLS and talks plain HTTP to your server). Check how your other apps behind the tunnel are configured and do the same.
5. **Health check** (Advanced): path `/api/health`, port `3000`. The image already has one built in.
6. **Replicas: 1.** The app keeps a job queue and upload sessions in memory, so it must be a single instance.

## 2. Environment variables

In **Environment Variables** add these as *runtime* variables (not build-time):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PUBLIC_URL` | `https://studio.puma-code.com` |
| `ALLOWED_ORIGINS` | `https://studio.puma-code.com` |
| `JWT_SECRET` | output of `openssl rand -hex 32` |
| `APP_MODE` | `trial` |
| `APP_NAME` | `Pulse Studio` |
| `TRUST_PROXY` | `2` (Traefik + Cloudflare tunnel) |
| `SUPERADMIN_EMAIL` | your email |
| `SUPERADMIN_PASSWORD` | a long password. **Delete this variable after the first successful start** |
| `OPENAI_API_KEY` | your key |
| `OPENAI_MODEL` | the model you chose (`npm run ai:models` lists them) |
| `OPENAI_PRICE_IN_PER_M`, `OPENAI_PRICE_OUT_PER_M` | prices of that model, used for the spend estimate |
| `AI_MONTHLY_BUDGET_USD` | for example `5` |
| `DEFAULT_AI_MONTHLY_QUOTA`, `DEFAULT_MASTER_DAILY_QUOTA` | defaults for new users |

The rest of `.env.example` has sensible defaults. If you do not use the same name for the domain, change `PUBLIC_URL` and `ALLOWED_ORIGINS` accordingly.

## 3. Persistent storage

**Storages → Add → Volume**: name `studio-data`, **destination path `/app/data`**. It holds the SQLite database and generated files. Without it, every redeploy erases users and songs.

## 4. Cloudflare tunnel route

In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels →** your tunnel **→ Public Hostname → Add**:

| Field | Value |
|---|---|
| Subdomain / Domain | `studio` / `puma-code.com` |
| Service type | `HTTP` |
| URL | the same target your other Coolify apps use, normally `localhost:80` (Coolify's Traefik proxy, which routes by hostname) |

Cloudflare creates the DNS record (a proxied CNAME to the tunnel) automatically. If your tunnel points straight at containers instead of Traefik, set the URL to `localhost:3000` and publish the port as in `docker-compose.yml`; then `TRUST_PROXY=1`.

Cloudflare limits request bodies to 100 MB. The app already uploads every audio file in its own request (up to 95 MB each), so exports work through the tunnel.

## 5. Deploy and check

Press **Deploy**. The first build installs ffmpeg and compiles the SQLite module, so allow a few minutes. Then:

1. `https://studio.puma-code.com/api/health` returns `{"ok":true,...}`.
2. Open the site, press **Play demo** on the landing page.
3. Sign in with your super admin. Remove `SUPERADMIN_PASSWORD` from Coolify and redeploy (or restart).
4. In **Admin** create an access for a test user, sign in with it in a private window, change the password.
5. Generate a song with the AI assistant, then **Export → Master + stems**. Download the ZIP.
6. In the OpenAI dashboard set a monthly usage limit equal to or lower than `AI_MONTHLY_BUDGET_USD`.

## Costs

- Coolify, tunnel, subdomain, TLS: no extra cost on your existing infrastructure.
- The server does the mastering with ffmpeg (CPU, a few seconds per song). The browser does the rendering, so the VPS does not synthesize audio.
- OpenAI is the only variable cost. Three limits protect it: the OpenAI dashboard limit, `AI_MONTHLY_BUDGET_USD` (stops AI for everyone) and the per-user quota. `Admin` shows the estimated spend.
- Disk: generated files expire after `JOB_TTL_HOURS` (24 h by default). The image is about 150 MB bigger because of ffmpeg.

## Backups

Everything important is `/app/data/studio.db`. Make a consistent copy from the VPS with
`docker exec <container> node -e "const D=require('better-sqlite3');new D('/app/data/studio.db').backup('/app/data/backup.db').then(()=>console.log('ok'))"`
and copy `backup.db` off the server on whatever schedule you already use for other data. Note that the backup file stays in the same volume until you move it.

## If something goes wrong

| Symptom | Cause and fix |
|---|---|
| Container restarts at boot with "JWT_SECRET is required" | Variable missing or shorter than 32 characters |
| "Too many login attempts" for everyone | `TRUST_PROXY` is lower than the number of proxies, so all users share the proxy's IP. Use `2` |
| Can sign in, but the next page logs you out | `PUBLIC_URL` is not `https://...` or the site is opened over plain HTTP; the session cookie is `Secure` in production |
| 413 when exporting | A file exceeded `MAX_UPLOAD_MB`. Very long songs: shorten or lower the number of stems |
| AI says it is not configured | `OPENAI_API_KEY` is empty (it must be a runtime variable) |
| Users and songs vanish after redeploy | The volume at `/app/data` is missing |
| Forgot the admin password | In Coolify's terminal for the app: `node scripts/admin-password.js you@example.com` |
