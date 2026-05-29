import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { ApiError } from '../../src/errors/api-error.js';
import { DatabaseUnavailableError } from '../../src/errors/database-error.js';
import { makeTestConfig } from '../helpers/config.js';

type ErrorBody = {
  error: {
    code: string;
    message: string;
    details?: { path: (string | number)[]; message: string }[];
  };
};

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('error handler', () => {
  it('returns the standard envelope for unknown routes', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(response.statusCode).toBe(404);
    const body = response.json<ErrorBody>();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('/does-not-exist');
  });

  it('translates ApiError into the standard envelope', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    app.get('/boom-not-found', () => {
      throw ApiError.notFound('Restaurant not found');
    });
    const response = await app.inject({ method: 'GET', url: '/boom-not-found' });
    expect(response.statusCode).toBe(404);
    expect(response.json<ErrorBody>()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Restaurant not found' },
    });
  });

  it('includes details when ApiError carries them', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    app.get('/boom-validation', () => {
      throw ApiError.validation('Validation failed', [
        { path: ['coordinates'], message: "must match 'x=N,y=N'" },
      ]);
    });
    const response = await app.inject({ method: 'GET', url: '/boom-validation' });
    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ path: ['coordinates'], message: "must match 'x=N,y=N'" }],
      },
    });
  });

  it('translates DatabaseUnavailableError into 503 SERVICE_UNAVAILABLE', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    app.get('/boom-db', () => {
      throw new DatabaseUnavailableError('connection refused');
    });
    const response = await app.inject({ method: 'GET', url: '/boom-db' });
    expect(response.statusCode).toBe(503);
    const body = response.json<ErrorBody>();
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('connection refused');
  });

  it('returns 500 INTERNAL_ERROR for unhandled exceptions without leaking details', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    app.get('/boom-internal', () => {
      throw new Error('database connection refused at internal.host:5432');
    });
    const response = await app.inject({ method: 'GET', url: '/boom-internal' });
    expect(response.statusCode).toBe(500);
    const body = response.json<ErrorBody>();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('internal.host');
  });
});
