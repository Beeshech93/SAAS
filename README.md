# WhatsApp Business Assistant

Multi-tenant SaaS to automate customer service over WhatsApp (hotels, restaurants, small businesses; Haiti first).
Dashboard in French, i18n-ready. **Status: MVP feature-complete** — see *What's included* below.

## Requirements
Node.js 22+, npm 10+, PostgreSQL 16 (or Docker).

## Setup
```bash
cp .env.example .env        # fill POSTGRES_PASSWORD, DATABASE_URL, JWT_SECRET (openssl rand -hex 48)
npm install
```

## Database & migrations
```bash
docker compose up -d postgres          # or use your own PostgreSQL
npm run db:generate                    # generate Prisma client
npm run db:migrate                     # dev: applies migrations (initial one is in apps/api/prisma/migrations)
# production: npm run prisma:deploy -w apps/api
```

## Run locally
```bash
npm run dev:api    # http://localhost:4000  (GET /health)
npm run dev:web    # http://localhost:3000  (proxies /api/* to API_URL)
```
Everything in Docker: `docker compose up --build`.

## Tests
```bash
npm test                                   # fast suite, no database needed (in-memory Prisma fake)
# Real PostgreSQL (disposable DB, migrations applied):
DATABASE_URL=postgresql://wba:...@localhost:5432/wba npm run prisma:deploy -w apps/api
DATABASE_URL=... npm run test:integration -w apps/api
```

## What's included
Auth & sessions · multi-tenant businesses and roles (OWNER/ADMIN/AGENT) · business settings · FAQ · services (rooms/menu) · customers · inbox with AI/human handoff · WhatsApp Cloud API webhook and sending · AI assistant (Anthropic) · team invitations · analytics · plans, quotas and trial (no payments yet) · onboarding wizard · French landing page.

Docs: [API.md](API.md) · [DATABASE.md](DATABASE.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [SECURITY.md](SECURITY.md) · [DEPLOYMENT.md](DEPLOYMENT.md)

## WhatsApp (phase 4)
Uses the **official WhatsApp Business Cloud API (Meta)** only.
1. Set `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` and `ENCRYPTION_KEY` in `.env` (see `.env.example`).
2. In the Meta developer console, set the webhook callback URL to `https://<your-domain>/api/webhooks/whatsapp`, the verify token to your `WHATSAPP_VERIFY_TOKEN`, and subscribe to the `messages` field. The webhook must be reachable over public HTTPS (e.g. a tunnel in development).
3. In the dashboard → WhatsApp, the business owner enters the *Phone number ID* and a permanent access token (stored AES-256-GCM encrypted, never shown again).

Webhook: `GET|POST /api/webhooks/whatsapp` (alias `/webhooks/whatsapp`). Every POST must carry a valid `X-Hub-Signature-256`; unsigned/invalid requests get 401 and nothing is stored. Retries are ignored by message id. Free-form replies only work within WhatsApp's 24-hour customer-service window; failures are recorded on the message (`metadata.delivery = "failed"`) and shown in the inbox. Message templates (`sendTemplateMessage`) are implemented in the provider but not yet exposed in the UI.

## AI assistant (phase 5)
Set `AI_API_KEY` (Anthropic) in `.env`; without it automatic replies are simply off. The owner can switch the assistant on/off, add business rules and dry-run it from Dashboard → Paramètres.

How a customer message is handled (`apps/api/src/modules/ai`):
1. Only when the conversation's AI is **active**. A human taking over (assignment or reply) pauses it; "Rendre à l'IA" resumes it.
2. Deterministic checks run first and cannot be bypassed by the model: a request for a human ("parler à quelqu'un", "agent", "responsable"… in FR/EN/ES/HT) → handoff; prompt-injection patterns → polite scope reply, logged as a security event.
3. The prompt contains only that business's data (info, active FAQs, available services, owner rules) inside delimited data blocks, plus the last 12 messages. Customer text is never placed in the system prompt.
4. The model answers `NO_INFO` or `HANDOFF` instead of guessing → the customer gets the official French fallback, the AI is paused and the conversation becomes PENDING with an internal note.
5. A per-process canary detects system-prompt leaks; provider outages leave the conversation PENDING and send nothing.
