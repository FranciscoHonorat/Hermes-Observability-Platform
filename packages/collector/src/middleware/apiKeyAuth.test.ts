import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { Application } from 'express';
import request from 'supertest';

const lookupMock = vi.fn();

vi.mock('../redis', () => ({
  lookupTenantForApiKey: (...args: any[]) => lookupMock(...args)
}));

async function buildApp(nodeEnv: string) {
  vi.resetModules();
  lookupMock.mockReset();
  process.env.NODE_ENV = nodeEnv;
  const { apiKeyAuth } = await import('./apiKeyAuth');

  const app: Application = express();
  app.get('/protected', apiKeyAuth, (req, res) => res.json({ ok: true, tenantId: req.tenantId }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, req: any, res: any, next: any) => res.status(500).json({ error: err.message }));
  return app;
}

describe('apiKeyAuth', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    lookupMock.mockReset();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('attributes unauthenticated dev requests to the default tenant (id=1)', async () => {
    const app = await buildApp('development');
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(1);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests in production', async () => {
    const app = await buildApp('production');
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  it('rejects a key that does not resolve to any tenant', async () => {
    const app = await buildApp('development');
    lookupMock.mockResolvedValueOnce(null);
    const res = await request(app).get('/protected').set('x-api-key', 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('accepts a key that resolves to a tenant, and attaches it to the request', async () => {
    const app = await buildApp('development');
    lookupMock.mockResolvedValueOnce(7);
    const res = await request(app).get('/protected').set('x-api-key', 'a-real-key');
    expect(res.status).toBe(200);
    expect(res.body.tenantId).toBe(7);
    // the raw key must never reach Redis in the clear — apiKeyAuth hashes it
    // first (SHA-256 hex digest, 64 chars, not the raw 'a-real-key' string)
    expect(lookupMock).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64}$/));
  });
});
