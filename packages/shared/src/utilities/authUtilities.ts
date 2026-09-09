/**
 * Auth utilities — shared by packages/users (signs tokens, hashes
 * passwords), packages/admin (hashes API keys), and packages/api
 * (verifies tokens on every request). See docs/adr/0002-*.md.
 *
 * JWT_SECRET is read directly from process.env here (not through any one
 * service's config.ts) so this stays a pure, config-free utility like
 * validationUtilities.ts — each service's own config.ts is still
 * responsible for refusing to start in production without it set (same
 * pattern as API_ADMIN_TOKEN/COLLECTOR_API_KEYS before it).
 */
import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AuthTokenPayload } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-do-not-use-in-production';
const TOKEN_TTL = '7d';
const BCRYPT_ROUNDS = 10;

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * API keys are high-entropy generated tokens, not low-entropy user
 * passwords — a fast hash (SHA-256) is the right tool here, the same way
 * GitHub/Stripe hash API keys; bcrypt's deliberate slowness exists to
 * resist brute-forcing a *guessable* password, which doesn't apply to a
 * 256-bit random token.
 */
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateApiKey(): string {
  // 32 cryptographically random bytes, hex-encoded (crypto.randomBytes,
  // NOT Math.random() — this is a bearer secret, not a UI-facing ID).
  return randomBytes(32).toString('hex');
}
