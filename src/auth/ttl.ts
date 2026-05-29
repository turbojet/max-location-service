export function parseTtlSeconds(ttl: string): number {
  const trimmed = ttl.trim();
  const match = /^([1-9]\d*)(s|m|h|d)$/.exec(trimmed);
  if (match) {
    const value = Number(match[1]);
    let seconds: number;
    switch (match[2]) {
      case 's':
        seconds = value;
        break;
      case 'm':
        seconds = value * 60;
        break;
      case 'h':
        seconds = value * 3600;
        break;
      case 'd':
        seconds = value * 86400;
        break;
      default:
        throw new Error(`Invalid TTL: ${ttl}`);
    }
    return ensureSafe(seconds, ttl);
  }
  if (/^[1-9]\d*$/.test(trimmed)) {
    return ensureSafe(Number(trimmed), ttl);
  }
  throw new Error(`Invalid TTL: ${ttl}`);
}

function ensureSafe(seconds: number, ttl: string): number {
  if (!Number.isSafeInteger(seconds)) {
    throw new Error(`Invalid TTL: ${ttl} (exceeds safe integer range)`);
  }
  return seconds;
}
