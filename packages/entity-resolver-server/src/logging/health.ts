// Enhanced health check — reports component status for production monitoring.

/** Status of an individual component. */
export interface ComponentStatus {
  readonly status: 'ok' | 'degraded' | 'unavailable';
  readonly message?: string;
}

/** Full health check response. */
export interface HealthCheckResult {
  readonly status: 'ok' | 'degraded' | 'unavailable';
  readonly uptime: number;
  readonly memory: NodeJS.MemoryUsage;
  readonly components: Record<string, ComponentStatus>;
  readonly timestamp: string;
}

/** Track component health dynamically. */
const componentStates = new Map<string, () => ComponentStatus>();

/** Register a component for health checking. */
export function registerHealthComponent(name: string, checker: () => ComponentStatus): void {
  componentStates.set(name, checker);
}

/** Collect and return the full health check result. */
export function getHealth(): HealthCheckResult {
  const components: Record<string, ComponentStatus> = {};
  let overall: HealthCheckResult['status'] = 'ok';

  for (const [name, checker] of componentStates) {
    const status = checker();
    components[name] = status;
    if (status.status === 'unavailable') {
      overall = 'unavailable';
    } else if (status.status === 'degraded' && overall !== 'unavailable') {
      overall = 'degraded';
    }
  }

  return {
    status: overall,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    components,
    timestamp: new Date().toISOString(),
  };
}
