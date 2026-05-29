import { z } from 'zod';
import { parseTtlSeconds } from '../auth/ttl.js';
import type { Config } from './config.js';

const TTL_PATTERN = /^([1-9]\d*)(s|m|h|d)$|^[1-9]\d*$/;

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOCATIONS_JSON_PATH: z.string().min(1).default('data/locations.json'),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'),
      'DATABASE_URL must be a PostgreSQL connection string',
    ),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_TTL: z
    .string()
    .regex(TTL_PATTERN, "JWT_TTL must match '<number>(s|m|h|d)' or a positive integer of seconds")
    .refine(isSafeTtl, 'JWT_TTL exceeds safe integer range')
    .default('1h'),
  AUTH_READER_ID: z.string().min(1).default('reader'),
  AUTH_READER_SECRET: z.string().min(1),
  AUTH_WRITER_ID: z.string().min(1).default('writer'),
  AUTH_WRITER_SECRET: z.string().min(1),
  RATE_LIMIT_WRITE_PER_MIN: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(10),
});

function isSafeTtl(value: string): boolean {
  try {
    parseTtlSeconds(value);
    return true;
  } catch {
    return false;
  }
}

export class EnvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvConfigError';
  }
}

export function loadConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new EnvConfigError(`Invalid environment configuration: ${issues}`);
  }
  const data = result.data;

  if (data.AUTH_READER_ID === data.AUTH_WRITER_ID) {
    throw new EnvConfigError('AUTH_READER_ID and AUTH_WRITER_ID must differ');
  }

  return {
    port: data.PORT,
    logLevel: data.LOG_LEVEL,
    locationsJsonPath: data.LOCATIONS_JSON_PATH,
    databaseUrl: data.DATABASE_URL,
    jwt: {
      secret: data.JWT_SECRET,
      ttl: data.JWT_TTL,
    },
    auth: {
      reader: { id: data.AUTH_READER_ID, secret: data.AUTH_READER_SECRET },
      writer: { id: data.AUTH_WRITER_ID, secret: data.AUTH_WRITER_SECRET },
    },
    rateLimit: {
      authPerMin: data.RATE_LIMIT_AUTH_PER_MIN,
      writePerMin: data.RATE_LIMIT_WRITE_PER_MIN,
    },
  };
}
