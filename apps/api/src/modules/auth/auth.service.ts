import { Prisma, BusinessType } from '@prisma/client';
import { env } from '../../config/env';
import { AppError, conflict, forbidden, unauthorized } from '../../lib/errors';
import { securityLog } from '../../lib/logger';
import { hashPassword, verifyPassword } from '../../lib/password';
import { prisma } from '../../lib/prisma';
import { assertSeatAvailable, ensureSubscription } from '../billing/billing.service';
import { generateRefreshToken, hashToken, signAccessToken } from '../../lib/tokens';

export interface Session {
  accessToken: string;
  refreshToken: string;
}

const refreshExpiry = () => new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);

export async function createSession(userId: string, businessId: string, role: 'OWNER' | 'ADMIN' | 'AGENT'): Promise<Session> {
  const refreshToken = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiry() },
  });
  return { accessToken: signAccessToken({ sub: userId, bid: businessId, role }), refreshToken };
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  businessName: string;
  businessType: BusinessType;
}) {
  if (env.REGISTRATION_ALLOWED_EMAILS.length && !env.REGISTRATION_ALLOWED_EMAILS.includes(input.email.toLowerCase())) {
    throw forbidden('Registration is by invitation only');
  }
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw conflict('Email already registered');
  }
  const passwordHash = await hashPassword(input.password);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash } });
      const business = await tx.business.create({ data: { name: input.businessName, type: input.businessType } });
      const member = await tx.businessMember.create({
        data: { userId: user.id, businessId: business.id, role: 'OWNER' },
      });
      return { user, business, member };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('Email already registered');
    }
    throw err;
  }

  const { user, business, member } = created;
  await ensureSubscription(business.id); // starts the free trial
  const session = await createSession(user.id, business.id, member.role);
  securityLog.info({ event: 'register', userId: user.id, businessId: business.id }, 'User registered');
  return { session, user: publicUser(user), business, role: member.role };
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !ok) {
    securityLog.warn({ event: 'login_failed' }, 'Login failed');
    throw unauthorized('Invalid email or password');
  }
  // MVP: a user acts within their oldest membership.
  const member = await prisma.businessMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { business: true },
  });
  if (!member) throw new AppError(403, 'FORBIDDEN', 'No business associated with this account');
  if (member.business.status !== 'ACTIVE') throw new AppError(403, 'FORBIDDEN', 'Business is suspended');

  const session = await createSession(user.id, member.businessId, member.role);
  securityLog.info({ event: 'login', userId: user.id }, 'User logged in');
  return { session, user: publicUser(user), business: member.business, role: member.role };
}

/** Rotates the refresh token. Presenting an already-revoked token revokes the whole family. */
export async function refresh(rawToken: string | undefined) {
  if (!rawToken) throw unauthorized('Missing refresh token');
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!record) throw unauthorized('Invalid refresh token');

  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    securityLog.warn({ event: 'refresh_token_reuse', userId: record.userId }, 'Refresh token reuse detected');
    throw unauthorized('Invalid refresh token');
  }
  if (record.expiresAt < new Date()) throw unauthorized('Refresh token expired');

  const member = await prisma.businessMember.findFirst({
    where: { userId: record.userId },
    orderBy: { createdAt: 'asc' },
  });
  if (!member) throw unauthorized();

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return createSession(record.userId, member.businessId, member.role);
}

export async function logout(rawToken: string | undefined) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string, businessId: string) {
  const member = await prisma.businessMember.findUnique({
    where: { userId_businessId: { userId, businessId } },
    include: { business: true, user: true },
  });
  if (!member) throw unauthorized();
  return { user: publicUser(member.user), business: member.business, role: member.role };
}

function publicUser(u: { id: string; email: string; name: string }) {
  return { id: u.id, email: u.email, name: u.name };
}

const inviteByToken = async (rawToken: string) => {
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new AppError(404, 'NOT_FOUND', 'Invitation invalid or expired');
  return inv;
};

export async function inviteInfo(rawToken: string) {
  const inv = await inviteByToken(rawToken);
  const business = await prisma.business.findUnique({ where: { id: inv.businessId } });
  return { email: inv.email, role: inv.role, businessName: business?.name ?? '' };
}

export async function acceptInvite(rawToken: string, name: string, password: string) {
  const inv = await inviteByToken(rawToken);
  if (await prisma.user.findUnique({ where: { email: inv.email } })) throw conflict('Email already registered');
  await assertSeatAvailable(inv.businessId);
  const passwordHash = await hashPassword(password);

  const created = await prisma.$transaction(async (tx) => {
    // Claim the invitation first so a double submit cannot accept it twice.
    const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (!claimed.count) throw new AppError(404, 'NOT_FOUND', 'Invitation invalid or expired');
    const user = await tx.user.create({ data: { email: inv.email, name, passwordHash } });
    const member = await tx.businessMember.create({ data: { userId: user.id, businessId: inv.businessId, role: inv.role } });
    return { user, member };
  });

  const business = await prisma.business.findUnique({ where: { id: inv.businessId } });
  const session = await createSession(created.user.id, inv.businessId, created.member.role);
  securityLog.info({ event: 'invite_accepted', userId: created.user.id, businessId: inv.businessId }, 'Invitation accepted');
  return { session, user: publicUser(created.user), business, role: created.member.role };
}
