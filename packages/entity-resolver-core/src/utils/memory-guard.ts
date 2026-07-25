/**
 * Memory guard utility for large dataset processing.
 *
 * Monitors heap usage and provides configurable thresholds for
 * warning/error on excessive memory consumption. Useful for
 * streaming pipeline stages that may accumulate data.
 */

/** Memory guard state and thresholds. */
export interface MemoryGuardConfig {
  /** Memory threshold in bytes at which to emit warnings. Default: 500MB. */
  readonly warnThreshold?: number;
  /** Memory threshold in bytes at which to reject operations. Default: 2GB. */
  readonly errorThreshold?: number;
}

/** Current memory snapshot. */
export interface MemorySnapshot {
  /** Current process heap used (bytes). */
  readonly heapUsed: number;
  /** Total heap size (bytes). */
  readonly heapTotal: number;
  /** Whether the warn threshold has been exceeded. */
  readonly warned: boolean;
}

const MB = 1024 * 1024;
const DEFAULT_WARN_THRESHOLD = 500 * MB;
const DEFAULT_ERROR_THRESHOLD = 2 * 1024 * MB;

/**
 * Check current memory usage against configured thresholds.
 *
 * Returns a snapshot with `warned: true` if the warn threshold is exceeded.
 * Does NOT throw — callers decide how to handle the warning (e.g., log, trigger GC).
 *
 * Uses `process.memoryUsage()` which is available in Node.js.
 * In browser/non-Node environments, returns a stub with heapUsed=0.
 */
export function checkMemory(config?: MemoryGuardConfig): MemorySnapshot {
  const warnThreshold = config?.warnThreshold ?? DEFAULT_WARN_THRESHOLD;
  const errorThreshold = config?.errorThreshold ?? DEFAULT_ERROR_THRESHOLD;

  let heapUsed = 0;
  let heapTotal = 0;

  // Safe cross-runtime memory check
  try {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      heapUsed = usage.heapUsed;
      heapTotal = usage.heapTotal;
    }
  } catch {
    // Browser or restricted environment — skip memory check
  }

  if (heapUsed > errorThreshold) {
    throw new Error(
      `Memory usage ${(heapUsed / MB).toFixed(0)}MB exceeds error threshold ${(errorThreshold / MB).toFixed(0)}MB`,
    );
  }

  return {
    heapUsed,
    heapTotal,
    warned: heapUsed > warnThreshold,
  };
}

/**
 * Check if the current memory usage is below the warn threshold.
 * Convenience method for conditional logging.
 */
export function isMemoryHigh(config?: MemoryGuardConfig): boolean {
  return checkMemory(config).warned;
}

/**
 * Estimate the number of candidate pairs from record count and block sizes.
 * Used to predict memory requirements before running blocking.
 */
export function estimateBlockingMemory(
  _recordCount: number,
  estimatedPairs: number,
  comparisonsPerPair = 3,
): number {
  // Each pair generates ~150 bytes of data (scored pair + comparison vectors + overhead)
  const bytesPerPair = 150 + comparisonsPerPair * 50;
  return estimatedPairs * bytesPerPair;
}
