// @agentix-e/entity-resolution-visual
// Framework-agnostic, embeddable diagnostic visualization components.

// Layer 1: Data API — pure JSON output
export type {
  WaterfallBar,
  WaterfallChartData,
  HistogramBin,
  HistogramData,
  MuFieldData,
  MuLevelData,
  MuChartData,
  ClusterTreeNode,
  ClusterExplorerData,
  RecordSummary,
  EvaluationAxis,
  EvaluationRadarData,
  UnlinkablesData,
} from './data/api.js';

export {
  buildWaterfallData,
  buildHistogramData,
  buildMuChartData,
  buildClusterData,
  buildEvaluationData,
  buildUnlinkablesData,
} from './data/api.js';
