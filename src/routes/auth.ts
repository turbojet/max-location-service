import type { FastifyPluginCallback } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ApiError } from '../errors/api-error.js';
import { AuthRequestSchema, AuthResponseSchema } from '../schemas/auth.js';
import { parseTtlSeconds } from '../auth/ttl.js';
import type { ClientRegistry } from '../auth/client-registry.js';

type Options = {
  clients: ClientRegistry;
  jwtTtl: string;
  rateLimitPerMin: number;
};

export const authRoutes: FastifyPluginCallback<Options> = (app, opts, done) => {
  const expiresIn = parseTtlSeconds(opts.jwtTtl);
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.post(
    '/auth/token',
    {
      schema: {
        tags: ['auth'],
        summary: 'Issue a JWT for a configured client',
        body: AuthRequestSchema,
        response: { 200: AuthResponseSchema },
      },
      config: {
        rateLimit: {
          max: opts.rateLimitPerMin,
          timeWindow: '1 minute',
        },
      },
    },
    (request) => {
      const { client_id, client_secret } = request.body;
      const client = opts.clients.authenticate(client_id, client_secret);
      if (!client) {
        throw ApiError.unauthorized('Invalid client credentials');
      }
      const access_token = request.server.jwt.sign({
        sub: client.id,
        role: client.role,
      });
      return {
        access_token,
        token_type: 'Bearer' as const,
        expires_in: expiresIn,
      };
    },
  );

  done();
};
