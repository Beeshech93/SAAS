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
