// MCP Server — JSON-RPC 2.0 over SSE transport.
// Compliant with Model Context Protocol specification.
// Supports: initialize, tools/list, tools/call, notifications/initialized.

import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  isJsonRpcRequest,
  buildResponse,
  buildErrorResponse,
  JSONRPC_ERRORS,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcErrorResponse,
  type McpInitializeResult,
  type McpToolsListResult,
  type McpToolsCallResult,
} from './jsonrpc.js';
import { getMcpTools, executeMcpTool, type McpTool } from './tools.js';
import { getHealth } from '../logging/health.js';

// ═══════════════════════════════════════════════════════════
// MCP Server State
// ═══════════════════════════════════════════════════════════

/** Server version. */
const SERVER_VERSION = '0.1.0';
const SERVER_NAME = '@agentix-e/entity-resolver';

/** Track initialization state for MCP lifecycle. */
let initialized = false;

/** Reset server state (for testing). */
export function resetMcpState(): void {
  initialized = false;
}

// ═��═════════════════════════════════════════════════════════
// Method Handlers
// ═══════════════════════════════════════════════════════════

/** Handle the MCP initialize method. */
function handleInitialize(_req: JsonRpcRequest): McpInitializeResult {
  if (initialized) {
    throw Object.assign(new Error('Server already initialized'), { code: -32001 });
  }
  initialized = true;
  return {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  };
}

/** Handle the MCP tools/list method. */
function handleToolsList(_req: JsonRpcRequest): McpToolsListResult {
  const tools = getMcpTools();
  return {
    tools: tools.map(toMcpToolDefinition),
  };
}

/** Handle the MCP tools/call method. */
async function handleToolsCall(req: JsonRpcRequest): Promise<McpToolsCallResult> {
  const params = req.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
  if (!params?.name || typeof params.name !== 'string') {
    throw Object.assign(new Error('Missing tool name'), { code: -32602 });
  }

  try {
    const result = await executeMcpTool(params.name, params.arguments ?? {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error executing tool: ${message}` }],
      isError: true,
    };
  }
}

/** Convert an internal McpTool to the MCP protocol tool definition shape. */
function toMcpToolDefinition(tool: McpTool) {
  const params = tool.parameters as Record<string, unknown>;
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object' as const,
      properties: (params['properties'] ?? {}) as Record<string, unknown>,
      required: (params['required'] ?? []) as string[],
    },
  };
}

// ═══════════════════════════════════════════════════════════
// Request Router
// ═══════════════════════════════════════════════════════════

/**
 * Dispatch a JSON-RPC request to the appropriate MCP handler.
 * Returns a JSON-serializable response object.
 */
async function dispatchMethod(req: JsonRpcRequest): Promise<JsonRpcResponse | JsonRpcErrorResponse> {
  switch (req.method) {
    case 'initialize': {
      const result = handleInitialize(req);
      return buildResponse(req.id, result);
    }

    case 'tools/list': {
      const result = handleToolsList(req);
      return buildResponse(req.id, result);
    }

    case 'tools/call': {
      const result = await handleToolsCall(req);
      return buildResponse(req.id, result);
    }

    case 'notifications/initialised':
    case 'notifications/initialized': {
      // JSON-RPC 2.0: notifications (no "id" field) MUST NOT receive a response.
      if (!('id' in req) || req.id === undefined || req.id === null) {
        initialized = true;
        return null; // No response for notifications
      }
      initialized = true;
      return buildResponse(req.id, {});
    }

    default:
      return buildErrorResponse(req.id, JSONRPC_ERRORS.METHOD_NOT_FOUND);
  }
}

// ═══════════════════════════════════════════════════════════
// SSE Transport
// ═══════════════════════════════════════════════════════════

/** Map of active SSE connections by session ID. */
const sseClients = new Map<string, { send: (data: string) => void; lastPing: number }>();

/**
 * Start a periodic SSE heartbeat.
 * Clients inactive for >2x heartbeat interval are cleaned up.
 */
function startSSEHeartbeat(clearExisting = true): () => void {
  const HEARTBEAT_MS = 30000;
  
  if (clearExisting) {
    // Kill any previous heartbeat interval
    _heartbeatId = setInterval(() => {
      const now = Date.now();
      for (const [sid, client] of sseClients) {
        if (now - client.lastPing > HEARTBEAT_MS * 3) {
          sseClients.delete(sid);
        } else {
          try {
            client.send('event: ping\ndata: {}\n\n');
          } catch {
            sseClients.delete(sid);
          }
        }
      }
    }, HEARTBEAT_MS);
    
    _heartbeatId.unref?.(); // Don't keep the process alive
  }
  
  return () => {
    if (_heartbeatId) {
      clearInterval(_heartbeatId);
      _heartbeatId = null;
    }
  };
}

let _heartbeatId: ReturnType<typeof setInterval> | null = null;

/**
 * Send a Server-Sent Event to a client.
 * Format: `event: message\ndata: <json>\n\n`
 */
function sendSSE(sessionId: string, data: string): void {
  const client = sseClients.get(sessionId);
  if (client) {
    client.lastPing = Date.now();
    client.send(data);
  }
}

/** Create an SSE endpoint that streams responses to the client. */
function sseEndpoint(_c: Context): Response {
  const sessionId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      startSSEHeartbeat(false);
      
      // Register client for server-initiated events
      sseClients.set(sessionId, {
        send: (data) => controller.enqueue(`event: message\ndata: ${data}\n\n`),
        lastPing: Date.now(),
      });

      // Send initial connection event
      controller.enqueue(`event: endpoint\ndata: /mcp/message?sessionId=${sessionId}\n\n`);
    },
    cancel() {
      sseClients.delete(sessionId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ═══════════════════════════════════════════════════════════
// Hono App
// ═══════════════════════════════════════════════════════════

/**
 * Create the MCP server Hono app.
 *
 * Endpoints:
 * - GET  /mcp/sse    — SSE connection endpoint
 * - POST /mcp/message — JSON-RPC message endpoint
 */
export function createMcpApp(): Hono {
  const app = new Hono();

  // Health check with component status
  app.get('/health', (c) => c.json(getHealth()));

  // SSE endpoint for MCP streaming transport
  app.get('/mcp/sse', sseEndpoint);

  // JSON-RPC message endpoint
  app.post('/mcp/message', async (c) => {
    const sessionId = c.req.query('sessionId');
    let body: unknown;

    try {
      body = await c.req.json();
    } catch {
      // SAFE: intentional graceful degradation — return a proper JSON-RPC
      // parse error (400) instead of crashing or leaking internal details
      return c.json(buildErrorResponse(null, JSONRPC_ERRORS.PARSE_ERROR), 400);
    }

    if (!isJsonRpcRequest(body)) {
      return c.json(buildErrorResponse(null, JSONRPC_ERRORS.INVALID_REQUEST), 400);
    }

    try {
      const response = await dispatchMethod(body);

      // If there's an active SSE session, send the response there too
      if (sessionId) {
        sendSSE(sessionId, JSON.stringify(response));
      }

      return c.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const code = (err as { code?: number }).code;
      const errorResponse = buildErrorResponse(body.id, {
        code: code ?? JSONRPC_ERRORS.INTERNAL_ERROR.code,
        message,
      });
      return c.json(errorResponse, 500);
    }
  });

  return app;
}
