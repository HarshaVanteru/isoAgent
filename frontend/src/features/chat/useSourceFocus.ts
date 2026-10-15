import { useCallback, useState } from 'react';
import type { Source } from '../../api/types';
import { sourceElementId } from '../../lib/citations';
import { scrollBehavior } from '../../lib/motion';

const NONE: ReadonlySet<number> = new Set();

/** Expanded state for the latest answer's sources; resets whenever a new answer arrives. */
export function useSourceFocus(sources: Source[]) {
  const [state, setState] = useState({ sources, open: NONE });
  const open = state.sources === sources ? state.open : NONE;

  const update = useCallback(
    (change: (current: Set<number>) => void) =>
      setState((previous) => {
        const next = new Set(previous.sources === sources ? previous.open : NONE);
        change(next);
        return { sources, open: next };
      }),
    [sources],
  );

  const isExpanded = useCallback((citation: number) => open.has(citation), [open]);

  const toggle = useCallback(
    (citation: number) =>
      update((next) => {
        if (next.has(citation)) next.delete(citation);
        else next.add(citation);
      }),
    [update],
  );

  const reveal = useCallback(
    (citation: number) => {
      update((next) => next.add(citation));
      requestAnimationFrame(() => {
        const element = document.getElementById(sourceElementId(citation));
        element?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
        element?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
      });
    },
    [update],
  );

  return { isExpanded, toggle, reveal };
}
