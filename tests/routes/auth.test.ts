import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { makeTestConfig } from '../helpers/config.js';

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type ErrorBody = { error: { code: string; message: string } };

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

describe('POST /auth/token', () => {
  it('issues a JWT for valid writer credentials with the configured TTL', async () => {
    const config = makeTestConfig({
      jwt: { secret: 'test-jwt-secret-of-sufficient-length-1234', ttl: '1h' },
    });
    app = await buildApp({ config, logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { client_id: 'writer', client_secret: 'writer-test-secret' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<TokenResponse>();
    expect(body.token_type).toBe('Bearer');
    expect(body.expires_in).toBe(3600);
    expect(typeof body.access_token).toBe('string');

    const decoded = app.jwt.decode<{ sub: string; role: string; exp: number; iat: number }>(
      body.access_token,
    );
    expect(decoded?.sub).toBe('writer');
    expect(decoded?.role).toBe('write');
    expect(decoded?.exp).toBeGreaterThan(decoded?.iat ?? 0);
  });

  it('issues a JWT for valid reader credentials with role=read', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { client_id: 'reader', client_secret: 'reader-test-secret' },
    });
    expect(response.statusCode).toBe(200);
    const decoded = app.jwt.decode<{ role: string }>(response.json<TokenResponse>().access_token);
    expect(decoded?.role).toBe('read');
  });

  it('returns 401 UNAUTHORIZED for a bad secret', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { client_id: 'reader', client_secret: 'wrong' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json<ErrorBody>().error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 UNAUTHORIZED for an unknown client id', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { client_id: 'ghost', client_secret: 'anything' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json<ErrorBody>().error.code).toBe('UNAUTHORIZED');
  });

  it('returns 400 VALIDATION_ERROR when fields are missing', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: { client_id: 'reader' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when unknown fields are sent', async () => {
    app = await buildApp({ config: makeTestConfig(), logger: false });
    const response = await app.inject({
      method: 'POST',
      url: '/auth/token',
      payload: {
        client_id: 'reader',
        client_secret: 'reader-test-secret',
        extra: 'nope',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<ErrorBody>().error.code).toBe('VALIDATION_ERROR');
  });

  it('rate limits per IP and returns 429 RATE_LIMITED', async () => {
    const config = makeTestConfig({
      rateLimit: { authPerMin: 2, writePerMin: 100 },
    });
    app = await buildApp({ config, logger: false });
    const send = () =>
      app!.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { client_id: 'reader', client_secret: 'reader-test-secret' },
      });
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(200);
    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(limited.json<ErrorBody>().error.code).toBe('RATE_LIMITED');
  });
});
