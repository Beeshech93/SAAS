# Deployment

## Topology
```
Internet ──HTTPS──> reverse proxy (Caddy/nginx/cloud LB)
                     ├─ /api/webhooks/whatsapp ─> backend:4000   (recommended: direct, skips Next)
                     └─ everything else ────────> frontend:3000 ──/api/*──> backend:4000
backend ─> PostgreSQL
```
The web app proxies `/api/*` to `API_URL`, so the browser is always same-origin (needed for the `SameSite=Strict` cookie). The signed webhook was verified to work through the Next proxy, but routing it straight to the backend is simpler and faster. **Do not publish the backend port** to the internet when `TRUST_PROXY=1`.

## Environments
Use separate `.env` files / secret stores for `development`, `staging`, `production` (`NODE_ENV`). Staging may set `BILLING_SELF_SERVICE=true`; **production must not** until a payment provider is wired.

## Required secrets (never commit)
`DATABASE_URL`, `JWT_SECRET` (≥ 32 random chars), `ENCRYPTION_KEY` (`openssl rand -base64 32`; losing it makes stored WhatsApp tokens unreadable — back it up), `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `AI_API_KEY`. Set `APP_URL` to the public https URL and `TRUST_PROXY=1` (Next counts as one proxy; add one more if a proxy sits in front of Next).

## Steps
1. Provision PostgreSQL 16 (managed is best) with automated backups.
2. `docker compose up -d --build` (or build the two images yourself). The backend container runs `prisma migrate deploy` on start.
3. Put TLS in front. Check `GET /health`.
4. Meta developer console → WhatsApp → Configuration: callback `https://<domain>/api/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to `messages`. Then the owner enters the Phone number ID and permanent token in Dashboard → WhatsApp.
5. Smoke test: register, add a FAQ, connect WhatsApp, send a message from a phone, see it in the inbox and the AI answer.

## Operations
- **Migrations**: always `prisma migrate deploy` in CI/CD, never `migrate dev` in production. Take a backup first.
- **Scaling out**: before running more than one backend instance, move rate limits and the AI reply cap to Redis (a commented `redis` service is in `docker-compose.yml`) and process webhooks through a queue.
- **Monitoring**: ship JSON logs (pino) to your log platform; alert on `whatsapp_invalid_signature`, `refresh_token_reuse`, `ai_provider_failed`, `whatsapp_send_failed` spikes.
- **WhatsApp rules**: free-form replies only within 24 h of the customer's last message; outside it use approved templates (provider supports `sendTemplateMessage`; no UI yet).
- **Prices/limits**: placeholders in `apps/api/src/modules/billing/plans.ts`; edit before the first run or in the `Plan` table afterwards.

## Vercel (multi-service project)
`vercel.json` at the repo root defines two services in one Vercel project and one domain:

| Service | Root | Public path | Notes |
|---|---|---|---|
| `api` | `apps/api` (Express) | `/api/*` and `/webhooks/*` | receives the original path (`/api/auth/login`, `/api/webhooks/whatsapp`, `/webhooks/whatsapp`…) |
| `web` | `apps/web` (Next.js) | everything else | calls the API from the browser with relative `/api/...` URLs |

No service-to-service bindings are needed: the web app never calls the API server-side, and the API never calls the web app. (If you add server-side calls later, declare a `bindings` entry on the caller and read `process.env.<ENV>` instead of a hard-coded URL.)

Differences from the Docker setup, handled in code: the Express app is exported (`export default app`) and only calls `listen()` outside Vercel; `next.config.mjs` skips its `/api` proxy and `standalone` output on Vercel; `TRUST_PROXY` defaults to 1 there.

**Before the first deploy**
1. **Database**: Vercel has no local PostgreSQL. Use a managed one (e.g. Neon or Supabase from the Vercel Marketplace) and set `DATABASE_URL` to the **pooled** connection string (serverless opens many short connections; for pgbouncer-style poolers add `?pgbouncer=true&connection_limit=1`).
2. **Migrations are not run by the deploy.** Run `npm run prisma:deploy -w apps/api` from CI or your machine against the production database (take a backup first). Do not point preview deployments at the production database.
3. **Environment variables** (Project → Settings → Environment Variables, separate values for Preview/Production): `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `AI_API_KEY`, and `APP_URL` = your public https domain. Leave `BILLING_SELF_SERVICE` unset/false in production.
4. **Meta webhook** URL: `https://<your-domain>/api/webhooks/whatsapp`.
5. Smoke test `GET https://<your-domain>/api/health`.

Local multi-service run: `vercel dev`.

Serverless caveats: rate limits and the AI per-conversation cap are in memory per function instance (use Redis/Upstash before relying on them); the webhook answers synchronously, so the function's maximum duration must cover one AI call (Fluid compute defaults are generous); the Prisma `rhel-openssl-3.0.x` engine is generated at build (`buildCommand`).
