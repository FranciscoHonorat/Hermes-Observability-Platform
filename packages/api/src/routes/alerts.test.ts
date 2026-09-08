import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../database', () => ({
  pool: { query: vi.fn() }
}));

// createServer() reads config at call time, so re-import fresh each test file run.
import { createServer } from '../server';
import { pool } from '../database';
import { adminToken, viewerToken } from '../testUtils/auth';

const app = createServer();
const query = pool.query as unknown as ReturnType<typeof vi.fn>;
const admin = () => `Bearer ${adminToken()}`;
const viewer = () => `Bearer ${viewerToken()}`;

const validRule = {
  name: 'High error rate',
  metric_name: 'http_errors_total',
  condition: 'gt',
  threshold: 100,
  email_recipients: ['ops@example.com']
};

beforeEach(() => {
  query.mockReset();
});

describe('POST /api/v1/alerts', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).post('/api/v1/alerts').send(validRule);
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects requests from a viewer role', async () => {
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', viewer())
      .send(validRule);
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload even with an admin session', async () => {
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', admin())
      .send({ ...validRule, condition: 'between' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('creates an alert with an admin session and valid payload', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, ...validRule, enabled: true }] });

    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', admin())
      .send(validRule);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/alerts', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).get('/api/v1/alerts');
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('allows a viewer session to read', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/alerts').set('Authorization', viewer());
    expect(res.status).toBe(200);
    expect(res.body.alerts).toEqual([]);
  });

  it('scopes the query to the caller\'s tenant', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/v1/alerts').set('Authorization', viewer());
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe(1); // TEST_TENANT_ID
  });
});

describe('DELETE /api/v1/alerts/:id', () => {
  it('rejects without an admin session', async () => {
    const res = await request(app).delete('/api/v1/alerts/1');
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a viewer session', async () => {
    const res = await request(app).delete('/api/v1/alerts/1').set('Authorization', viewer());
    expect(res.status).toBe(403);
  });

  it('deletes with an admin session', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .delete('/api/v1/alerts/1')
      .set('Authorization', admin());
    expect(res.status).toBe(200);
  });
});
