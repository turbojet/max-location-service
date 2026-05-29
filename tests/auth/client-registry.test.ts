import { describe, expect, it } from 'vitest';
import { ClientRegistry } from '../../src/auth/client-registry.js';

describe('ClientRegistry', () => {
  const reader = { id: 'reader', role: 'read' as const, secret: 'reader-secret' };
  const writer = { id: 'writer', role: 'write' as const, secret: 'writer-secret' };

  it('authenticates a matching id and secret', () => {
    const registry = new ClientRegistry([reader, writer]);
    expect(registry.authenticate('reader', 'reader-secret')).toEqual({
      id: 'reader',
      role: 'read',
    });
    expect(registry.authenticate('writer', 'writer-secret')).toEqual({
      id: 'writer',
      role: 'write',
    });
  });

  it('returns null on wrong secret', () => {
    const registry = new ClientRegistry([reader]);
    expect(registry.authenticate('reader', 'wrong')).toBeNull();
  });

  it('returns null on unknown client id', () => {
    const registry = new ClientRegistry([reader]);
    expect(registry.authenticate('ghost', 'reader-secret')).toBeNull();
  });

  it('rejects empty-secret attempts', () => {
    const registry = new ClientRegistry([reader]);
    expect(registry.authenticate('reader', '')).toBeNull();
  });

  it('distinguishes secrets that are prefixes of each other', () => {
    const registry = new ClientRegistry([
      { id: 'short', role: 'read', secret: 'abc' },
      { id: 'long', role: 'read', secret: 'abcd' },
    ]);
    expect(registry.authenticate('short', 'abcd')).toBeNull();
    expect(registry.authenticate('long', 'abc')).toBeNull();
    expect(registry.authenticate('short', 'abc')).not.toBeNull();
    expect(registry.authenticate('long', 'abcd')).not.toBeNull();
  });

  it('throws on duplicate client ids', () => {
    expect(() => new ClientRegistry([reader, { ...reader, secret: 'other' }])).toThrow(
      /duplicate/i,
    );
  });

  it('builds from auth config', () => {
    const registry = ClientRegistry.fromAuthConfig({
      reader: { id: 'r', secret: 'rs' },
      writer: { id: 'w', secret: 'ws' },
    });
    expect(registry.authenticate('r', 'rs')?.role).toBe('read');
    expect(registry.authenticate('w', 'ws')?.role).toBe('write');
  });
});
