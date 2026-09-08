import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../database', () => ({
  pool: { query: vi.fn() }
}));

import { createServer } from '../server';
import { pool } from '../database';
import { hashPassword, signToken } from '@hermes/shared';

const app = createServer();
const query = pool.query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  query.mockReset();
});

describe('POST /api/v1/auth/signup', () => {
  it('rejects a payload missing required fields', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({ tenantName: 'Acme' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a password under 8 characters', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ tenantName: 'Acme', email: 'a@acme.test', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('creates a tenant and its first admin user, and sets a session cookie', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Acme', slug: 'acme', created_at: new Date().toISOString() }] }) // tenant insert
      .mockResolvedValueOnce({ rows: [{ id: 1, tenant_id: 1, email: 'a@acme.test', role: 'admin', created_at: new Date().toISOString() }] }); // user insert

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ tenantName: 'Acme', email: 'a@acme.test', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.tenant.slug).toBe('acme');
    expect(res.headers['set-cookie']?.[0]).toMatch(/hermes_session=/);
  });

  it('retries with a suffixed slug on a slug collision, then succeeds', async () => {
    const collision: any = new Error('duplicate key');
    collision.code = '23505';
    query
      .mockRejectedValueOnce(collision) // first slug taken
      .mockResolvedValueOnce({ rows: [{ id: 2, name: 'Acme', slug: 'acme-xyz1', created_at: new Date().toISOString() }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, tenant_id: 2, email: 'b@acme.test', role: 'admin', created_at: new Date().toISOString() }] });

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ tenantName: 'Acme', email: 'b@acme.test', password: 'password123' });

    expect(res.status).toBe(201);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('rejects a payload missing required fields', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@acme.test' });
    expect(res.status).toBe(400);
  });

  it('rejects unknown tenant/email combination', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ tenantSlug: 'acme', email: 'nobody@acme.test', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    const passwordHash = await hashPassword('correct-password');
    query.mockResolvedValueOnce({
      rows: [{ id: 1, tenant_id: 1, email: 'a@acme.test', password_hash: passwordHash, role: 'admin' }]
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ tenantSlug: 'acme', email: 'a@acme.test', password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('logs in with the correct password and sets a session cookie', async () => {
    const passwordHash = await hashPassword('correct-password');
    query.mockResolvedValueOnce({
      rows: [{ id: 1, tenant_id: 1, email: 'a@acme.test', password_hash: passwordHash, role: 'admin' }]
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ tenantSlug: 'acme', email: 'a@acme.test', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/hermes_session=/);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('clears the session cookie', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/hermes_session=;/);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user + tenant for a valid session', async () => {
    const token = signToken({ userId: 1, tenantId: 1, role: 'admin' });
    query.mockResolvedValueOnce({
      rows: [{
        id: 1, tenant_id: 1, email: 'a@acme.test', role: 'admin', created_at: new Date().toISOString(),
        tenant_name: 'Acme', tenant_slug: 'acme'
      }]
    });
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('a@acme.test');
  });
});
