import { signToken } from '@hermes/shared';

// Fixed IDs so tests can assert on them; JWT_SECRET is set to a fixed test
// value in vitest.config.ts, so these tokens verify consistently.
export const TEST_TENANT_ID = 1;

export function adminToken(tenantId = TEST_TENANT_ID): string {
  return signToken({ userId: 1, tenantId, role: 'admin' });
}

export function viewerToken(tenantId = TEST_TENANT_ID): string {
  return signToken({ userId: 2, tenantId, role: 'viewer' });
}
