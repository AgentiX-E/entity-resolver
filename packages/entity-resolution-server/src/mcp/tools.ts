// MCP (Model Context Protocol) tools for entity-resolution.
// Exposes ER capabilities as invocable tools for AI agents.

/** MCP tool definition. */
export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** All available MCP tools. */
export function getMcpTools(): McpTool[] {
  return [
    {
      name: 'er_dedupe',
      description:
        'Deduplicate records using entity resolution. Accepts an array of records and returns clusters.',
      parameters: {
        records: { type: 'array', description: 'Array of record objects to deduplicate' },
      },
    },
    {
      name: 'er_match',
      description: 'Match records across two datasets. Accepts left and right arrays.',
      parameters: { left: { type: 'array' }, right: { type: 'array' } },
    },
    {
      name: 'er_autoconfigure',
      description: 'Auto-detect field semantics and generate optimal pipeline configuration.',
      parameters: { records: { type: 'array', description: 'Sample records for analysis' } },
    },
    {
      name: 'er_analyze',
      description:
        'Analyze a dataset and return diagnostic information including field detection and blocking recommendations.',
      parameters: { records: { type: 'array' } },
    },
    {
      name: 'er_benchmark',
      description: 'Run entity resolution benchmarks against standard datasets.',
      parameters: {
        dataset: { type: 'string', description: 'Dataset name (FEBRL 5000, DBLP-ACM, etc.)' },
      },
    },
    {
      name: 'er_evaluate',
      description: 'Evaluate clustering quality against ground truth. Returns all 12 metrics.',
      parameters: { clusters: { type: 'object' }, groundTruth: { type: 'object' } },
    },
  ] satisfies McpTool[];
}
