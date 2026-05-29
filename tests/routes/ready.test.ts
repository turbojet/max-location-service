import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { ReadinessState } from '../../src/state/readiness.js';
import { makeTestConfig } from '../helpers/config.js';

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('GET /ready', () => {
  it('returns 200 ready when the instance is ready', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
  });

  it('returns 503 not_ready when the instance is not ready', async () => {
    const readiness = new ReadinessState('not_ready');
    app = await buildApp({ config: makeTestConfig(), logger: false, readiness });
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready' });
  });

  it('reflects state transitions on subsequent calls', async () => {
    const readiness = new ReadinessState('ready');
    app = await buildApp({ config: makeTestConfig(), logger: false, readiness });
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
    readiness.set('not_ready');
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(503);
  });

  it('returns 503 and flips readiness to not_ready when the DB probe fails', async () => {
    const readiness = new ReadinessState('ready');
    app = await buildApp({
      config: makeTestConfig(),
      logger: false,
      readiness,
      readinessProbe: () => Promise.reject(new Error('db down')),
    });
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready' });
    expect(readiness.isReady()).toBe(false);
  });

  it('returns 200 when the DB probe succeeds', async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    app = await buildApp({
      config: makeTestConfig(),
      logger: false,
      readinessProbe: probe,
    });
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('skips the DB probe when readiness is already not_ready', async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const readiness = new ReadinessState('not_ready');
    app = await buildApp({
      config: makeTestConfig(),
      logger: false,
      readiness,
      readinessProbe: probe,
    });
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503);
    expect(probe).not.toHaveBeenCalled();
  });
});
