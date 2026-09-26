
export type Role = 'admin' | 'viewer';

export interface Tenant {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

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

export interface AuthTokenPayload {
  userId: number;
  tenantId: number;
  role: Role;
}
