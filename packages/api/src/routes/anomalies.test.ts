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

describe('GET /api/v1/anomalies', () => {
  it('does not require a token for reads', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/anomalies');
    expect(res.status).toBe(200);
    expect(res.body.anomalies).toEqual([]);
  });

  it('applies appName/severity filters', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/anomalies?appName=api-gateway&severity=critical');
    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('app_name = $1');
    expect(sql).toContain('severity = $2');
    expect(params).toEqual(['api-gateway', 'critical', 100]);
  });
});

describe('GET /api/v1/anomalies/:id', () => {
  it('returns 404 when not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/anomalies/999');
    expect(res.status).toBe(404);
  });

  it('returns the anomaly when found', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, app_name: 'api-gateway', metric_name: 'system.cpu.usage' }] });
    const res = await request(app).get('/api/v1/anomalies/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });
});
