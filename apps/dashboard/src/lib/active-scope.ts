/**
 * Active project ("scope") pin for the dashboard.
 *
 * Persists in `localStorage` under `OB_ACTIVE_SCOPE`. Every route that wants
 * to scope its data reads via `useActiveScope()`. The header switcher writes
 * via `setActiveScope`.
 *
 * Empty/missing pin === unscoped (the "All" option in the switcher).
 *
 * The architecture roadmap also lists `crm.$scope.$personId.tsx`-style
 * path-segment routes as an option; we deliberately chose the lighter
 * global-pin model so existing routes don't need re-naming. If we later
 * want shareable URLs, the same pin can be mirrored into a search param.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "OB_ACTIVE_SCOPE";

export interface ActiveScopeStore {
  read(): string | null;
  write(scope: string | null): void;
  subscribe(listener: () => void): () => void;
}

export function createLocalActiveScopeStore(
  storage: Storage | undefined = typeof window === "undefined" ? undefined : window.localStorage,
): ActiveScopeStore {
  const listeners = new Set<() => void>();
  return {
    read() {
      if (storage === undefined) {
        return null;
      }
      const v = storage.getItem(STORAGE_KEY);
      return v === null || v === "" ? null : v;
    },
    write(scope) {
      if (storage === undefined) {
        return;
      }
      if (scope === null || scope === "") {
        storage.removeItem(STORAGE_KEY);
      } else {
        storage.setItem(STORAGE_KEY, scope);
      }
      for (const l of listeners) {
        l();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let defaultStore: ActiveScopeStore | null = null;

function getDefaultStore(): ActiveScopeStore {
  if (defaultStore === null) {
    defaultStore = createLocalActiveScopeStore();
  }
  return defaultStore;
}

/**
 * Read the active scope reactively. Components re-render when another
 * mounted component writes a new scope. Cross-tab writes (`storage` event)
 * are out of scope — the dashboard is single-tab in practice.
 */
export function useActiveScope(): {
  scope: string | null;
  setScope(scope: string | null): void;
} {
  const store = getDefaultStore();
  const [scope, setScopeState] = useState<string | null>(() => store.read());
  useEffect(() => {
    const unsub = store.subscribe(() => setScopeState(store.read()));
    return unsub;
  }, [store]);
  return {
    scope,
    setScope: (next) => store.write(next),
  };
}
