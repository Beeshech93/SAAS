import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);

// bcrypt only uses the first 72 bytes, so cap at 72.
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a digit');

export const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email,
    password,
    businessName: z.string().trim().min(1).max(120),
    businessType: z.enum(['HOTEL', 'RESTAURANT', 'OTHER']).default('OTHER'),
  })
  .strict();

export const loginSchema = z.object({ email, password: z.string().min(1).max(72) }).strict();

export const inviteInfoSchema = z.object({ token: z.string().min(20).max(200) }).strict();
export const acceptInviteSchema = z
  .object({ token: z.string().min(20).max(200), name: z.string().trim().min(1).max(100), password })
  .strict();
