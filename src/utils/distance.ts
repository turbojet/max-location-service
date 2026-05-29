const DECIMAL_FACTOR = 100_000;

export function roundDistanceFromSquared(distanceSquared: number): number {
  if (distanceSquared === 0) return 0;
  const raw = Math.sqrt(distanceSquared);
  return Math.round(raw * DECIMAL_FACTOR) / DECIMAL_FACTOR;
}
