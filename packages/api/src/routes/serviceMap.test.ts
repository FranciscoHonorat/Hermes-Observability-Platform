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

describe('GET /api/v1/service-map', () => {
  it('does not require a token for reads', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app).get('/api/v1/service-map');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ nodes: [], edges: [] });
  });

  it('maps a row into an edge and derives node stats from it', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        caller: 'checkout-api',
        callee: 'payment-service',
        call_count: '5',
        avg_duration_ms: '80.5',
        error_count: '2'
      }]
    });

    const res = await request(app).get('/api/v1/service-map');

    expect(res.status).toBe(200);
    expect(res.body.edges).toEqual([{
      source: 'checkout-api',
      target: 'payment-service',
      callCount: 5,
      errorCount: 2,
      avgDurationMs: 80.5
    }]);
    // caller node exists (as a source) with no incoming calls of its own
    expect(res.body.nodes).toContainEqual({
      serviceName: 'checkout-api',
      callCount: 0,
      errorCount: 0,
      errorRate: 0
    });
    // callee node's stats are summed from the incoming edge
    expect(res.body.nodes).toContainEqual({
      serviceName: 'payment-service',
      callCount: 5,
      errorCount: 2,
      errorRate: 0.4
    });
  });

  it('sums stats across multiple incoming edges to the same service', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { caller: 'checkout-api', callee: 'inventory-service', call_count: '3', avg_duration_ms: '10', error_count: '0' },
        { caller: 'admin-api', callee: 'inventory-service', call_count: '2', avg_duration_ms: '15', error_count: '1' }
      ]
    });

    const res = await request(app).get('/api/v1/service-map');

    expect(res.body.nodes).toContainEqual({
      serviceName: 'inventory-service',
      callCount: 5,
      errorCount: 1,
      errorRate: 0.2
    });
  });
});
