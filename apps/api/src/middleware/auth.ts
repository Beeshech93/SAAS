import { RequestHandler } from 'express';
import { MemberRole } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';

export interface AuthContext {
  userId: string;
  businessId: string;
  role: MemberRole;
  isSuperAdmin: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

/**
 * Verifies the access token, then re-checks the membership in the database so
 * that removed users / changed roles take effect immediately. The tenant
 * (businessId) comes ONLY from here, never from the request body or URL.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();

    let payload;
    try {
      payload = verifyAccessToken(header.slice(7));
    } catch {
      throw unauthorized('Invalid or expired token');
    }

    const member = await prisma.businessMember.findUnique({
      where: { userId_businessId: { userId: payload.sub, businessId: payload.bid } },
      include: { user: true },
    });
    if (!member) throw unauthorized('Membership no longer valid');

    const isSuperAdmin = Boolean(
      member.user.isSuperAdmin || env.SUPERADMIN_EMAILS.includes(member.user.email.toLowerCase()),
    );

    req.auth = { userId: member.userId, businessId: member.businessId, role: member.role, isSuperAdmin };
    next();
  } catch (err) {
    next(err);
  }
};

export const requireRole =
  (...roles: MemberRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.isSuperAdmin) return next(forbidden('Accès Super Admin requis'));
  next();
};
