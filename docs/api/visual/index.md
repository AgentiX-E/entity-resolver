# @agentix-e/entity-resolver-visual

**Framework-agnostic, embeddable diagnostic components.**

The visual package provides a 3-layer architecture for entity resolver visualization and diagnostics:

1. **Data API** — Framework-agnostic data layer
2. **Headless** — Logic layer with state machines
3. **Web Components** — Reusable UI components

## Installation

```bash
npm install @agentix-e/entity-resolver-visual
```

## Quick Example

```typescript
import { createWaterfallChart, createHistogram } from '@agentix-e/entity-resolver-visual';

const chart = createWaterfallChart(diagnostics.matchWeightBins);
document.body.appendChild(chart);
```

## Complete API Reference

→ [Full auto-generated API reference](/api/visual/reference)
