import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../database', () => ({
  pool: { query: vi.fn() }
}));

import { createServer } from '../server';
import { pool } from '../database';
import { signToken } from '@hermes/shared';

const app = createServer();
const query = pool.query as unknown as ReturnType<typeof vi.fn>;
const admin = () => `Bearer ${signToken({ userId: 1, tenantId: 1, role: 'admin' })}`;
const viewer = () => `Bearer ${signToken({ userId: 2, tenantId: 1, role: 'viewer' })}`;

beforeEach(() => {
  query.mockReset();
});

describe('GET /api/v1/admin/users', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('rejects a viewer session', async () => {
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', viewer());
    expect(res.status).toBe(403);
  });

  it('lists users in the caller\'s tenant for an admin session', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(res.body.users).toEqual([]);
    const [, params] = query.mock.calls[0];
    expect(params).toEqual([1]); // caller's tenantId
  });
});

describe('POST /api/v1/admin/users', () => {
  it('rejects an invalid role', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', admin())
      .send({ email: 'x@acme.test', password: 'password123', role: 'superadmin' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('creates a user scoped to the caller\'s tenant', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 5, tenant_id: 1, email: 'x@acme.test', role: 'viewer', created_at: new Date().toISOString() }]
    });
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Authorization', admin())
      .send({ email: 'x@acme.test', password: 'password123', role: 'viewer' });
    expect(res.status).toBe(201);
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe(1); // tenant_id always from the caller, never the body
  });
});

describe('DELETE /api/v1/admin/users/:id', () => {
  it('rejects deleting your own account', async () => {
    const res = await request(app).delete('/api/v1/admin/users/1').set('Authorization', admin());
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes another user in the same tenant', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 2 }] });
    const res = await request(app).delete('/api/v1/admin/users/2').set('Authorization', admin());
    expect(res.status).toBe(200);
  });
});
