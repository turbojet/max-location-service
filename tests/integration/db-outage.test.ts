import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { DatabaseUnavailableError } from '../../src/errors/database-error.js';
import type { LocationRepository } from '../../src/repositories/location-repository.js';
import { LocationService } from '../../src/services/location-service.js';
import { SpatialIndex } from '../../src/spatial/spatial-index.js';
import { ReadinessState } from '../../src/state/readiness.js';
import { makeTestConfig } from '../helpers/config.js';

const ID = '11111111-1111-4111-8111-111111111111';

const VALID_BODY = {
  name: 'Test',
  type: 'Restaurant',
  id: ID,
  'opening-hours': '10:00AM-10:00PM',
  image: 'https://example.com/img.png',
  radius: 1,
  coordinates: 'x=1,y=1',
};

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

afterEach(async () => {
  if (app) {
    await app.close();
    app = undefined;
  }
});

function makeOutageRepo(): LocationRepository {
  return {
    findAll: () => Promise.resolve([]),
    findById: () => Promise.reject(new DatabaseUnavailableError('db gone')),
    createOrReplace: () => Promise.reject(new DatabaseUnavailableError('db gone')),
  };
}

async function readerToken(): Promise<string> {
  const res = await app!.inject({
    method: 'POST',
    url: '/auth/token',
    payload: { client_id: 'reader', client_secret: 'reader-test-secret' },
  });
  return res.json<{ access_token: string }>().access_token;
}

async function writerToken(): Promise<string> {
  const res = await app!.inject({
    method: 'POST',
    url: '/auth/token',
    payload: { client_id: 'writer', client_secret: 'writer-test-secret' },
  });
  return res.json<{ access_token: string }>().access_token;
}

describe('first request to hit a DB outage', () => {
  it('returns 503 SERVICE_UNAVAILABLE on GET /locations/{id} and flips readiness', async () => {
    const readiness = new ReadinessState();
    const repo = makeOutageRepo();
    const service = new LocationService(repo, new SpatialIndex(), readiness);
    app = await buildApp({
      config: makeTestConfig(),
      logger: false,
      readiness,
      repository: repo,
      locationService: service,
    });

    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);

    const token = await readerToken();
    const response = await app.inject({
      method: 'GET',
      url: `/locations/${ID}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is not ready' },
    });

    const readyAfter = await app.inject({ method: 'GET', url: '/ready' });
    expect(readyAfter.statusCode).toBe(503);
  });

  it('returns 503 SERVICE_UNAVAILABLE on PUT /locations/{id} and flips readiness', async () => {
    const readiness = new ReadinessState();
    const repo = makeOutageRepo();
    const service = new LocationService(repo, new SpatialIndex(), readiness);
    app = await buildApp({
      config: makeTestConfig(),
      logger: false,
      readiness,
      repository: repo,
      locationService: service,
    });

    const token = await writerToken();
    const response = await app.inject({
      method: 'PUT',
      url: `/locations/${ID}`,
      headers: { Authorization: `Bearer ${token}` },
      payload: VALID_BODY,
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is not ready' },
    });

    const readyAfter = await app.inject({ method: 'GET', url: '/ready' });
    expect(readyAfter.statusCode).toBe(503);
  });
});
