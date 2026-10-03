# Database (PostgreSQL + Prisma)

Schema: `apps/api/prisma/schema.prisma`. Migrations: `apps/api/prisma/migrations` (apply with `npm run prisma:deploy -w apps/api`; develop with `npm run db:migrate`). IDs are UUIDs. All tenant tables carry `businessId` and an index starting with it.

| Model | Purpose | Notes |
|---|---|---|
| User | login identity | unique lowercase email, bcrypt hash |
| Business | tenant | type HOTEL/RESTAURANT/OTHER, timezone, language, `aiEnabled`, `aiRules`, `onboardedAt` |
| BusinessMember | user ↔ business, role OWNER/ADMIN/AGENT | unique (userId, businessId) |
| RefreshToken | rotating sessions | only the SHA-256 hash is stored |
| Invitation | team invites | token hash only, 7-day expiry |
| Customer | end customer | phone normalized, unique per business |
| Conversation | one per customer/channel while OPEN/PENDING | `aiActive` (AI ACTIVE/PAUSED), `assignedToId`, `lastMessagePreview` |
| Message | conversation messages | `businessId` denormalized for tenant scoping, `externalId` (wamid) unique per business for webhook idempotency, `metadata` JSON |
| Faq, Service | knowledge for the AI | Service covers rooms, menu items, other services |
| WhatsAppIntegration | per-business number + token | token AES-256-GCM encrypted; `phoneNumberId` globally unique |
| Plan, Subscription, Usage | billing | Usage = outbound AI+agent messages per business per UTC month |

Specified in the original brief but **not built**: `Employee`, `ConversationAssignment` (assignment is a column on Conversation), `Notification`, `AuditLog` (security/business events go to structured logs instead).

Cascades: deleting a Business removes all its data. Deleting a User removes memberships and sessions; their conversations become unassigned.

Backups, retention and PII: customer phone numbers and message text are personal data. Define a retention policy and encrypted backups before launch.
