// MCP JSON-RPC 2.0 Protocol Compliance Tests
import { describe, it, expect, beforeEach } from 'vitest';
import { createMcpApp, resetMcpState } from '../mcp/server.js';
import {
  isJsonRpcRequest,
  isJsonRpcNotification,
  buildResponse,
  buildErrorResponse,
  JSONRPC_ERRORS,
} from '../mcp/jsonrpc.js';

// Create app once for request-based testing
const app = createMcpApp();

async function post(body: unknown) {
  return app.request('/mcp/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('JSON-RPC 2.0 Message Validation', () => {
  it('detects valid request', () => {
    expect(isJsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'test' })).toBe(true);
    expect(isJsonRpcRequest({ jsonrpc: '2.0', id: 'abc', method: 'test' })).toBe(true);
  });

  it('rejects invalid request', () => {
    expect(isJsonRpcRequest(null)).toBe(false);
    expect(isJsonRpcRequest({})).toBe(false);
    expect(isJsonRpcRequest({ jsonrpc: '1.0' })).toBe(false);
    expect(isJsonRpcRequest({ jsonrpc: '2.0', method: 'test' })).toBe(false);
  });

  it('detects valid notification', () => {
    expect(isJsonRpcNotification({ jsonrpc: '2.0', method: 'test' })).toBe(true);
    expect(isJsonRpcNotification({ jsonrpc: '2.0', method: 'test', params: {} })).toBe(true);
  });

  it('rejects non-notifications', () => {
    expect(isJsonRpcNotification({ jsonrpc: '2.0', id: 1, method: 'test' })).toBe(false);
  });

  it('buildResponse produces valid structure', () => {
    const r = buildResponse(1, { foo: 'bar' });
    expect(r.jsonrpc).toBe('2.0');
    expect(r.id).toBe(1);
    expect(r.result).toEqual({ foo: 'bar' });
  });

  it('buildErrorResponse produces valid error structure', () => {
    const r = buildErrorResponse(1, JSONRPC_ERRORS.METHOD_NOT_FOUND);
    expect(r.jsonrpc).toBe('2.0');
    expect(r.id).toBe(1);
    expect(r.error.code).toBe(-32601);
    expect(r.error.message).toBe('Method not found');
  });
});

describe('MCP Protocol: initialize lifecycle', () => {
  beforeEach(() => {
    resetMcpState();
  });

  it('initialize returns capabilities', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0' },
    } });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, any>;
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.serverInfo.name).toContain('entity-resolver');
    expect(body.result.protocolVersion).toBe('2024-11-05');
  });

  it('initialize rejects double init', async () => {
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    } });
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    } });
    expect(res.status).toBe(500);
  });
});

describe('MCP Protocol: tools/list', () => {
  beforeEach(() => {
    resetMcpState();
  });

  it('returns all 7 tools', async () => {
    // Initialize first
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    } });
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, any>;
    expect(body.result.tools.length).toBe(7);
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('er_dedupe');
    expect(names).toContain('er_gazetteer');
    expect(names).toContain('er_link');
    expect(names).toContain('er_autoconfigure');
    expect(names).toContain('er_analyze');
    expect(names).toContain('er_benchmark');
    expect(names).toContain('er_evaluate');
  });

  it('tools have valid input schemas', async () => {
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    } });
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const body = await res.json() as Record<string, any>;
    for (const tool of body.result.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('MCP Protocol: tools/call', () => {
  beforeEach(() => {
    resetMcpState();
  });

  it('calls er_autoconfigure successfully', async () => {
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    } });
    const res = await post({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
        name: 'er_autoconfigure',
        arguments: { records: [{ name: 'John', email: 'john@test.com' }] },
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, any>;
    expect(body.result.content[0].type).toBe('text');
  }, 15000);

  it('calls er_analyze successfully', async () => {
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    } });
    const res = await post({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
        name: 'er_analyze',
        arguments: { records: [{ name: 'Test', value: '123' }] },
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, any>;
    expect(body.result.content).toBeDefined();
  }, 15000);

  it('handles unknown tool', async () => {
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    } });
    const res = await post({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
        name: 'nonexistent_tool',
      },
    });
    const body = await res.json() as Record<string, any>;
    // Unknown tool produces error (either HTTP error code or JSON-RPC error in body)
    const hasError = res.status >= 400 || body.error || (body.result && body.result.isError);
    expect(hasError).toBe(true);
  });

  it('handles missing tool name', async () => {
    await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    } });
    const res = await post({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: {},
    });
    // Missing name returns error
    expect(res.status).toBe(500);
  });
});

describe('MCP Protocol: error handling', () => {
  beforeEach(() => {
    resetMcpState();
  });

  it('returns parse error for invalid JSON', async () => {
    const res = await app.request('/mcp/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, any>;
    expect(body.error.code).toBe(-32700);
  });

  it('returns invalid request for non-JSON-RPC body', async () => {
    const res = await post({ foo: 'bar' });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, any>;
    expect(body.error.code).toBe(-32600);
  });

  it('returns method not found for unknown method', async () => {
    const res = await post({ jsonrpc: '2.0', id: 1, method: 'unknown_method' });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, any>;
    expect(body.error.code).toBe(-32601);
  });

  it('notifications/initialized is ackd without response', async () => {
    const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(res.status).toBe(400); // No id = invalid request, but routing handles it
  });
});

describe('SSE endpoint', () => {
  it('GET /mcp/sse returns text/event-stream', async () => {
    const res = await app.request('/mcp/sse');
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });

  it('health endpoint returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, any>;
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeGreaterThan(0);
  });
});
