import type { FastifyInstance, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import { ApiError } from '../errors/api-error.js';
import type { ClientRole } from './client-registry.js';

export type RouteAuthConfig = {
  role: ClientRole;
};

declare module 'fastify' {
  interface FastifyContextConfig {
    requireAuth?: RouteAuthConfig;
  }
}

export function registerAuthHook(app: FastifyInstance): void {
  const hook: onRequestAsyncHookHandler = async (request: FastifyRequest) => {
    const required = request.routeOptions?.config?.requireAuth;
    if (!required) {
      return;
    }
    try {
      await request.jwtVerify();
    } catch {
      throw ApiError.unauthorized();
    }
    if (required.role === 'write' && request.user.role !== 'write') {
      throw ApiError.forbidden();
    }
  };
  app.addHook('onRequest', hook);
}
