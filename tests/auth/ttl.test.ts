import { describe, expect, it } from 'vitest';
import { parseTtlSeconds } from '../../src/auth/ttl.js';

describe('parseTtlSeconds', () => {
  it.each([
    ['30s', 30],
    ['10m', 600],
    ['1h', 3600],
    ['2h', 7200],
    ['1d', 86400],
    ['3600', 3600],
  ])('parses %s as %d seconds', (input, expected) => {
    expect(parseTtlSeconds(input)).toBe(expected);
  });

  it('trims surrounding whitespace', () => {
    expect(parseTtlSeconds(' 1h ')).toBe(3600);
  });

  it.each(['', '1w', 'h', '1.5h', 'abc', '0', '0s', '0m', '0h', '0d', '01h', '-1h', '1 h'])(
    'rejects invalid TTL %j',
    (input) => {
      expect(() => parseTtlSeconds(input)).toThrow(/Invalid TTL/);
    },
  );

  it('accepts a bare seconds integer', () => {
    expect(parseTtlSeconds('1')).toBe(1);
  });

  it('rejects values that overflow the safe integer range (huge digits)', () => {
    const huge = '9'.repeat(400);
    expect(() => parseTtlSeconds(`${huge}h`)).toThrow(/exceeds safe integer range/);
    expect(() => parseTtlSeconds(huge)).toThrow(/exceeds safe integer range/);
  });

  it('rejects values whose multiplied seconds would exceed safe integer range', () => {
    // 2 ** 53 / 86400 ≈ 1.04e11 days; one digit more guarantees overflow after * 86400.
    expect(() => parseTtlSeconds('1000000000000d')).toThrow(/exceeds safe integer range/);
  });
});
