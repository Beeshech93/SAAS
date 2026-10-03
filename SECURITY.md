# Security

## Implemented
- **Passwords**: bcrypt (12 rounds), min 10 chars, login timing equalised for unknown emails, same error for wrong email/password.
- **Sessions**: 15-min JWT access token (kept in memory, never in storage); rotating refresh token in an `httpOnly`, `Secure` (prod), `SameSite=Strict` cookie scoped to `/api/auth`, stored hashed; reuse detection revokes all sessions.
- **Authorization**: role checks per route; the auth middleware re-reads the membership on every request, so removals and role changes apply immediately.
- **Tenant isolation**: tenant id comes only from the authenticated context; every query is scoped by `businessId`; updates/deletes match `{id, businessId}`; unknown fields rejected; covered by isolation tests on every module, plus a real-PostgreSQL test.
- **Input**: zod validation everywhere, strict schemas, http(s)-only URLs, UUID guards on ids, 1 MB body limit.
- **WhatsApp**: official Cloud API only; webhook verified with HMAC-SHA256 over the raw body (constant-time compare); verify-token handshake; idempotent on message id; per-business tokens encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`) and never returned by the API; a number cannot be claimed by two businesses.
- **AI**: only that business's data in the prompt, delimited and escaped; customer text never in the system prompt; deterministic handoff and injection checks before the model; canary leak detection; fixed fallbacks; per-conversation reply cap; plan/quota gate before any model call.
- **Abuse**: rate limits (auth strict, API global, AI preview), `trust proxy` configurable.
- **Headers**: helmet on the API; CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy on the web app (production).
- **Secrets**: only from environment variables; `.env` git-ignored; startup validation without printing values.
- **Logs**: structured (pino), passwords/tokens/cookies redacted, separate `security` channel (login failures, refresh reuse, bad webhook signatures, injection attempts).
- **Dependencies**: `npm audit --omit=dev` is clean (Next.js upgraded to 16.x); CI fails on high severity.

## Known gaps / before going live
1. **No password reset or e-mail verification** (needs an e-mail provider). Invitations are shared as links.
2. **No MFA** and no per-account lockout (only per-IP limits).
3. **No CSRF token**: mitigated by Bearer tokens + `SameSite=Strict` refresh cookie; revisit if cookies are ever used for other state-changing calls.
4. **Message content is stored unencrypted** in PostgreSQL (disk/DB encryption is a deployment concern).
5. **In-memory limiters** (AI reply cap, rate limits) are per process; use Redis when running several instances.
6. Webhook processing is synchronous inside the request; add a queue before high volume.
7. No audit-log table: critical actions are only in logs.
8. Run a penetration test and a data-protection review (customer phone numbers and chats are personal data) before launch.

Report vulnerabilities privately to the project owner.
