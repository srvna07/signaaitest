import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { env } from '../config/env';

// ─── JWT payload shape ────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
}

// ─── Express Request augmentation ────────────────────────────────────────────

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload;
  }
}

// ─── authenticate middleware ──────────────────────────────────────────────────

/**
 * Verifies the JWT from `Authorization: Bearer <token>`.
 * On success, attaches `{ userId, email, role }` to `req.user` and calls next().
 * On failure, responds 401.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized: no token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Unauthorized: invalid or expired token' });
  }
}
