// Tests for CLI TUI diagnostic renderers.

import { describe, it, expect } from 'vitest';
import {
  renderWaterfallTUI,
  renderHistogramTUI,
  renderMuTableTUI,
  renderClusterTreeTUI,
  renderThresholdTUI,
  renderNavHint,
} from '../../index.js';
import type {
  WaterfallChartData,
  HistogramData,
  MuChartData,
  ClusterExplorerData,
} from '@agentix-e/entity-resolver-visual';

const mockWaterfall: WaterfallChartData = {
  recordPair: { idA: 0, idB: 1 },
  priorWeight: -6.67,
  bars: [
    {
      label: 'name:exact_match',
      weight: 4.74,
      cumulative: 4.74,
      valueA: 'n',
      valueB: 'n',
      comparisonLevel: 'exact_match',
    },
    {
      label: 'surname:strong_match',
      weight: -1.97,
      cumulative: 2.77,
      valueA: 's',
      valueB: 's',
      comparisonLevel: 'strong_match',
    },
    {
      label: 'dob:moderate_match',
      weight: 3.5,
      cumulative: 6.27,
      valueA: 'd',
      valueB: 'd',
      comparisonLevel: 'moderate_match',
    },
  ],
  totalWeight: 6.27,
  matchProbability: 0.95,
};

const mockHistogram: HistogramData = {
  bins: [
    { minWeight: -10, maxWeight: -5, count: 2 },
    { minWeight: -5, maxWeight: 0, count: 8 },
    { minWeight: 0, maxWeight: 5, count: 5 },
    { minWeight: 5, maxWeight: 10, count: 1 },
  ],
  threshold: 0,
  summary: { totalPairs: 16, aboveThreshold: 6, belowThreshold: 10 },
};

const mockMuChart: MuChartData = {
  fields: [
    {
      field: 'name',
      levels: [
        { label: 'exact_match', mProbability: 0.95, uProbability: 0.05, weight: 4.25 },
        { label: 'not_match', mProbability: 0.05, uProbability: 0.6, weight: -3.58 },
      ],
    },
    {
      field: 'dob',
      levels: [{ label: 'exact_match', mProbability: 0.9, uProbability: 0.02, weight: 5.49 }],
    },
  ],
  lambda: 0.001,
};

const mockCluster: ClusterExplorerData = {
  tree: {
    id: 'root',
    label: 'All',
    size: 10,
    cohesion: 0,
    children: [
      {
        id: 'c0',
        label: 'Cluster 0',
        size: 3,
        cohesion: 0.8,
        children: [
          { id: 'c0_0', label: 'Rec 0', size: 1, cohesion: 1, children: [] },
          { id: 'c0_1', label: 'Rec 1', size: 1, cohesion: 1, children: [] },
        ],
      },
      {
        id: 'c1',
        label: 'Cluster 1',
        size: 2,
        cohesion: 0.9,
        children: [{ id: 'c1_0', label: 'Rec 2', size: 1, cohesion: 1, children: [] }],
      },
    ],
  },
  totalClusters: 2,
  totalRecords: 10,
  singletonCount: 5,
};

describe('renderWaterfallTUI', () => {
  it('renders waterfall chart', () => {
    const output = renderWaterfallTUI(mockWaterfall);
    expect(output).toContain('Waterfall');
    expect(output).toContain('#0');
    expect(output).toContain('#1');
  });

  it('includes bar labels', () => {
    const output = renderWaterfallTUI(mockWaterfall);
    expect(output).toContain('name:exact_match');
    expect(output).toContain('surname:strong_match');
  });

  it('includes total weight and probability', () => {
    const output = renderWaterfallTUI(mockWaterfall);
    expect(output).toContain('6.27');
    expect(output).toContain('95.0%');
  });

  it('renders with custom width', () => {
    const output = renderWaterfallTUI(mockWaterfall, 40);
    const lines = output.split('\n');
    for (const line of lines) {
      const visible = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
      expect(visible.length).toBeLessThanOrEqual(45);
    }
  });
});

describe('renderHistogramTUI', () => {
  it('renders histogram', () => {
    const output = renderHistogramTUI(mockHistogram);
    expect(output).toContain('Distribution');
    expect(output).toContain('pairs');
  });

  it('includes above/below threshold', () => {
    const output = renderHistogramTUI(mockHistogram);
    expect(output).toContain('Above');
    expect(output).toContain('Below');
  });

  it('renders with custom width', () => {
    const output = renderHistogramTUI(mockHistogram, 40);
    expect(output.length).toBeGreaterThan(0);
  });
});

describe('renderMuTableTUI', () => {
  it('renders m/u parameter table', () => {
    const output = renderMuTableTUI(mockMuChart);
    expect(output).toContain('Parameters');
    expect(output).toContain('name');
    expect(output).toContain('dob');
    expect(output).toContain('exact_match');
  });

  it('includes lambda', () => {
    const output = renderMuTableTUI(mockMuChart);
    expect(output).toContain('1.00e-3');
  });

  it('renders weighted values', () => {
    const output = renderMuTableTUI(mockMuChart);
    expect(output).toContain('4.25');
    expect(output).toContain('-3.58');
  });
});

describe('renderClusterTreeTUI', () => {
  it('renders cluster tree', () => {
    const output = renderClusterTreeTUI(mockCluster);
    expect(output).toContain('Explorer');
    expect(output).toContain('2 clusters');
    expect(output).toContain('Cluster 0');
    expect(output).toContain('Cluster 1');
  });

  it('shows child records', () => {
    const output = renderClusterTreeTUI(mockCluster);
    expect(output).toContain('Rec 0');
    expect(output).toContain('Rec 1');
  });

  it('renders with custom width', () => {
    const output = renderClusterTreeTUI(mockCluster, 40);
    expect(output).toContain('Explorer');
  });
});

describe('renderThresholdTUI', () => {
  it('renders threshold selection', () => {
    const output = renderThresholdTUI(0.7, 1000, 300);
    expect(output).toContain('Threshold');
    expect(output).toContain('0.70');
    expect(output).toContain('30.0%');
  });

  it('shows above and below counts', () => {
    const output = renderThresholdTUI(0.5, 100, 75);
    expect(output).toContain('75');
    expect(output).toContain('25');
  });

  it('renders with custom width', () => {
    const output = renderThresholdTUI(0.3, 50, 20, 40);
    expect(output).toContain('Threshold');
  });
});

describe('renderNavHint', () => {
  it('renders navigation hint', () => {
    const output = renderNavHint();
    expect(output).toContain('Navigate');
    expect(output).toContain('Quit');
    expect(output).toContain('h');
    expect(output).toContain('q');
  });
});
