import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { Application } from 'express';
import request from 'supertest';

async function buildAppWithKeys(keysEnv: string) {
  vi.resetModules();
  process.env.COLLECTOR_API_KEYS = keysEnv;
  const { apiKeyAuth } = await import('./apiKeyAuth');

  const app: Application = express();
  app.get('/protected', apiKeyAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

describe('apiKeyAuth', () => {
  const originalEnv = process.env.COLLECTOR_API_KEYS;

  afterEach(() => {
    process.env.COLLECTOR_API_KEYS = originalEnv;
  });

  it('lets requests through when no keys are configured (dev mode)', async () => {
    const app = await buildAppWithKeys('');
    const res = await request(app).get('/protected');
    expect(res.status).toBe(200);
  });

  it('rejects requests without an x-api-key when keys are configured', async () => {
    const app = await buildAppWithKeys('secret-1,secret-2');
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a wrong key', async () => {
    const app = await buildAppWithKeys('secret-1');
    const res = await request(app).get('/protected').set('x-api-key', 'wrong');
    expect(res.status).toBe(401);
  });

  it('accepts requests with a configured key', async () => {
    const app = await buildAppWithKeys('secret-1,secret-2');
    const res = await request(app).get('/protected').set('x-api-key', 'secret-2');
    expect(res.status).toBe(200);
  });
});
