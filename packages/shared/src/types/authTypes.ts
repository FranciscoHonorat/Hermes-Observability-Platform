/**
 * Auth Types — tenants, users, API keys. See docs/adr/0002-*.md.
 */

export type Role = 'admin' | 'viewer';

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

/** Public user shape — never includes password_hash. */
export interface User {
  id: number;
  tenant_id: number;
  email: string;
  role: Role;
  created_at: string;
}

export interface ApiKeyRecord {
  id: number;
  tenant_id: number;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** What a JWT's payload carries — signed by packages/users, verified by
 * every service via authenticate() below. */
export interface AuthTokenPayload {
  userId: number;
  tenantId: number;
  role: Role;
}
