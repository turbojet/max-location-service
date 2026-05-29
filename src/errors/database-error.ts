import { Prisma } from '@prisma/client';

/**
 * Connection-level Prisma error codes that mean the database is unreachable
 * or has dropped the connection. Query-level errors (P2xxx) are NOT here —
 * those are legitimate query results and should not flip readiness.
 *
 * See https://www.prisma.io/docs/orm/reference/error-reference#error-codes
 */
const OUTAGE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1011', 'P1017']);

export class DatabaseUnavailableError extends Error {
  readonly originalError: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.originalError = originalError;
  }
}

export function isDatabaseOutage(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return true;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return OUTAGE_CODES.has(err.code);
  }
  return false;
}
