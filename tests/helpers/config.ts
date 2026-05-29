import type { Config } from '../../src/config/config.js';

export function makeTestConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 3000,
    logLevel: 'silent',
    locationsJsonPath: 'data/locations.json',
    databaseUrl: 'postgresql://postgres:postgres@localhost:5435/bonial_locations_test',
    jwt: {
      secret: 'test-jwt-secret-of-sufficient-length-1234',
      ttl: '1h',
    },
    auth: {
      reader: { id: 'reader', secret: 'reader-test-secret' },
      writer: { id: 'writer', secret: 'writer-test-secret' },
    },
    rateLimit: {
      authPerMin: 1000,
      writePerMin: 1000,
    },
    ...overrides,
  };
}
