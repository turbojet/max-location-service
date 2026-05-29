import { describe, expect, it } from 'vitest';
import { EnvConfigError, loadConfigFromEnv } from '../../src/config/env.js';

const REQUIRED: NodeJS.ProcessEnv = {
  JWT_SECRET: 'test-jwt-secret-of-sufficient-length-1234',
  AUTH_READER_SECRET: 'reader-secret',
  AUTH_WRITER_SECRET: 'writer-secret',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5435/bonial_locations',
};

describe('loadConfigFromEnv', () => {
  it('applies defaults when only required env values are provided', () => {
    const config = loadConfigFromEnv({ ...REQUIRED });
    expect(config).toEqual({
      port: 3000,
      logLevel: 'info',
      locationsJsonPath: 'data/locations.json',
      databaseUrl: REQUIRED.DATABASE_URL,
      jwt: { secret: REQUIRED.JWT_SECRET, ttl: '1h' },
      auth: {
        reader: { id: 'reader', secret: 'reader-secret' },
        writer: { id: 'writer', secret: 'writer-secret' },
      },
      rateLimit: { authPerMin: 10, writePerMin: 20 },
    });
  });

  it('parses provided overrides', () => {
    const config = loadConfigFromEnv({
      ...REQUIRED,
      PORT: '8080',
      LOG_LEVEL: 'debug',
      LOCATIONS_JSON_PATH: '/tmp/locations.json',
      JWT_TTL: '30m',
      AUTH_READER_ID: 'analytics',
      AUTH_WRITER_ID: 'admin',
      RATE_LIMIT_AUTH_PER_MIN: '5',
      RATE_LIMIT_WRITE_PER_MIN: '50',
    });
    expect(config.port).toBe(8080);
    expect(config.logLevel).toBe('debug');
    expect(config.locationsJsonPath).toBe('/tmp/locations.json');
    expect(config.jwt.ttl).toBe('30m');
    expect(config.auth.reader.id).toBe('analytics');
    expect(config.auth.writer.id).toBe('admin');
    expect(config.rateLimit.authPerMin).toBe(5);
    expect(config.rateLimit.writePerMin).toBe(50);
  });

  it('rejects a missing JWT_SECRET', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, JWT_SECRET: undefined })).toThrow(EnvConfigError);
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, JWT_SECRET: 'too-short' })).toThrow(
      EnvConfigError,
    );
  });

  it('rejects a non-numeric port', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, PORT: 'abc' })).toThrow(EnvConfigError);
  });

  it('rejects a non-positive port', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, PORT: '0' })).toThrow(EnvConfigError);
    expect(() => loadConfigFromEnv({ ...REQUIRED, PORT: '-1' })).toThrow(EnvConfigError);
  });

  it('rejects an unknown log level', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, LOG_LEVEL: 'verbose' })).toThrow(EnvConfigError);
  });

  it('rejects an empty locations path', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, LOCATIONS_JSON_PATH: '' })).toThrow(
      EnvConfigError,
    );
  });

  it('rejects a malformed JWT_TTL', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, JWT_TTL: '1week' })).toThrow(EnvConfigError);
  });

  it.each(['0', '0s', '0m', '0h', '0d', '01h'])(
    'rejects zero or leading-zero JWT_TTL %j',
    (ttl) => {
      expect(() => loadConfigFromEnv({ ...REQUIRED, JWT_TTL: ttl })).toThrow(EnvConfigError);
    },
  );

  it('rejects JWT_TTL values that overflow safe integer range', () => {
    const huge = '9'.repeat(400);
    expect(() => loadConfigFromEnv({ ...REQUIRED, JWT_TTL: `${huge}h` })).toThrow(EnvConfigError);
    expect(() => loadConfigFromEnv({ ...REQUIRED, JWT_TTL: '1000000000000d' })).toThrow(
      EnvConfigError,
    );
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, DATABASE_URL: undefined })).toThrow(
      EnvConfigError,
    );
  });

  it('rejects a DATABASE_URL with a non-postgres scheme', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, DATABASE_URL: 'mysql://x/y' })).toThrow(
      EnvConfigError,
    );
  });

  it('rejects when reader and writer client ids collide', () => {
    expect(() =>
      loadConfigFromEnv({ ...REQUIRED, AUTH_READER_ID: 'same', AUTH_WRITER_ID: 'same' }),
    ).toThrow(EnvConfigError);
  });

  it('rejects a non-positive rate limit', () => {
    expect(() => loadConfigFromEnv({ ...REQUIRED, RATE_LIMIT_AUTH_PER_MIN: '0' })).toThrow(
      EnvConfigError,
    );
  });
});
