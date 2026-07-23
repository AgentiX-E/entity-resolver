// MCP tools execution edge cases — covers tool dispatch paths.
import { describe, it, expect } from 'vitest';
import * as mcp from '../mcp/tools.js';

describe('MCP tools execution', () => {
  it('executes er_analyze tool', async () => {
    const result = await mcp.executeMcpTool('er_analyze', {
      records: [{ name: 'Test', value: '123' }],
    });
    expect(result).toBeDefined();
  });

  it('executes er_dedupe tool', async () => {
    const result = await mcp.executeMcpTool('er_dedupe', {
      records: [{ name: 'John Smith' }, { name: 'Jon Smyth' }, { name: 'Jane Doe' }],
    });
    expect(result).toBeDefined();
  }, 15000);

  it('executes er_autoconfigure tool', async () => {
    const result = await mcp.executeMcpTool('er_autoconfigure', {
      records: [{ name: 'Test', email: 'a@b.com' }],
    });
    expect(result).toBeDefined();
  }, 15000);

  it('executes er_gazetteer tool', async () => {
    const result = await mcp.executeMcpTool('er_gazetteer', {
      queryRecords: [{ name: 'John Smith' }],
      indexRecords: [{ name: 'John Smith' }, { name: 'Jane Doe' }],
    });
    expect(result).toBeDefined();
  }, 15000);

  it('executes er_link tool', async () => {
    const result = await mcp.executeMcpTool('er_link', {
      leftRecords: [{ name: 'A' }],
      rightRecords: [{ name: 'A' }, { name: 'B' }],
    });
    expect(result).toBeDefined();
  }, 15000);

  it('returns error for unknown tool', async () => {
    await expect(mcp.executeMcpTool('unknown_tool', {})).rejects.toThrow();
  });

  it('tool list contains all 7 tools', () => {
    const tools = mcp.getMcpTools();
    expect(tools.length).toBe(7);
    const names = tools.map((t) => t.name);
    expect(names).toContain('er_dedupe');
    expect(names).toContain('er_gazetteer');
    expect(names).toContain('er_link');
    expect(names).toContain('er_autoconfigure');
    expect(names).toContain('er_analyze');
    expect(names).toContain('er_benchmark');
    expect(names).toContain('er_evaluate');
  });
});
