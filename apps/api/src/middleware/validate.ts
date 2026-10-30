import { RequestHandler } from 'express';
import { ZodSchema } from 'zod';
import { AppError } from '../lib/errors';

/** Validates and replaces req.body with the parsed (stripped/typed) value. */
export const validateBody =
  (schema: ZodSchema): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid request', result.error.flatten().fieldErrors));
    }
    req.body = result.data;
    next();
  };

export const validateQuery =
  (schema: ZodSchema): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Invalid query parameters', result.error.flatten().fieldErrors));
    }
    req.query = result.data;
    next();
  };
