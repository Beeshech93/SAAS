import 'dotenv/config';
import { z } from 'zod';

// `FOO=` in a .env file yields '' — treat that as unset.
const optional = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), inner.optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  APP_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // WhatsApp (Meta Cloud API). Optional until WhatsApp is enabled; the webhook returns 503 without them.
  WHATSAPP_VERIFY_TOKEN: optional(z.string().min(8)),
  WHATSAPP_APP_SECRET: optional(z.string().min(8)),
  WHATSAPP_GRAPH_URL: z.string().url().default('https://graph.facebook.com'),
  WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v21.0'),
  // 32 random bytes, base64 (openssl rand -base64 32). Encrypts per-business WhatsApp tokens.
  ENCRYPTION_KEY: optional(
    z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes, base64-encoded'),
  ),
  // AI (Anthropic Messages API). Without AI_API_KEY the assistant is simply off.
  AI_API_KEY: optional(z.string().min(10)),
  AI_MODEL: z.string().default('claude-sonnet-5-5'),
  AI_MAX_TOKENS: z.coerce.number().int().min(50).max(2000).default(500),
  // Dev/staging only: lets an owner switch plan without payment. Keep false in production until a payment provider is wired.
  BILLING_SELF_SERVICE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Number of reverse proxies in front of the API (the Next.js server counts as one). 0 = none.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  RATE_LIMIT_API_PER_MIN: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(20),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Print only the field names/messages, never values.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging';
