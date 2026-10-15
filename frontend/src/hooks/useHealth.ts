import { useEffect, useState } from 'react';
import { api } from '../api/endpoints';
import type { Health } from '../api/types';

/** Backend configuration for the UI; connectivity errors are reported by library polling. */
export function useHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api
      .health(controller.signal)
      .then(setHealth)
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return health;
}
