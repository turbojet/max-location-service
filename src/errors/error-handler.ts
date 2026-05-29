import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ApiError, ERROR_CODES, type ErrorCode, type ErrorDetail } from './api-error.js';
import { DatabaseUnavailableError } from './database-error.js';

type ErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
};

function envelope(code: ErrorCode, message: string, details?: ErrorDetail[]): ErrorBody {
  return details && details.length > 0
    ? { error: { code, message, details } }
    : { error: { code, message } };
}

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof ApiError) {
    return reply.status(error.statusCode).send(envelope(error.code, error.message, error.details));
  }

  if (error instanceof DatabaseUnavailableError) {
    request.log.error({ err: error }, 'database unavailable');
    return reply
      .status(503)
      .send(envelope(ERROR_CODES.SERVICE_UNAVAILABLE, 'Service is not ready'));
  }

  if (error.validation) {
    const details: ErrorDetail[] = error.validation.map((issue) => ({
      path: parseInstancePath(issue.instancePath),
      message: issue.message ?? 'invalid value',
    }));
    return reply
      .status(400)
      .send(envelope(ERROR_CODES.VALIDATION_ERROR, 'Request validation failed', details));
  }

  const statusCode = error.statusCode ?? 500;

  if (statusCode === 401) {
    return reply.status(401).send(envelope(ERROR_CODES.UNAUTHORIZED, 'Authentication required'));
  }
  if (statusCode === 403) {
    return reply.status(403).send(envelope(ERROR_CODES.FORBIDDEN, 'Insufficient role'));
  }
  if (statusCode === 404) {
    return reply.status(404).send(envelope(ERROR_CODES.NOT_FOUND, 'Resource not found'));
  }
  if (statusCode === 429) {
    return reply.status(429).send(envelope(ERROR_CODES.RATE_LIMITED, 'Too many requests'));
  }

  request.log.error({ err: error }, 'unhandled error');
  return reply.status(500).send(envelope(ERROR_CODES.INTERNAL_ERROR, 'Internal server error'));
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply
    .status(404)
    .send(envelope(ERROR_CODES.NOT_FOUND, `Route ${request.method} ${request.url} not found`));
}

function parseInstancePath(path: string | undefined): (string | number)[] {
  if (!path) return [];
  return path
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}
