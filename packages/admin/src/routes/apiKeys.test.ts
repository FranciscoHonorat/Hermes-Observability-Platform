import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../database', () => ({
  pool: { query: vi.fn() }
}));

vi.mock('../redis', () => ({
  cacheApiKey: vi.fn(),
  uncacheApiKey: vi.fn()
}));

import { createServer } from '../server';
import { pool } from '../database';
import { cacheApiKey, uncacheApiKey } from '../redis';
import { signToken } from '@hermes/shared';

const app = createServer();
const query = pool.query as unknown as ReturnType<typeof vi.fn>;
const admin = () => `Bearer ${signToken({ userId: 1, tenantId: 1, role: 'admin' })}`;

beforeEach(() => {
  query.mockReset();
  vi.mocked(cacheApiKey).mockReset();
  vi.mocked(uncacheApiKey).mockReset();
});

describe('POST /api/v1/admin/api-keys', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).post('/api/v1/admin/api-keys').send({ label: 'test' });
    expect(res.status).toBe(401);
  });

  it('generates a key, returns it once in plaintext, and caches its hash in Redis', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 1, tenant_id: 1, label: 'test', created_at: new Date().toISOString(), revoked_at: null }]
    });

    const res = await request(app).post('/api/v1/admin/api-keys').set('Authorization', admin()).send({ label: 'test' });

    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/^[0-9a-f]{64}$/); // raw key, 32 random bytes hex-encoded
    expect(cacheApiKey).toHaveBeenCalledTimes(1);
    const [keyHash, tenantId] = vi.mocked(cacheApiKey).mock.calls[0];
    expect(keyHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hash, not the raw key
    expect(keyHash).not.toBe(res.body.key);
    expect(tenantId).toBe(1);
  });
});

describe('DELETE /api/v1/admin/api-keys/:id', () => {
  it('revokes a key and removes it from the Redis cache', async () => {
    query.mockResolvedValueOnce({ rows: [{ key_hash: 'abc123' }] });
    const res = await request(app).delete('/api/v1/admin/api-keys/1').set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(uncacheApiKey).toHaveBeenCalledWith('abc123');
  });

  it('returns 404 for an already-revoked or unknown key', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).delete('/api/v1/admin/api-keys/999').set('Authorization', admin());
    expect(res.status).toBe(404);
    expect(uncacheApiKey).not.toHaveBeenCalled();
  });
});
