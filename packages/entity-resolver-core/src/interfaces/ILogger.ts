/**
 * Logger interface for entity-resolver.
 *
 * Defines a structured logging contract with four severity levels.
 * Core package defines only this interface — real implementations
 * (pino, console, browser console) live in node/browser/server packages.
 *
 * All logging methods accept a message and optional structured context.
 * Implementations decide how to format and transport log entries.
 */

/** Standard log levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured context attached to a log entry. */
export interface LogContext {
  /** The operation or module that produced this log entry. */
  readonly operation?: string;
  /** Additional key-value diagnostic data. */
  readonly [key: string]: unknown;
}

/** Contract that all logger implementations must satisfy. */
export interface ILogger {
  /** Debug-level diagnostic information. Only enabled in development. */
  debug(message: string, context?: LogContext): void;

  /** Informational message about normal operations. */
  info(message: string, context?: LogContext): void;

  /** Warning about a potential issue that doesn't prevent operation. */
  warn(message: string, context?: LogContext): void;

  /** Error that impacts functionality. Should include structured context. */
  error(message: string, context?: LogContext): void;
}

/**
 * No-op logger implementation. Used as the default when no logger
 * is provided. All methods silently discard messages.
 */
export const NoopLogger: ILogger = Object.freeze({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
});
