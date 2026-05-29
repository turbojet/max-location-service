import type { FastifyPluginCallback } from 'fastify';
import type { ReadinessState } from '../state/readiness.js';

export type ReadinessProbe = () => Promise<void>;

type Options = {
  readiness: ReadinessState;
  probe?: ReadinessProbe;
};

export const readyRoutes: FastifyPluginCallback<Options> = (app, opts, done) => {
  app.get(
    '/ready',
    {
      schema: {
        tags: ['system'],
        summary: 'Readiness probe',
      },
    },
    async (request, reply) => {
      if (!opts.readiness.isReady()) {
        return reply.status(503).send({ status: 'not_ready' });
      }
      if (opts.probe) {
        try {
          await opts.probe();
        } catch (err) {
          request.log.error({ err }, 'readiness probe failed');
          opts.readiness.set('not_ready');
          return reply.status(503).send({ status: 'not_ready' });
        }
      }
      return reply.status(200).send({ status: 'ready' });
    },
  );
  done();
};
