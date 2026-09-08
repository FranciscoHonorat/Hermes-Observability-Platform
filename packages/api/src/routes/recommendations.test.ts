import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../database', () => ({
  pool: { query: vi.fn() }
}));

import { createServer } from '../server';
import { pool } from '../database';

const app = createServer();
const query = pool.query as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  query.mockReset();
});

describe('GET /api/v1/recommendations', () => {
  it('does not require a token for reads', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/recommendations');
    expect(res.status).toBe(200);
    expect(res.body.recommendations).toEqual([]);
  });
});

describe('PUT /api/v1/recommendations/:id', () => {
  it('rejects without an admin token', async () => {
    const res = await request(app).put('/api/v1/recommendations/1').send({ status: 'acknowledged' });
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an invalid status even with a valid token', async () => {
    const res = await request(app)
      .put('/api/v1/recommendations/1')
      .set('Authorization', 'Bearer test-admin-token')
      .send({ status: 'snoozed' });
    expect(res.status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });

  it('updates status with a valid token and payload', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, status: 'acknowledged' }] });
    const res = await request(app)
      .put('/api/v1/recommendations/1')
      .set('Authorization', 'Bearer test-admin-token')
      .send({ status: 'acknowledged' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('acknowledged');
  });

  it('returns 404 when the recommendation does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .put('/api/v1/recommendations/999')
      .set('Authorization', 'Bearer test-admin-token')
      .send({ status: 'dismissed' });
    expect(res.status).toBe(404);
  });
});
