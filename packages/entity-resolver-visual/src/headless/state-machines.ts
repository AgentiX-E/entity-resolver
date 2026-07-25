// Layer 2: Headless Components — renderless state machines.
// Manage state and interactions without any DOM manipulation.
// Users provide their own rendering (React, Vue, Svelte, vanilla JS, Canvas, etc.)
//
// Pattern: mutable private state, readonly public interface.
// State objects are stable references — mutations are immediately visible.
// TypeScript enforces readonly access externally.

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
      mutate(state).hoveredBar = barIndex;
    },
    unhover() {
      mutate(state).hoveredBar = null;
    },
    selectPair(pairIndex: number) {
      mutate(state).selectedPair = pairIndex;
    },
    loadData(data: WaterfallChartData) {
      mutate(state).data = data;
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
      mutate(state).hoveredBin = binIndex;
    },
    unhover() {
      mutate(state).hoveredBin = null;
    },
    setThreshold(t: number) {
      mutate(state).threshold = t;
    },
    loadData(data: HistogramData) {
      mutate(state).data = data;
      mutate(state).threshold = data.threshold ?? 0;
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

function collectAllIds(root: ClusterExplorerData | null): Set<string> {
  const ids = new Set<string>(['root']);
  if (!root) return ids;
  const walk = (node: typeof root.tree) => {
    ids.add(node.id);
    for (const child of node.children) walk(child);
  };
  walk(root.tree);
  return ids;
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
      mutate(state).expandedNodes = expanded;
    },
    selectNode(nodeId: string) {
      mutate(state).selectedNode = nodeId;
    },
    loadData(data: ClusterExplorerData) {
      mutate(state).data = data;
    },
    expandAll() {
      mutate(state).expandedNodes = collectAllIds(state.data);
    },
    collapseAll() {
      mutate(state).expandedNodes = new Set(['root']);
    },
  };

  return { state, actions };
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
      mutate(state).selectedField = fieldIndex;
    },
    setViewMode(mode: 'grouped' | 'stacked') {
      mutate(state).viewMode = mode;
    },
    loadData(data: MuChartData) {
      mutate(state).data = data;
    },
  };

  return { state, actions };
}

// ══════════════════════════════════════════════════════════════
// Internal utility: cast readonly to mutable within the module
// ══════════════════════════════════════════════════════════════

/**
 * Remove `readonly` from all properties — mutability escape hatch for
 * headless state machine actions. This is the ONLY place where readonly
 * stripping occurs; it's encapsulated within this module and never exported.
 */
type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/** Strip readonly from an object. Only for internal use within state machines. */
function mutate<T extends object>(obj: T): Mutable<T> {
  return obj;
}
