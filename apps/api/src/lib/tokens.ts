import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { MemberRole } from '@prisma/client';
import { env } from '../config/env';

export interface AccessPayload {
  sub: string; // userId
  bid: string; // businessId
  role: MemberRole;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded.sub || !decoded['bid']) {
    throw new Error('Malformed token');
  }
  return decoded as unknown as AccessPayload;
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
