import type { ClientRole } from './client-registry.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: ClientRole };
    user: { sub: string; role: ClientRole; iat: number; exp: number };
  }
}

export {};
