# API reference

Base URL: `/api` (the web app proxies `/api/*` to the backend). JSON in, JSON out.

```jsonc
// success
{ "success": true, "data": … }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "details": … } }
```

Error codes: `VALIDATION_ERROR` 400 · `UNAUTHORIZED` 401 · `PLAN_LIMIT` 402 (`details.reason`: `MESSAGE_LIMIT_REACHED`, `SUBSCRIPTION_INACTIVE`, `USER_LIMIT_REACHED`, `FEATURE_NOT_IN_PLAN`) · `FORBIDDEN` 403 · `NOT_FOUND` 404 · `CONFLICT` 409 · `RATE_LIMITED` 429 · `NOT_IMPLEMENTED` 501 · `INTERNAL_ERROR` 500.

**Authentication**: `Authorization: Bearer <accessToken>` (15 min). The refresh token is an `httpOnly` `SameSite=Strict` cookie scoped to `/api/auth`.
**Tenancy**: the business is always taken from the authenticated membership, never from the request. Unknown body fields are rejected (`strict` schemas).
**Roles**: O = OWNER, A = ADMIN, G = AGENT (agents only see conversations assigned to them).

## Auth — `/api/auth`
| Method & path | Who | Notes |
|---|---|---|
| POST `/register` | public | `{name,email,password,businessName,businessType}` → creates user + business + OWNER + 14-day trial. Password ≥ 10 chars, letter + digit |
| POST `/login` | public | `{email,password}` |
| POST `/refresh` | cookie | rotates the refresh token; reuse of an old one revokes all sessions |
| POST `/logout` | cookie | revokes the refresh token |
| GET `/me` | any | user, business, role |
| POST `/invite-info` | public | `{token}` → `{email,role,businessName}` |
| POST `/accept-invite` | public | `{token,name,password}` → creates the account and signs in |

Auth routes are limited to `RATE_LIMIT_AUTH_MAX` requests / 15 min / IP.

## Business — `/api/business`
| | Who | |
|---|---|---|
| GET `/` | any | own business |
| PATCH `/` | O | name, type, description, address, phone, email, website (http/https), timezone, language, logo (http/https), aiEnabled, aiRules |
| POST `/onboarding/complete` | O | marks the wizard as done (idempotent) |

## Content — O/A write, everyone reads
- `/api/faqs` — GET, POST `{question,answer,active}`, PATCH `/:id`, DELETE `/:id`
- `/api/services` — GET (`?type=ROOM|MENU_ITEM|SERVICE`), POST, PATCH `/:id`, DELETE `/:id`. Fields: type, name, category, description, price (≥0, 2 decimals, returned as string), currency (HTG|USD), capacity, amenities[], available
- `/api/customers` — GET (`?search=` name/phone), POST `{phone,name,email,country,notes}`, GET `/:id`, PATCH `/:id`. Phones are normalized to `+<digits>` and unique per business

## Inbox
- `/api/conversations` — GET (`?status=`), POST `{customerId}` (O/A), GET `/:id`, PATCH `/:id` `{status?,assignedToId?,aiActive?}`.
  Assigning pauses the AI; unassigning resumes it; an explicit `aiActive` wins. Agents can change `status`/`aiActive` on their conversations but not the assignment.
- `/api/messages` — GET `?conversationId=`, POST `{conversationId,content}`. Sends through WhatsApp and stores the result in `metadata.delivery` (`sent` | `failed` | `not_configured`). A human reply takes over an unassigned conversation and pauses the AI.

## WhatsApp
- `GET|POST /api/webhooks/whatsapp` (alias `/webhooks/whatsapp`) — Meta handshake (`hub.*`) and signed deliveries (`X-Hub-Signature-256`). Unsigned → 401. Always 200 for valid deliveries.
- `/api/whatsapp` — GET (O/A, never returns the token), PUT (O) `{phoneNumberId,accessToken,displayPhoneNumber?,status?}`, DELETE (O). A number can belong to one business only (409 otherwise).

## AI — O/A
- `GET /api/ai/status`, `POST /api/ai/preview` `{message,history[]}` → `{action: answer|no_info|handoff|blocked|disabled|error, reply}`. Dry run: nothing stored or sent. 20 req/min.

## Team — `/api/team`
GET (O/A) · GET `/invitations` (O/A) · POST `/invitations` `{email,role: ADMIN|AGENT}` (O) → `{invitation, link}` (link shown once, valid 7 days) · DELETE `/invitations/:id` (O) · PATCH `/:userId` `{role}` (O) · DELETE `/:userId` (O). The owner cannot be modified; nobody can modify themselves.

## Analytics — O/A
`GET /api/analytics` → conversations by status, customers, messages (received, sent, by AI, by agent), first-response time (30 days, AI vs team), messages per day for 7 days (business time zone).

## Billing
- `GET /api/plans` (public) — catalog.
- `GET /api/subscription` (O) — plan, status, trial, limits, usage.
- `POST /api/subscription/change-plan` (O) `{plan}` — **501 unless `BILLING_SELF_SERVICE=true`** (no payment provider yet).

## Health
`GET /health`. All `/api` routes share a global limit of `RATE_LIMIT_API_PER_MIN` per IP (webhooks excluded).
