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

describe('GET /api/v1/logs', () => {
  it('does not require a token for reads', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/logs');
    expect(res.status).toBe(200);
    expect(res.body.logs).toEqual([]);
  });

  it('maps a log row to camelCase', async () => {
    const time = new Date('2026-01-01T00:00:00.000Z');
    query.mockResolvedValueOnce({
      rows: [{
        time,
        app_name: 'checkout-api',
        level: 'error',
        message: 'payment failed',
        trace_id: 'a'.repeat(32),
        span_id: 'b'.repeat(16),
        attributes: { 'http.status_code': 502 }
      }]
    });

    const res = await request(app).get('/api/v1/logs');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.logs[0]).toEqual({
      serviceName: 'checkout-api',
      level: 'error',
      message: 'payment failed',
      timestamp: time.getTime(),
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      attributes: { 'http.status_code': 502 }
    });
  });

  it('passes the search param through to the query (trigram substring match)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/logs?search=timeout');

    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0];
    expect(params).toContain('timeout');
  });

  it('a row without a traceId omits it rather than sending null', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        time: new Date(),
        app_name: 'checkout-api',
        level: 'info',
        message: 'ok',
        trace_id: null,
        span_id: null,
        attributes: {}
      }]
    });

    const res = await request(app).get('/api/v1/logs');
    expect(res.body.logs[0].traceId).toBeUndefined();
  });
});
