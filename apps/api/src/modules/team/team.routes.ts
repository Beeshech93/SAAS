import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { parseId } from '../../lib/crud';
import { AppError, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { generateRefreshToken, hashToken } from '../../lib/tokens';
import { assertCanAddUser } from '../billing/billing.service';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';

const INVITE_TTL_MS = 7 * 86_400_000;
const roleSchema = z.enum(['ADMIN', 'AGENT']); // OWNER cannot be granted or taken away here

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: roleSchema }).strict();
const roleUpdateSchema = z.object({ role: roleSchema }).strict();

export const teamRouter = Router();
teamRouter.use(authenticate);

teamRouter.get('/', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const { businessId } = req.auth!;
    const members = await prisma.businessMember.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
    const users = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) } } });
    const byId = new Map(users.map((u) => [u.id, u]));
    res.json({
      success: true,
      data: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        joinedAt: m.createdAt,
        name: byId.get(m.userId)?.name ?? '',
        email: byId.get(m.userId)?.email ?? '',
      })),
    });
  } catch (e) {
    next(e);
  }
});

teamRouter.get('/invitations', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const all = await prisma.invitation.findMany({
      where: { businessId: req.auth!.businessId, acceptedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    res.json({
      success: true,
      data: all.filter((i) => i.expiresAt > now).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt })),
    });
  } catch (e) {
    next(e);
  }
});

// The invitation link is returned once; only its hash is stored. (No e-mail provider yet: the owner shares the link.)
teamRouter.post('/invitations', requireRole('OWNER'), validateBody(inviteSchema), async (req, res, next) => {
  try {
    const { businessId, userId } = req.auth!;
    const { email, role } = req.body as { email: string; role: 'ADMIN' | 'AGENT' };
    if (await prisma.user.findUnique({ where: { email } })) {
      throw conflict('This e-mail already has an account');
    }
    await prisma.invitation.deleteMany({ where: { businessId, email, acceptedAt: null } }); // replace any older pending one (frees its seat)
    await assertCanAddUser(businessId);
    const token = generateRefreshToken();
    const inv = await prisma.invitation.create({
      data: { businessId, email, role, tokenHash: hashToken(token), invitedById: userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
    });
    logger.info({ event: 'invitation_created', businessId, userId, role }, 'Invitation created');
    res.status(201).json({
      success: true,
      data: {
        invitation: { id: inv.id, email: inv.email, role: inv.role, expiresAt: inv.expiresAt },
        link: `${env.APP_URL.replace(/\/$/, '')}/accept-invite?token=${token}`,
      },
    });
  } catch (e) {
    next(e);
  }
});

teamRouter.delete('/invitations/:id', requireRole('OWNER'), async (req, res, next) => {
  try {
    const { count } = await prisma.invitation.deleteMany({ where: { id: parseId(req.params.id), businessId: req.auth!.businessId, acceptedAt: null } });
    if (!count) throw notFound('Invitation not found');
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});

async function targetMember(req: { auth?: { businessId: string; userId: string }; params: Record<string, string> }) {
  const userId = parseId(req.params.userId);
  const { businessId, userId: me } = req.auth!;
  const member = await prisma.businessMember.findUnique({ where: { userId_businessId: { userId, businessId } } });
  if (!member) throw notFound('Member not found');
  if (member.role === 'OWNER') throw new AppError(403, 'FORBIDDEN', 'The owner cannot be modified');
  if (userId === me) throw new AppError(403, 'FORBIDDEN', 'You cannot modify yourself');
  return member;
}

teamRouter.patch('/:userId', requireRole('OWNER'), validateBody(roleUpdateSchema), async (req, res, next) => {
  try {
    const member = await targetMember(req as never);
    await prisma.businessMember.updateMany({ where: { id: member.id, businessId: member.businessId }, data: { role: req.body.role } });
    logger.info({ event: 'member_role_changed', businessId: member.businessId, userId: req.auth!.userId, target: member.userId, role: req.body.role }, 'Member role changed');
    res.json({ success: true, data: { userId: member.userId, role: req.body.role } });
  } catch (e) {
    next(e);
  }
});

teamRouter.delete('/:userId', requireRole('OWNER'), async (req, res, next) => {
  try {
    const member = await targetMember(req as never);
    // Their conversations go back to the unassigned pool with the AI active again.
    await prisma.conversation.updateMany({
      where: { businessId: member.businessId, assignedToId: member.userId },
      data: { assignedToId: null, aiActive: true },
    });
    await prisma.businessMember.deleteMany({ where: { id: member.id, businessId: member.businessId } });
    logger.info({ event: 'member_removed', businessId: member.businessId, userId: req.auth!.userId, target: member.userId }, 'Member removed');
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});
