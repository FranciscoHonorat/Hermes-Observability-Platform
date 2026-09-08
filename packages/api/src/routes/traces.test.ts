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

describe('GET /api/v1/traces', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).get('/api/v1/traces');
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns traces for an authenticated request', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/traces').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.traces).toEqual([]);
  });

  it('maps a trace summary row to camelCase', async () => {
    const startTime = new Date('2026-01-01T00:00:00.000Z');
    query.mockResolvedValueOnce({
      rows: [{
        trace_id: 'a'.repeat(32),
        start_time: startTime,
        duration_ms: '123.5',
        span_count: '3',
        has_error: false,
        root_service: 'checkout-api',
        root_operation: 'POST /checkout'
      }]
    });

    const res = await request(app).get('/api/v1/traces').set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.traces[0]).toEqual({
      traceId: 'a'.repeat(32),
      rootService: 'checkout-api',
      rootOperation: 'POST /checkout',
      startTime: startTime.getTime(),
      durationMs: 123.5,
      spanCount: 3,
      hasError: false
    });
  });
});

describe('GET /api/v1/traces/:traceId', () => {
  it('rejects requests without a session', async () => {
    const res = await request(app).get(`/api/v1/traces/${'a'.repeat(32)}`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown trace', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get(`/api/v1/traces/${'a'.repeat(32)}`).set('Authorization', auth());
    expect(res.status).toBe(404);
  });

  it('returns the trace spans ordered by start time', async () => {
    const traceId = 'a'.repeat(32);
    const startTime = new Date('2026-01-01T00:00:00.000Z');
    query.mockResolvedValueOnce({
      rows: [{
        trace_id: traceId,
        span_id: 'b'.repeat(16),
        parent_span_id: null,
        service_name: 'checkout-api',
        operation_name: 'POST /checkout',
        start_time: startTime,
        duration_ms: '10',
        status: 'ok',
        attributes: {}
      }]
    });

    const res = await request(app).get(`/api/v1/traces/${traceId}`).set('Authorization', auth());

    expect(res.status).toBe(200);
    expect(res.body.traceId).toBe(traceId);
    expect(res.body.spans).toHaveLength(1);
    expect(res.body.spans[0].spanId).toBe('b'.repeat(16));
    expect(res.body.spans[0].parentSpanId).toBeUndefined();
  });

  it('scopes the lookup to the caller\'s tenant (closes a cross-tenant id-guess leak)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(app).get(`/api/v1/traces/${'a'.repeat(32)}`).set('Authorization', auth());
    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['a'.repeat(32), 1]); // [traceId, TEST_TENANT_ID]
  });
});
