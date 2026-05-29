export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type ClientCredential = {
  id: string;
  secret: string;
};

export type JwtConfig = {
  secret: string;
  ttl: string;
};

export type AuthConfig = {
  reader: ClientCredential;
  writer: ClientCredential;
};

export type RateLimitConfig = {
  authPerMin: number;
  writePerMin: number;
};

export type Config = {
  port: number;
  logLevel: LogLevel;
  locationsJsonPath: string;
  databaseUrl: string;
  jwt: JwtConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
};
