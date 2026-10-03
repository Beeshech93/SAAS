import { CookieOptions, Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env, isProd } from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { acceptInviteSchema, inviteInfoSchema, loginSchema, registerSchema } from './auth.schemas';
import * as auth from './auth.service';

const COOKIE = 'refresh_token';
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict', // refresh is only called same-origin via the web proxy; mitigates CSRF
  path: '/api/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};

export const authRouter = Router();

authRouter.use(
  rateLimit({
    windowMs: 15 * 60_000,
    limit: env.RATE_LIMIT_AUTH_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
  }),
);

authRouter.post('/register', validateBody(registerSchema), async (req, res, next) => {
  try {
    const { session, ...rest } = await auth.register(req.body);
    res.cookie(COOKIE, session.refreshToken, cookieOptions);
    res.status(201).json({ success: true, data: { accessToken: session.accessToken, ...rest } });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/login', validateBody(loginSchema), async (req, res, next) => {
  try {
    const { session, ...rest } = await auth.login(req.body.email, req.body.password);
    res.cookie(COOKIE, session.refreshToken, cookieOptions);
    res.json({ success: true, data: { accessToken: session.accessToken, ...rest } });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/invite-info', validateBody(inviteInfoSchema), async (req, res, next) => {
  try {
    res.json({ success: true, data: await auth.inviteInfo(req.body.token) });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/accept-invite', validateBody(acceptInviteSchema), async (req, res, next) => {
  try {
    const { session, ...rest } = await auth.acceptInvite(req.body.token, req.body.name, req.body.password);
    res.cookie(COOKIE, session.refreshToken, cookieOptions);
    res.status(201).json({ success: true, data: { accessToken: session.accessToken, ...rest } });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const session = await auth.refresh(req.cookies?.[COOKIE]);
    res.cookie(COOKIE, session.refreshToken, cookieOptions);
    res.json({ success: true, data: { accessToken: session.accessToken } });
  } catch (e) {
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
    next(e);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    await auth.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    res.json({ success: true, data: await auth.getMe(req.auth!.userId, req.auth!.businessId) });
  } catch (e) {
    next(e);
  }
});
