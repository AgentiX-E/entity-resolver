// MCP (Model Context Protocol) tools for entity-resolver.
// Exposes ER capabilities as invocable tools for AI agents with real execution logic.

import {
  runPipeline,
  autoConfigure,
  loadAllBenchmarks,
  runBenchmark,
  gazetteerMatch,
  linkRecords,
  evaluateClustering,
} from '@agentix-e/entity-resolver-core';
import type { PipelineConfig, GazetteerConfig } from '@agentix-e/entity-resolver-core';
import type { Cluster, EntityId } from '@agentix-e/entity-resolver-core';

/** MCP tool definition. */
export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** All available MCP tools with metadata. */
export function getMcpTools(): McpTool[] {
  return [
    {
      name: 'er_dedupe',
      description:
        'Deduplicate records using entity resolver. Accepts an array of records and returns clusters of matching entities.',
      parameters: {
        type: 'object',
        properties: {
          records: { type: 'array', description: 'Array of record objects to deduplicate' },
          threshold: { type: 'number', description: 'Match threshold (0-1, default 0.5)' },
        },
        required: ['records'],
      },
    },
    {
      name: 'er_gazetteer',
      description:
        'Match query records against an indexed record base (Gazetteer matching). Returns ranked matches sorted by score.',
      parameters: {
        type: 'object',
        properties: {
          queryRecords: { type: 'array', description: 'Query records to match' },
          indexRecords: { type: 'array', description: 'Index records to match against' },
          threshold: { type: 'number', description: 'Match threshold (0-1, default 0.5)' },
        },
        required: ['queryRecords', 'indexRecords'],
      },
    },
    {
      name: 'er_link',
      description:
        'Link records across two datasets without a common key (Record Linkage). Returns cross-set matched pairs.',
      parameters: {
        type: 'object',
        properties: {
          left: { type: 'array', description: 'Left dataset records' },
          right: { type: 'array', description: 'Right dataset records' },
          threshold: { type: 'number', description: 'Match threshold (0-1, default 0.5)' },
        },
        required: ['left', 'right'],
      },
    },
    {
      name: 'er_autoconfigure',
      description: 'Auto-detect field semantics and generate optimal pipeline configuration.',
      parameters: {
        type: 'object',
        properties: {
          records: { type: 'array', description: 'Sample records for analysis' },
        },
        required: ['records'],
      },
    },
    {
      name: 'er_analyze',
      description: 'Analyze a dataset and return diagnostic information including field detection.',
      parameters: {
        type: 'object',
        properties: {
          records: { type: 'array', description: 'Records to analyze' },
        },
        required: ['records'],
      },
    },
    {
      name: 'er_benchmark',
      description: 'Run entity resolver benchmarks against standard datasets.',
      parameters: {
        type: 'object',
        properties: {
          dataset: {
            type: 'string',
            description: 'Dataset name (FEBRL 5000, DBLP-ACM, Abt-Buy, etc.)',
          },
        },
      },
    },
    {
      name: 'er_evaluate',
      description:
        'Evaluate clustering quality against ground truth. Returns all 12 metrics (pairwise, cluster, B-cubed, ARI, FMI, V-measure).',
      parameters: {
        type: 'object',
        properties: {
          predictedClusters: {
            type: 'object',
            description: 'Predicted clusters as { clusterId: [memberIds] }',
          },
          groundTruth: {
            type: 'object',
            description: 'Ground truth clusters as { clusterId: [memberIds] }',
          },
        },
        required: ['predictedClusters', 'groundTruth'],
      },
    },
  ];
}

// ─── Tool execution ──────────────────────────────────────────────

/** Execute a named MCP tool with the given parameters. */
export async function executeMcpTool(
  toolName: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case 'er_dedupe': {
      const records = params.records as Record<string, unknown>[];
      const auto = autoConfigure(records);
      const result = await runPipeline(records, auto.config as PipelineConfig);
      return {
        clusters: Object.fromEntries(result.clusters),
        singletons: result.singletons,
        statistics: result.statistics,
        scoredPairs: result.scoredPairs.length,
      };
    }

    case 'er_gazetteer': {
      const queryRecords = params.queryRecords as Record<string, unknown>[];
      const indexRecords = params.indexRecords as Record<string, unknown>[];
      const matchThreshold = (params.threshold as number) ?? 0.5;
      const auto = autoConfigure([...queryRecords, ...indexRecords]);
      const result = await gazetteerMatch(queryRecords, indexRecords, {
        comparisons: auto.config.comparisons,
        matchThreshold,
      } as GazetteerConfig);
      return {
        matches: result.queryToIndexMatches.map((p) => ({
          queryIndex: p.leftId,
          indexIndex: p.rightId - queryRecords.length,
          score: p.score,
        })),
        totalMatches: result.queryToIndexMatches.length,
      };
    }

    case 'er_link': {
      const left = params.left as Record<string, unknown>[];
      const right = params.right as Record<string, unknown>[];
      const threshold = (params.threshold as number) ?? 0.5;
      const auto = autoConfigure([...left, ...right]);
      const result = await linkRecords(left, right, {
        comparisons: auto.config.comparisons,
        matchThreshold: threshold,
      });
      return {
        crossPairs: result.crossPairs,
        totalPairs: result.crossPairs.length,
        statistics: result.statistics,
      };
    }

    case 'er_autoconfigure': {
      const records = params.records as Record<string, unknown>[];
      const auto = autoConfigure(records);
      return {
        config: auto.config,
        fields: auto.fields,
        confidence: auto.confidence,
        warnings: auto.warnings,
      };
    }

    case 'er_analyze': {
      const records = params.records as Record<string, unknown>[];
      const auto = autoConfigure(records);
      return {
        recordCount: records.length,
        fieldCount: records.length > 0 ? Object.keys(records[0]!).length : 0,
        detectedFields: auto.fields,
        recommendedConfig: auto.config,
        confidence: auto.confidence,
      };
    }

    case 'er_benchmark': {
      const datasetName = params.dataset as string | undefined;
      const datasets = loadAllBenchmarks();
      const ds = datasetName ? datasets.find((d) => d.name === datasetName) : datasets[0];
      if (!ds) return { error: `Dataset "${datasetName}" not found` };
      const result = await runBenchmark(ds);
      return result;
    }

    case 'er_evaluate': {
      const predictedClusters = params.predictedClusters as Record<string, number[]>;
      const groundTruth = params.groundTruth as Record<string, number[]>;

      const predMap = new Map<EntityId, Cluster>();
      for (const [cid, members] of Object.entries(predictedClusters)) {
        predMap.set(cid, { clusterId: cid, memberIds: members, cohesion: 0 });
      }
      const refMap = new Map<EntityId, Cluster>();
      for (const [cid, members] of Object.entries(groundTruth)) {
        refMap.set(cid, { clusterId: cid, memberIds: members, cohesion: 0 });
      }

      const metrics = evaluateClustering(predMap, refMap);
      return metrics;
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
