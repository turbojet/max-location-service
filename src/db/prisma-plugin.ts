import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export type PrismaPluginOptions = {
  databaseUrl: string;
};

async function prismaPlugin(app: FastifyInstance, opts: PrismaPluginOptions): Promise<void> {
  const client = new PrismaClient({
    datasources: { db: { url: opts.databaseUrl } },
    log: ['warn', 'error'],
  });
  await client.$connect();
  app.decorate('prisma', client);
  app.addHook('onClose', async () => {
    await client.$disconnect();
  });
}

export default fp(prismaPlugin, { name: 'prisma' });
