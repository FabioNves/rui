"use client";

import * as React from "react";

export function usePersistedState<T>(key: string, initialValue: T) {
  const [hydrated, setHydrated] = React.useState(false);
  const [value, setValue] = React.useState<T>(initialValue);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw));
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
  }, [key]);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value, hydrated]);

  return { hydrated, value, setValue } as const;
}
