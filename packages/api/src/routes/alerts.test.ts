import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../database', () => ({
  pool: { query: vi.fn() }
}));

// createServer() reads config at call time, so re-import fresh each test file run.
import { createServer } from '../server';
import { pool } from '../database';

const app = createServer();
const query = pool.query as unknown as ReturnType<typeof vi.fn>;

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
  it('rejects requests without an admin token', async () => {
    const res = await request(app).post('/api/v1/alerts').send(validRule);
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects requests with the wrong token', async () => {
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', 'Bearer wrong-token')
      .send(validRule);
    expect(res.status).toBe(401);
  });

  it('rejects an invalid payload even with a valid token', async () => {
    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', 'Bearer test-admin-token')
      .send({ ...validRule, condition: 'between' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('creates an alert with a valid token and payload', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, ...validRule, enabled: true }] });

    const res = await request(app)
      .post('/api/v1/alerts')
      .set('Authorization', 'Bearer test-admin-token')
      .send(validRule);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/v1/alerts', () => {
  it('does not require a token for reads', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/alerts');
    expect(res.status).toBe(200);
    expect(res.body.alerts).toEqual([]);
  });
});

describe('DELETE /api/v1/alerts/:id', () => {
  it('rejects without an admin token', async () => {
    const res = await request(app).delete('/api/v1/alerts/1');
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('deletes with a valid token', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(app)
      .delete('/api/v1/alerts/1')
      .set('Authorization', 'Bearer test-admin-token');
    expect(res.status).toBe(200);
  });
});
