/**
 * authenticate()/requireRole() — small Express middleware factories shared
 * by packages/api and packages/admin (packages/users mounts authenticate()
 * only on its own GET /me). Each service imports and mounts these locally,
 * the same way packages/api/src/routes/alerts.ts already imports
 * validateAlertRule from here — see docs/adr/0002-*.md.
 */
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './authUtilities';
import { Role } from '../types';

// Augment Express's Request type so req.user is known everywhere this is used.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { userId: number; tenantId: number; role: Role };
    }
  }
}

const COOKIE_NAME = 'hermes_session';

function extractToken(req: Request): string | undefined {
  // Cookie is the primary path (httpOnly, set by packages/users on
  // login/signup); a bearer header is also accepted so curl/tests and any
  // future non-browser client aren't forced through cookie jars.
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  return undefined;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (req.user.role !== role) {
      res.status(403).json({ error: `Requires ${role} role` });
      return;
    }
    next();
  };
}

export { COOKIE_NAME };
