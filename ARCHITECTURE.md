# Architecture

```
apps/
  api/   Express + TypeScript + Prisma (modular: src/modules/<feature>)
  web/   Next.js 14 (App Router) + Tailwind, French messages in src/i18n
```

## Decisions
- **Monorepo** with npm workspaces; simplest option for an MVP.
- **Tenancy**: tenant id (`businessId`) comes only from the authenticated context (`req.auth`), never from body/URL. Update schemas are `.strict()` so injected ids are rejected. The auth middleware re-checks the `BusinessMember` row on every request, so role changes/removals apply immediately.
- **Auth**: bcrypt (12 rounds), 15-min JWT access token (kept in memory in the browser), 30-day rotating refresh token in an `httpOnly`, `SameSite=Strict` cookie scoped to `/api/auth`, stored hashed (SHA-256). Reuse of a rotated token revokes all of the user's tokens. Next.js proxies `/api/*` so the browser stays same-origin (CSRF mitigation).
- **RefreshToken** model was added beyond the listed models; it is required for rotation/revocation.
- **MVP simplification**: a user acts within their oldest membership. Business switching comes later.
- **Roles**: OWNER / ADMIN / AGENT per business (`BusinessMember.role`). Only OWNER may PATCH the business for now.
- **Hardening**: helmet, CORS pinned to `APP_URL`, zod validation, rate limit on `/api/auth`, pino logs with redaction, security log channel, uniform error format.
- **Tests** run against an in-memory Prisma fake (no DB needed). Add a real-Postgres integration run in CI later.

## Module map (`apps/api/src`)
- `modules/auth` · `business` · `faq` · `services` · `customers` · `conversations` · `messages` · `team` · `analytics` · `billing` · `whatsapp` (settings) · `ai` · `automation` (responder hook)
- `integrations/whatsapp` (provider interface + Cloud API, webhook, outbound) · `integrations/ai` (provider interface + Anthropic) · `integrations/payments` (interface, no-op)
- `middleware` (auth, validation, errors) · `lib` (prisma, crypto, tokens, logger, phone…)

## Message flow
```
WhatsApp → Meta → POST /api/webhooks/whatsapp (HMAC verified)
  → business by phone_number_id → customer (phone) → conversation → store INBOUND (dedupe by wamid)
  → conversation.aiActive ? AI responder : (human answers from the inbox)
        AI: plan/quota gate → handoff & injection checks → prompt from FAQ/services/info → model
            → answer | NO_INFO | HANDOFF  (the last two pause the AI, set PENDING, add a note)
  → send via WhatsAppProvider → store OUTBOUND with delivery status → usage +1
Dashboard (Next.js) ⇄ REST API ⇄ PostgreSQL
```

## Tradeoffs
- In-memory limiters and synchronous webhook handling: fine for one instance; see DEPLOYMENT.md for scaling.
- Tests use an in-memory Prisma fake for speed plus a real-PostgreSQL integration suite for the queries the fake cannot prove.
- Plan changes need a payment provider; until then they are disabled outside dev/staging.
