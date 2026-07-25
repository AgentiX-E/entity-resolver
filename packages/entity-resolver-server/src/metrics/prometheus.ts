// Prometheus metrics for entity-resolver-server.
// Exposes Prometheus text-format metrics at /metrics endpoint.
// Zero external dependencies — pure Node.js implementation of
// Prometheus exposition format for counters and histograms.
//
// Metrics exposed:
//   er_requests_total{method,route,status}
//   er_request_duration_seconds{method,route}
//   er_pipeline_duration_seconds
//   er_pipeline_records_total
//   er_pipeline_clusters_total
//   process_* (Node.js defaults)

import type { Context, Next } from 'hono';

// ══════════════════════════════════════════════════════════════
// Metric types
// ══════════════════════════════════════════════════════════════

interface MetricLabel {
  readonly [key: string]: string;
}

/** A Prometheus counter — monotonically increasing value. */
class Counter {
  readonly name: string;
  readonly help: string;
  readonly labelNames: readonly string[];
  private values = new Map<string, number>();

  constructor(name: string, help: string, labelNames: readonly string[] = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  inc(labels: MetricLabel = {}, value: number = 1): void {
    const key = this.labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  /** Export Prometheus text format lines. */
  export(): string {
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [labels, value] of this.values) {
      if (labels) {
        lines.push(`${this.name}${labels} ${value}`);
      } else {
        lines.push(`${this.name} ${value}`);
      }
    }
    return lines.join('\n');
  }

  private labelKey(labels: MetricLabel): string {
    if (this.labelNames.length === 0) return '';
    const parts = this.labelNames.map((n) => `${n}="${labels[n] ?? ''}"`);
    return `{${parts.join(',')}}`;
  }
}

/** A Prometheus histogram — bucket-based distribution. */
class Histogram {
  readonly name: string;
  readonly help: string;
  readonly labelNames: readonly string[];
  readonly buckets: readonly number[];
  private bucketCounts = new Map<string, Map<number, number>>();
  private sums = new Map<string, number>();
  private counts = new Map<string, number>();

  constructor(
    name: string,
    help: string,
    labelNames: readonly string[] = [],
    buckets: readonly number[] = [
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300,
    ],
  ) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = buckets;
  }

  observe(value: number, labels: MetricLabel = {}): void {
    const key = this.labelKey(labels);
    // Update sum and count
    this.sums.set(key, (this.sums.get(key) ?? 0) + value);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);

    // Update buckets
    let bucketMap = this.bucketCounts.get(key);
    if (!bucketMap) {
      bucketMap = new Map<number, number>();
      this.bucketCounts.set(key, bucketMap);
    }
    for (const b of this.buckets) {
      if (value <= b) {
        bucketMap.set(b, (bucketMap.get(b) ?? 0) + 1);
      }
    }
  }

  export(): string {
    const lines: string[] = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const key of this.bucketCounts.keys()) {
      const bucketMap = this.bucketCounts.get(key)!;
      const sum = this.sums.get(key)!;
      const count = this.counts.get(key)!;
      let cumulative = 0;

      for (const b of this.buckets) {
        cumulative += bucketMap.get(b) ?? 0;
        lines.push(`${this.name}_bucket${key}{le="${b}"} ${cumulative}`);
      }
      lines.push(`${this.name}_bucket${key}{le="+Inf"} ${count}`);
      lines.push(`${this.name}_sum${key} ${sum}`);
      lines.push(`${this.name}_count${key} ${count}`);
    }
    return lines.join('\n');
  }

  private labelKey(labels: MetricLabel): string {
    if (this.labelNames.length === 0) return '';
    const parts = this.labelNames.map((n) => `${n}="${labels[n] ?? ''}"`);
    return `{${parts.join(',')}}`;
  }
}

// ══════════════════════════════════════════════════════════════
// Registry
// ══════════════════════════════════════════════════════════════

/** Collects and exports all registered metrics. */
class MetricsRegistry {
  private metrics: Array<Counter | Histogram> = [];

  register(metric: Counter | Histogram): void {
    this.metrics.push(metric);
  }

  /** Export all metrics in Prometheus text format. */
  exportAll(): string {
    const lines = this.metrics.map((m) => m.export());
    // Node.js process metrics
    lines.push(this.processMetrics());
    return lines.filter((l) => l.length > 0).join('\n\n') + '\n';
  }

  private processMetrics(): string {
    const mem = process.memoryUsage();
    const heapUsed = Math.round(mem.heapUsed);
    const heapTotal = Math.round(mem.heapTotal);
    const rss = Math.round(mem.rss);
    const cpu = process.cpuUsage();
    return [
      '# HELP process_heap_bytes Node.js heap usage',
      '# TYPE process_heap_bytes gauge',
      `process_heap_bytes{type="used"} ${heapUsed}`,
      `process_heap_bytes{type="total"} ${heapTotal}`,
      '# HELP process_resident_memory_bytes Node.js RSS',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${rss}`,
      '# HELP process_cpu_seconds_total Node.js CPU time',
      '# TYPE process_cpu_seconds_total counter',
      `process_cpu_seconds_total{type="user"} ${(cpu.user / 1e6).toFixed(3)}`,
      `process_cpu_seconds_total{type="system"} ${(cpu.system / 1e6).toFixed(3)}`,
      '# HELP process_uptime_seconds Node.js process uptime',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${process.uptime().toFixed(1)}`,
    ].join('\n');
  }
}

// ══════════════════════════════════════════════════════════════
// Singleton metrics
// ══════════════════════════════════════════════════════════════

const registry = new MetricsRegistry();

/** Request counter: er_requests_total{method, route, status} */
export const requestCounter = new Counter('er_requests_total', 'Total number of HTTP requests', [
  'method',
  'route',
  'status',
]);

/** Request duration: er_request_duration_seconds{method, route} */
export const requestDuration = new Histogram(
  'er_request_duration_seconds',
  'HTTP request duration in seconds',
  ['method', 'route'],
);

/** Pipeline duration: er_pipeline_duration_seconds */
export const pipelineDuration = new Histogram(
  'er_pipeline_duration_seconds',
  'Entity resolver pipeline duration in seconds',
  [],
);

/** Pipeline records processed: er_pipeline_records_total */
export const pipelineRecordsTotal = new Counter(
  'er_pipeline_records_total',
  'Total number of records processed through pipeline',
);

/** Pipeline clusters generated: er_pipeline_clusters_total */
export const pipelineClustersTotal = new Counter(
  'er_pipeline_clusters_total',
  'Total number of clusters generated',
);

registry.register(requestCounter);
registry.register(requestDuration);
registry.register(pipelineDuration);
registry.register(pipelineRecordsTotal);
registry.register(pipelineClustersTotal);

// ══════════════════════════════════════════════════════════════
// Middleware
// ══════════════════════════════════════════════════════════════

/**
 * Hono middleware: track request count and duration for every route.
 */
export function metricsMiddleware(): (c: Context, next: Next) => Promise<void> {
  return async (c: Context, next: Next) => {
    const start = performance.now();
    await next();
    const duration = (performance.now() - start) / 1000;
    const route = c.req.routePath || c.req.path || 'unknown';
    const status = String(c.res.status || 200);
    requestCounter.inc({ method: c.req.method, route, status });
    requestDuration.observe(duration, { method: c.req.method, route });
  };
}

/**
 * GET /metrics endpoint — returns all metrics in Prometheus text format.
 */
export function metricsEndpoint(c: Context): Response {
  return c.text(registry.exportAll(), 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
}

/**
 * Record a pipeline completion for metrics.
 */
export function recordPipeline(
  recordCount: number,
  clusterCount: number,
  durationMs: number,
): void {
  pipelineDuration.observe(durationMs / 1000);
  pipelineRecordsTotal.inc({}, recordCount);
  pipelineClustersTotal.inc({}, clusterCount);
}
