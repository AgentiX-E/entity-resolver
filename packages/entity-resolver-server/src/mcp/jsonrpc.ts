// JSON-RPC 2.0 types and message handling for MCP protocol.
// Compliant with: https://www.jsonrpc.org/specification

// ═══════════════════════════════════════════════════════════
// JSON-RPC 2.0 Base Types
// ═══════════════════════════════════════════════════════════

/** JSON-RPC 2.0 request object. */
export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 notification (no response expected). */
export interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

/** JSON-RPC 2.0 successful response. */
export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number;
  readonly result: unknown;
}

/** JSON-RPC 2.0 error object. */
export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/** JSON-RPC 2.0 error response. */
export interface JsonRpcErrorResponse {
  readonly jsonrpc: '2.0';
  readonly id: string | number | null;
  readonly error: JsonRpcError;
}

/** Standard JSON-RPC error codes. */
export const JSONRPC_ERRORS = {
  PARSE_ERROR: { code: -32700, message: 'Parse error' },
  INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
  METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
  INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
  INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
  TOOL_EXECUTION_ERROR: { code: -32000, message: 'Tool execution error' },
} as const;

// ═══════════════════════════════════════════════════════════
// MCP Protocol Types
// ═══════════════════════════════════════════════════════════

/** MCP server information (returned by initialize). */
export interface McpServerInfo {
  readonly name: string;
  readonly version: string;
}

/** MCP server capabilities. */
export interface McpCapabilities {
  readonly tools: McpToolsCapability;
}

/** Tools capability declaration. */
export interface McpToolsCapability {
  readonly listChanged: boolean;
}

/** MCP initialize request params. */
export interface McpInitializeParams {
  readonly protocolVersion: string;
  readonly capabilities: Record<string, unknown>;
  readonly clientInfo: {
    readonly name: string;
    readonly version: string;
  };
}

/** MCP initialize result. */
export interface McpInitializeResult {
  readonly protocolVersion: string;
  readonly capabilities: McpCapabilities;
  readonly serverInfo: McpServerInfo;
}

/** MCP tools/list result. */
export interface McpToolsListResult {
  readonly tools: McpToolDefinition[];
}

/** MCP tool definition. */
export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: {
    readonly type: 'object';
    readonly properties: Record<string, unknown>;
    readonly required?: string[];
  };
}

/** MCP tools/call request params. */
export interface McpToolsCallParams {
  readonly name: string;
  readonly arguments?: Record<string, unknown>;
}

/** MCP tools/call result. */
export interface McpToolsCallResult {
  readonly content: McpContent[];
  readonly isError?: boolean;
}

/** Content block within a tool result. */
export interface McpContent {
  readonly type: 'text' | 'image' | 'resource';
  readonly text?: string;
  readonly data?: string;
  readonly mimeType?: string;
}

// ═══════════════════════════════════════════════════════════
// Message Validation
// ═══════════════════════════════════════════════════════════

/** Check if a value looks like a valid JSON-RPC 2.0 request. */
export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.jsonrpc === '2.0' &&
    typeof obj.method === 'string' &&
    (typeof obj.id === 'string' || typeof obj.id === 'number')
  );
}

/** Check if a value looks like a valid JSON-RPC 2.0 notification. */
export function isJsonRpcNotification(value: unknown): value is JsonRpcNotification {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.jsonrpc === '2.0' && typeof obj.method === 'string' && !('id' in obj);
}

/** Build a success response. */
export function buildResponse(id: string | number, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

/** Build an error response. */
export function buildErrorResponse(
  id: string | number | null,
  error: Readonly<JsonRpcError>,
): JsonRpcErrorResponse {
  return { jsonrpc: '2.0', id, error: { ...error } };
}
