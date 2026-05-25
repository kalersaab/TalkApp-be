import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { HttpException } from '@exceptions/HttpException';

const handler = (_req: Request, _res: Response): never => {
  throw new HttpException(429, 'Too many requests — please try again later');
};

/** 5 register attempts per hour per IP */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

/** 10 login attempts per minute per IP */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

/** 30 refresh attempts per minute per IP */
export const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

/** 200 translation requests per minute per IP */
export const translationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
