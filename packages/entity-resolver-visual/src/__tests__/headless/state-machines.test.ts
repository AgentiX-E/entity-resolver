// Tests for Headless State Machines (Layer 2).

import { describe, it, expect } from 'vitest';
import { useWaterfall, useHistogram, useClusterExplorer, useMuChart } from '../../index.js';
import type {
  WaterfallChartData,
  HistogramData,
  MuChartData,
  ClusterExplorerData,
} from '../../index.js';

const mockWaterfall: WaterfallChartData = {
  recordPair: { idA: 0, idB: 1 },
  priorWeight: -6.67,
  bars: [
    {
      label: 'name:exact_match',
      weight: 4.74,
      cumulative: 4.74,
      valueA: 'name',
      valueB: 'name',
      comparisonLevel: 'exact_match',
    },
    {
      label: 'surname:strong_match',
      weight: 3.5,
      cumulative: 8.24,
      valueA: 'surname',
      valueB: 'surname',
      comparisonLevel: 'strong_match',
    },
  ],
  totalWeight: 8.24,
  matchProbability: 0.95,
};

const mockHistogram: HistogramData = {
  bins: [
    { minWeight: -10, maxWeight: -5, count: 1 },
    { minWeight: -5, maxWeight: 0, count: 3 },
    { minWeight: 0, maxWeight: 5, count: 2 },
  ],
  threshold: 0,
  summary: { totalPairs: 6, aboveThreshold: 2, belowThreshold: 4 },
};

const mockMuChart: MuChartData = {
  fields: [
    {
      field: 'name',
      levels: [{ label: 'exact_match', mProbability: 0.95, uProbability: 0.05, weight: 4.25 }],
    },
  ],
  lambda: 0.001,
};

const mockCluster: ClusterExplorerData = {
  tree: {
    id: 'root',
    label: 'All',
    size: 5,
    cohesion: 0,
    children: [
      {
        id: 'c0',
        label: 'Cluster 0',
        size: 3,
        cohesion: 0.8,
        children: [
          { id: 'c0_0', label: 'R0', size: 1, cohesion: 1, children: [] },
          { id: 'c0_1', label: 'R1', size: 1, cohesion: 1, children: [] },
        ],
      },
    ],
  },
  totalClusters: 1,
  totalRecords: 5,
  singletonCount: 2,
};

describe('useWaterfall', () => {
  it('initializes with null data', () => {
    const { state } = useWaterfall();
    expect(state.data).toBeNull();
    expect(state.hoveredBar).toBeNull();
    expect(state.selectedPair).toBe(0);
  });

  it('loads data', () => {
    const { state, actions } = useWaterfall();
    actions.loadData(mockWaterfall);
    expect(state.data).toEqual(mockWaterfall);
  });

  it('hover and unhover bars', () => {
    const { state, actions } = useWaterfall();
    actions.loadData(mockWaterfall);
    actions.hover(0);
    expect(state.hoveredBar).toBe(0);
    actions.unhover();
    expect(state.hoveredBar).toBeNull();
  });

  it('selects pair', () => {
    const { state, actions } = useWaterfall();
    actions.selectPair(5);
    expect(state.selectedPair).toBe(5);
  });
});

describe('useHistogram', () => {
  it('initializes with defaults', () => {
    const { state } = useHistogram();
    expect(state.data).toBeNull();
    expect(state.hoveredBin).toBeNull();
    expect(state.threshold).toBe(0);
  });

  it('loads data and sets threshold', () => {
    const { state, actions } = useHistogram();
    actions.loadData(mockHistogram);
    expect(state.data).toEqual(mockHistogram);
    expect(state.threshold).toBe(0);
  });

  it('loads data with undefined threshold defaults to 0', () => {
    const { state, actions } = useHistogram();
    const dataWithoutThreshold: HistogramData = {
      bins: [{ minWeight: -1, maxWeight: 1, count: 1 }],
      summary: { totalPairs: 1, aboveThreshold: 1, belowThreshold: 0 },
    };
    actions.loadData(dataWithoutThreshold);
    expect(state.threshold).toBe(0);
  });

  it('sets threshold manually', () => {
    const { state, actions } = useHistogram();
    actions.setThreshold(5);
    expect(state.threshold).toBe(5);
  });

  it('hover and unhover bins', () => {
    const { state, actions } = useHistogram();
    actions.loadData(mockHistogram);
    actions.hover(1);
    expect(state.hoveredBin).toBe(1);
    actions.unhover();
    expect(state.hoveredBin).toBeNull();
  });
});

describe('useClusterExplorer', () => {
  it('initializes with root expanded', () => {
    const { state } = useClusterExplorer();
    expect(state.data).toBeNull();
    expect(state.expandedNodes.has('root')).toBe(true);
    expect(state.selectedNode).toBeNull();
  });

  it('loads data', () => {
    const { state, actions } = useClusterExplorer();
    actions.loadData(mockCluster);
    expect(state.data).toEqual(mockCluster);
  });

  it('toggles node expansion', () => {
    const { state, actions } = useClusterExplorer();
    actions.loadData(mockCluster);
    actions.toggleNode('c0');
    expect(state.expandedNodes.has('c0')).toBe(true);
    actions.toggleNode('c0');
    expect(state.expandedNodes.has('c0')).toBe(false);
  });

  it('selects node', () => {
    const { state, actions } = useClusterExplorer();
    actions.selectNode('c0');
    expect(state.selectedNode).toBe('c0');
  });

  it('expands all and collapses all', () => {
    const { state, actions } = useClusterExplorer();
    actions.loadData(mockCluster);
    actions.expandAll();
    expect(state.expandedNodes.size).toBeGreaterThan(1);
    actions.collapseAll();
    expect(state.expandedNodes.size).toBe(1);
    expect(state.expandedNodes.has('root')).toBe(true);
  });

  it('expandAll without data handles gracefully', () => {
    const { state, actions } = useClusterExplorer();
    // expandAll before loadData should not throw
    actions.expandAll();
    expect(state.expandedNodes.size).toBeGreaterThanOrEqual(1);
    expect(state.expandedNodes.has('root')).toBe(true);
  });
});

describe('useMuChart', () => {
  it('initializes with defaults', () => {
    const { state } = useMuChart();
    expect(state.data).toBeNull();
    expect(state.selectedField).toBeNull();
    expect(state.viewMode).toBe('grouped');
  });

  it('loads data', () => {
    const { state, actions } = useMuChart();
    actions.loadData(mockMuChart);
    expect(state.data).toEqual(mockMuChart);
  });

  it('selects field', () => {
    const { state, actions } = useMuChart();
    actions.loadData(mockMuChart);
    actions.selectField(0);
    expect(state.selectedField).toBe(0);
  });

  it('switches view mode', () => {
    const { state, actions } = useMuChart();
    actions.setViewMode('stacked');
    expect(state.viewMode).toBe('stacked');
  });
});
