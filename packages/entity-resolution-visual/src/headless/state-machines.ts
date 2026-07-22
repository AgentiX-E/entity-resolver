// Layer 2: Headless Components — renderless state machines.
// Manage state and interactions without any DOM manipulation.
// Users provide their own rendering (React, Vue, Svelte, vanilla JS, Canvas, etc.)

import type {
  WaterfallChartData,
  HistogramData,
  MuChartData,
  ClusterExplorerData,
} from '../data/api.js';

// ══════════════════════════════════════════════════════════════
// Waterfall State Machine
// ══════════════════════════════════════════════════════════════

export interface WaterfallState {
  readonly data: WaterfallChartData | null;
  readonly hoveredBar: number | null;
  readonly selectedPair: number;
}

export interface WaterfallActions {
  hover(barIndex: number): void;
  unhover(): void;
  selectPair(pairIndex: number): void;
  loadData(data: WaterfallChartData): void;
}

export function useWaterfall(): { state: WaterfallState; actions: WaterfallActions } {
  const state: WaterfallState = {
    data: null,
    hoveredBar: null,
    selectedPair: 0,
  };

  const actions: WaterfallActions = {
    hover(barIndex: number) {
      (state as any).hoveredBar = barIndex;
    },
    unhover() {
      (state as any).hoveredBar = null;
    },
    selectPair(pairIndex: number) {
      (state as any).selectedPair = pairIndex;
    },
    loadData(data: WaterfallChartData) {
      (state as any).data = data;
    },
  };

  return { state, actions };
}

// ══════════════════════════════════════════════════════════════
// Histogram State Machine
// ══════════════════════════════════════════════════════════════

export interface HistogramState {
  readonly data: HistogramData | null;
  readonly hoveredBin: number | null;
  readonly threshold: number;
}

export interface HistogramActions {
  hover(binIndex: number): void;
  unhover(): void;
  setThreshold(t: number): void;
  loadData(data: HistogramData): void;
}

export function useHistogram(): { state: HistogramState; actions: HistogramActions } {
  const state: HistogramState = {
    data: null,
    hoveredBin: null,
    threshold: 0,
  };

  const actions: HistogramActions = {
    hover(binIndex: number) {
      (state as any).hoveredBin = binIndex;
    },
    unhover() {
      (state as any).hoveredBin = null;
    },
    setThreshold(t: number) {
      (state as any).threshold = t;
    },
    loadData(data: HistogramData) {
      (state as any).data = data;
      (state as any).threshold = data.threshold ?? 0;
    },
  };

  return { state, actions };
}

// ══════════════════════════════════════════════════════════════
// Cluster Explorer State Machine
// ══════════════════════════════════════════════════════════════

export interface ClusterExplorerState {
  readonly data: ClusterExplorerData | null;
  readonly expandedNodes: ReadonlySet<string>;
  readonly selectedNode: string | null;
}

export interface ClusterExplorerActions {
  toggleNode(nodeId: string): void;
  selectNode(nodeId: string): void;
  loadData(data: ClusterExplorerData): void;
  expandAll(): void;
  collapseAll(): void;
}

export function useClusterExplorer(): {
  state: ClusterExplorerState;
  actions: ClusterExplorerActions;
} {
  const state: ClusterExplorerState = {
    data: null,
    expandedNodes: new Set(['root']),
    selectedNode: null,
  };

  const actions: ClusterExplorerActions = {
    toggleNode(nodeId: string) {
      const expanded = new Set(state.expandedNodes);
      if (expanded.has(nodeId)) {
        expanded.delete(nodeId);
      } else {
        expanded.add(nodeId);
      }
      (state as any).expandedNodes = expanded;
    },
    selectNode(nodeId: string) {
      (state as any).selectedNode = nodeId;
    },
    loadData(data: ClusterExplorerData) {
      (state as any).data = data;
    },
    expandAll() {
      const allIds = collectAllIds(state.data);
      (state as any).expandedNodes = allIds;
    },
    collapseAll() {
      (state as any).expandedNodes = new Set(['root']);
    },
  };

  return { state, actions };
}

function collectAllIds(data: ClusterExplorerData | null): Set<string> {
  const ids = new Set<string>(['root']);
  if (!data) return ids;
  const walk = (node: typeof data.tree) => {
    ids.add(node.id);
    for (const child of node.children) walk(child);
  };
  walk(data.tree);
  return ids;
}

// ══════════════════════════════════════════════════════════════
// m/u Chart State Machine
// ══════════════════════════════════════════════════════════════

export interface MuChartState {
  readonly data: MuChartData | null;
  readonly selectedField: number | null;
  readonly viewMode: 'grouped' | 'stacked';
}

export interface MuChartActions {
  selectField(fieldIndex: number): void;
  setViewMode(mode: 'grouped' | 'stacked'): void;
  loadData(data: MuChartData): void;
}

export function useMuChart(): { state: MuChartState; actions: MuChartActions } {
  const state: MuChartState = {
    data: null,
    selectedField: null,
    viewMode: 'grouped',
  };

  const actions: MuChartActions = {
    selectField(fieldIndex: number) {
      (state as any).selectedField = fieldIndex;
    },
    setViewMode(mode: 'grouped' | 'stacked') {
      (state as any).viewMode = mode;
    },
    loadData(data: MuChartData) {
      (state as any).data = data;
    },
  };

  return { state, actions };
}
