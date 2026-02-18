import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";

/**
 * Returns true once the zustand-persist middleware has finished rehydrating
 * the store from localStorage. Use this to avoid acting on stale (empty)
 * state during the first render.
 */
export function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useStore.persist.hasHydrated(),
  );
  useEffect(() => {
    if (hydrated) return;
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    // Guard against hydration completing between the useState initialiser and here
    if (useStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);
  return hydrated;
}
