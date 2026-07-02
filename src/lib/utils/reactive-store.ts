/**
 * Shared `useSyncExternalStore` plumbing for the house module-level-snapshot
 * store pattern (category-overrides.ts, custom-categories.ts, demo-reports.ts,
 * task-completion.ts, teams-overrides.ts, theme.ts, upvotes.ts).
 *
 * Each store keeps its OWN mutable snapshot variable in file scope — mutation
 * methods keep reading/reassigning it directly, unchanged — and hands this
 * helper a getter closing over that variable so `getSnapshot` always reflects
 * the current value. This module only owns the part that was byte-identical
 * across every store: the `Set<() => void>` of listeners, `subscribe`,
 * `emit`, and a referentially-stable frozen server snapshot so React doesn't
 * loop on SSR.
 *
 * `createReactiveStore` is the one-snapshot-per-store case (6 of the 7
 * files). A store with two independent snapshots sharing a single listener
 * set/emit (category-overrides.ts, teams-overrides.ts — one `emit()` must
 * notify both the primary-map and history subscriptions) should use
 * `createListenerHub` + `frozenSnapshot` directly instead; see those files.
 */

export interface ListenerHub {
  subscribe: (listener: () => void) => () => void;
  emit: () => void;
}

export function createListenerHub(): ListenerHub {
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function emit() {
    for (const l of listeners) l();
  }

  return { subscribe, emit };
}

/** A referentially-stable frozen constant, returned as a zero-arg getter so
 *  it can be passed straight to `useSyncExternalStore` as `getServerSnapshot`. */
export function frozenSnapshot<T>(value: T): () => T {
  const frozen = Object.freeze(value) as T;
  return () => frozen;
}

export interface ReactiveStore<T> extends ListenerHub {
  getSnapshot: () => T;
  getServerSnapshot: () => T;
}

export function createReactiveStore<T>(
  getSnapshot: () => T,
  serverSnapshot: T,
): ReactiveStore<T> {
  return {
    ...createListenerHub(),
    getSnapshot,
    getServerSnapshot: frozenSnapshot(serverSnapshot),
  };
}
