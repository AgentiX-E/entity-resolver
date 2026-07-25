/**
 * Dashboard Event Bus — lightweight cross-component communication.
 *
 * Enables decoupled interaction between dashboard components:
 * - Cluster click → Waterfall updates to show best pair
 * - Threshold drag → Histogram + Cluster re-render
 * - Pair select → Comparison Viewer shows details
 *
 * Zero dependencies. Uses DOM CustomEvent under the hood
 * for interoperability with Web Components.
 */

export type DashboardEventType =
  | 'cluster:select'
  | 'pair:select'
  | 'threshold:change'
  | 'record:hover'
  | 'view:switch';

export interface DashboardEvent {
  type: DashboardEventType;
  detail?: Record<string, unknown> | undefined;
}

type EventHandler = (event: DashboardEvent) => void;

/** Singleton event bus shared across all dashboard components. */
class DashboardEventBus {
  private handlers = new Map<DashboardEventType, Set<EventHandler>>();
  private element: HTMLElement;

  constructor(root: HTMLElement) {
    this.element = root;
  }

  /** Dispatch an event to all registered handlers. */
  emit(type: DashboardEventType, detail?: Record<string, unknown>): void {
    const event: DashboardEvent = { type, detail };
    // DOM CustomEvent for Web Component interop
    this.element.dispatchEvent(
      new CustomEvent(`er-dashboard:${type}`, {
        bubbles: true,
        composed: true,
        detail: event,
      }),
    );
    // Internal handler dispatch
    const listeners = this.handlers.get(type);
    if (listeners) {
      for (const handler of listeners) {
        try {
          handler(event);
        } catch {
          // Never let one handler crash break others
        }
      }
    }
  }

  /** Register a listener for a specific event type. Returns unsubscribe function. */
  on(type: DashboardEventType, handler: EventHandler): () => void {
    let listeners = this.handlers.get(type);
    if (!listeners) {
      listeners = new Set();
      this.handlers.set(type, listeners);
    }
    listeners.add(handler);
    return () => {
      listeners?.delete(handler);
    };
  }

  /** Remove all handlers. Used for cleanup on unmount. */
  destroy(): void {
    this.handlers.clear();
  }
}

export { DashboardEventBus };
