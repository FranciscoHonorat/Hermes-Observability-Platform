import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../database', () => ({
  pool: { query: vi.fn() }
}));

import { createServer } from '../server';
import { pool } from '../database';
import { adminToken } from '../testUtils/auth';

const app = createServer();
const query = pool.query as unknown as ReturnType<typeof vi.fn>;
const auth = () => `Bearer ${adminToken()}`;

beforeEach(() => {
  query.mockReset();
});

describe('GET /api/v1/anomalies', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).get('/api/v1/anomalies');
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns anomalies for an authenticated request', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/anomalies').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.anomalies).toEqual([]);
  });

  it('scopes by tenant and applies appName/severity filters', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/anomalies?appName=api-gateway&severity=critical')
      .set('Authorization', auth());
    expect(res.status).toBe(200);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('tenant_id = $1');
    expect(sql).toContain('app_name = $2');
    expect(sql).toContain('severity = $3');
    expect(params).toEqual([1, 'api-gateway', 'critical', 100]);
  });
});

describe('GET /api/v1/anomalies/:id', () => {
  it('returns 404 when not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/anomalies/999').set('Authorization', auth());
    expect(res.status).toBe(404);
  });

  it('returns the anomaly when found', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1, app_name: 'api-gateway', metric_name: 'system.cpu.usage' }] });
    const res = await request(app).get('/api/v1/anomalies/1').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('scopes the lookup to the caller\'s tenant', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app).get('/api/v1/anomalies/1').set('Authorization', auth());
    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['1', 1]); // [id, TEST_TENANT_ID]
  });
});
