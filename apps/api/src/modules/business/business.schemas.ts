import { z } from 'zod';

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable();

// Only http(s) links: `javascript:` and similar schemes are valid URLs for zod but must never be stored.
const httpUrl = (max: number) =>
  z.string().trim().url().max(max).refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL');

// .strict(): unknown keys (e.g. id, businessId, status) are rejected, not silently accepted.
export const updateBusinessSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.enum(['HOTEL', 'RESTAURANT', 'OTHER']),
    description: optionalText(2000),
    address: optionalText(300),
    phone: optionalText(30),
    email: z.string().trim().toLowerCase().email().max(254).nullable(),
    website: httpUrl(300).nullable(),
    timezone: z.string().trim().min(1).max(60),
    language: z.enum(['fr', 'es', 'en', 'ht']),
    logo: httpUrl(500).nullable(),
    aiEnabled: z.boolean(),
    aiRules: optionalText(2000),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });
