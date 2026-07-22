// @agentix-e/entity-resolution-server
// Deployable HTTP/gRPC/MCP API for entity resolution.
// Stateless by default — each request is independently computed.

export { createApp } from './rest/app.js';
export type { McpTool } from './mcp/tools.js';
export { getMcpTools } from './mcp/tools.js';
