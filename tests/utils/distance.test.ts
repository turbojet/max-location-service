import { describe, expect, it } from 'vitest';
import { roundDistanceFromSquared } from '../../src/utils/distance.js';

describe('roundDistanceFromSquared', () => {
  it('returns 0 when the squared distance is 0', () => {
    expect(roundDistanceFromSquared(0)).toBe(0);
  });

  it('takes the sqrt of the squared distance', () => {
    expect(roundDistanceFromSquared(1)).toBe(1);
    expect(roundDistanceFromSquared(4)).toBe(2);
    expect(roundDistanceFromSquared(25)).toBe(5);
  });

  it('rounds to at most 5 decimal places', () => {
    expect(roundDistanceFromSquared(2)).toBeCloseTo(1.41421, 5);
    expect(roundDistanceFromSquared(2)).toBe(1.41421);
  });
});
