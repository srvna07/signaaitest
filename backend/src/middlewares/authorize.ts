import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';

// ─── Role permission matrix ───────────────────────────────────────────────────
//
// ADMIN  — full access to everything, including user management
// EDITOR — can create/edit test cases, requirements, environments
//           cannot manage users
// RUNNER — can execute tests and view everything
//           cannot create or edit test cases
// VIEWER — read-only access to test cases, reports, and results
//
// Usage on a route:
//   router.post('/some-resource', authenticate, authorize(Role.ADMIN, Role.EDITOR), handler)
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Middleware factory that restricts access to users whose role is in `allowedRoles`.
 * Must be placed after `authenticate` in the middleware chain.
 *
 * Returns 401 if `req.user` is missing (authenticate was skipped).
 * Returns 403 if the user's role is not in the allowed list.
 */
export function authorize(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Unauthorized: not authenticated' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: requires one of [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}
