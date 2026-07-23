// @agentix-e/entity-resolver-visual
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

// Layer 2: Headless Components
export type {
  WaterfallState,
  WaterfallActions,
  HistogramState,
  HistogramActions,
  ClusterExplorerState,
  ClusterExplorerActions,
  MuChartState,
  MuChartActions,
} from './headless/state-machines.js';

export {
  useWaterfall,
  useHistogram,
  useClusterExplorer,
  useMuChart,
} from './headless/state-machines.js';

// Layer 3: Web Components
export {
  DEFAULT_THEME,
  THEME_VARIABLE_COUNT,
  ErBaseElement,
  ErWaterfallElement,
  ErHistogramElement,
  ErClusterExplorerElement,
  ErMuChartElement,
  registerAllElements,
} from './components/web/elements.js';
