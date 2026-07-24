// Structured logger — unified pino-based logging for entity-resolver-server.
// Provides JSON-formatted logs with automatic timestamp and pid.
import pino from 'pino';

/** Create a logger instance with the given configuration. */
export function createLogger(name: string, level?: string): pino.Logger {
  return pino({
    name,
    level: level ?? (process.env['LOG_LEVEL'] ?? 'info'),
  });
}

/** Default server-wide logger. */
export const logger = createLogger('entity-resolver');
