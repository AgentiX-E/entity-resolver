// @agentix-e/entity-resolver-server
// Deployable HTTP/gRPC/MCP API. Stateless by default.
// Production-ready with auth, rate limiting, and health monitoring.

export { createApp } from './rest/app.js';
export type { ServerConfig } from './rest/app.js';

// Middleware
export type { AuthConfig, JwtValidationResult } from './middleware/auth.js';
export { createAuthMiddleware } from './middleware/auth.js';
export type { RateLimitConfig } from './middleware/rate-limit.js';
export { createRateLimitMiddleware, startBucketCleanup } from './middleware/rate-limit.js';

// MCP Tools
export type { McpTool } from './mcp/tools.js';
export { getMcpTools, executeMcpTool } from './mcp/tools.js';

// MCP JSON-RPC 2.0 Server
export { createMcpApp, resetMcpState } from './mcp/server.js';
export type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcErrorResponse,
  JsonRpcError,
  JsonRpcNotification,
  McpServerInfo,
  McpCapabilities,
  McpInitializeResult,
  McpToolsListResult,
  McpToolsCallResult,
  McpToolDefinition,
  McpContent,
} from './mcp/jsonrpc.js';
export {
  isJsonRpcRequest,
  isJsonRpcNotification,
  buildResponse,
  buildErrorResponse,
  JSONRPC_ERRORS,
} from './mcp/jsonrpc.js';

// Logging & Health
export { createLogger, logger } from './logging/logger.js';
export type { ComponentStatus, HealthCheckResult } from './logging/health.js';
export { registerHealthComponent, getHealth } from './logging/health.js';
