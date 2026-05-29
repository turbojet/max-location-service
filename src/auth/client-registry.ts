import { timingSafeEqual } from 'node:crypto';
import type { AuthConfig } from '../config/config.js';

export type ClientRole = 'read' | 'write';

export type Client = {
  id: string;
  role: ClientRole;
};

type StoredClient = Client & {
  secret: Buffer;
};

export class ClientRegistry {
  private readonly byId: Map<string, StoredClient>;

  constructor(clients: Array<Client & { secret: string }>) {
    this.byId = new Map();
    for (const client of clients) {
      if (this.byId.has(client.id)) {
        throw new Error(`Duplicate client id: ${client.id}`);
      }
      this.byId.set(client.id, {
        id: client.id,
        role: client.role,
        secret: Buffer.from(client.secret, 'utf8'),
      });
    }
  }

  static fromAuthConfig(auth: AuthConfig): ClientRegistry {
    return new ClientRegistry([
      { id: auth.reader.id, role: 'read', secret: auth.reader.secret },
      { id: auth.writer.id, role: 'write', secret: auth.writer.secret },
    ]);
  }

  authenticate(id: string, secret: string): Client | null {
    const candidate = Buffer.from(secret, 'utf8');
    const stored = this.byId.get(id);

    let match = false;
    if (stored) {
      match = constantTimeEqual(candidate, stored.secret);
    } else {
      constantTimeEqual(candidate, candidate);
    }

    if (!stored || !match) {
      return null;
    }
    return { id: stored.id, role: stored.role };
  }
}

function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  const length = Math.max(a.length, b.length);
  const padA = Buffer.alloc(length);
  const padB = Buffer.alloc(length);
  a.copy(padA);
  b.copy(padB);
  const equalContent = timingSafeEqual(padA, padB);
  return equalContent && a.length === b.length;
}
