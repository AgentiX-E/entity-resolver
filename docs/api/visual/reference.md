# @agentix-e/entity-resolver-visual

**Framework-agnostic diagnostic visualization** for entity-resolver. Progressive 4-layer architecture.

## Architecture

| Layer | Type | Usage |
|-------|------|-------|
| **Layer 1** | Data API | `buildWaterfallData()` → JSON output |
| **Layer 2** | Headless | `useWaterfall()` → state machines |
| **Layer 3** | Web Components | `<er-waterfall>` → custom elements |
| **Layer 4** | Dashboard | `<er-dashboard>` → single-element panel |

## Components

- `<er-waterfall>` — Match weight waterfall chart
- `<er-histogram>` — Match weight distribution
- `<er-mu-chart>` — m/u parameters
- `<er-cluster-explorer>` — Cluster tree with expand/select
- `<er-evaluation-radar>` — Accuracy metrics radar
- `<er-comparison-viewer>` — Pair detail table (color-coded)
- `<er-dashboard>` — Full diagnostic panel (all 6 in one)

## Theming

20 CSS Custom Properties. No framework lock-in.

```css
er-dashboard {
  --er-color-primary: #1a73e8;
  --er-font-family: 'Inter', sans-serif;
}
```

## Export

```typescript
import { exportDashboardHTML } from '@agentix-e/entity-resolver-visual';
const html = exportDashboardHTML(result, records);
// Self-contained HTML file — open in any browser
```

## License

MIT © Lambertyan
