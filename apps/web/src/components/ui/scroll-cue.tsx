'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type ScrollAxis = 'x' | 'y';

/** Which ends of a scroll container still have content past them. */
export interface ScrollEdges {
  /** Content hidden before the visible part: above (y) or on the reading-start side (x). */
  start: boolean;
  /** Content hidden after the visible part: below (y) or on the reading-end side (x). */
  end: boolean;
}

const NONE: ScrollEdges = { start: false, end: false };
/** Sub-pixel slack: zoomed and fractional layouts never land exactly on 0 or the max. */
const SLACK = 1;

/**
 * Pure: the hidden edges of a scroll box. Works for RTL too: there `scrollLeft` runs from 0 at
 * the reading start to a negative value at the end, so its magnitude is the distance scrolled.
 */
export function scrollEdgesOf(
  el: Pick<
    HTMLElement,
    | 'scrollLeft'
    | 'scrollTop'
    | 'scrollWidth'
    | 'scrollHeight'
    | 'clientWidth'
    | 'clientHeight'
  >,
  axis: ScrollAxis,
): ScrollEdges {
  const size = axis === 'x' ? el.scrollWidth : el.scrollHeight;
  const view = axis === 'x' ? el.clientWidth : el.clientHeight;
  const max = size - view;
  if (max <= SLACK) return NONE;
  const pos = Math.abs(axis === 'x' ? el.scrollLeft : el.scrollTop);
  return { start: pos > SLACK, end: pos < max - SLACK };
}

/**
 * Tracks the hidden edges of the element `attach` is given (as its ref): on scroll, when the
 * box or its content resizes. Nothing overflows → both false, so no cue is drawn on a box that fits.
 */
export function useScrollEdges<T extends HTMLElement>(axis: ScrollAxis) {
  const [edges, setEdges] = React.useState<ScrollEdges>(NONE);

  // React 19 ref callback: the returned function runs when the element goes away.
  const attach = React.useCallback(
    (el: T | null) => {
      if (!el) return;
      const update = () =>
        setEdges((prev) => {
          const next = scrollEdgesOf(el, axis);
          return prev.start === next.start && prev.end === next.end
            ? prev
            : next;
        });
      update();
      el.addEventListener('scroll', update, { passive: true });
      const observer =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(update);
      observer?.observe(el);
      for (const child of Array.from(el.children)) observer?.observe(child);
      return () => {
        el.removeEventListener('scroll', update);
        observer?.disconnect();
      };
    },
    [axis],
  );

  return { attach, edges };
}

const cueBase =
  'pointer-events-none absolute z-10 transition-opacity duration-150 ease-snappy motion-reduce:transition-none';

/** Gradient per side. Logical start/end, so the x cues mirror under `dir="rtl"`. */
const cueSides: Record<ScrollAxis, Record<keyof ScrollEdges, string>> = {
  x: {
    start: 'inset-y-0 start-0 w-10 bg-linear-to-r rtl:bg-linear-to-l',
    end: 'inset-y-0 end-0 w-10 bg-linear-to-l rtl:bg-linear-to-r',
  },
  y: {
    start: 'inset-x-0 top-0 h-8 bg-linear-to-b',
    end: 'inset-x-0 bottom-0 h-8 bg-linear-to-t',
  },
};

/**
 * The fades that say "more this way", drawn over the edges of a scroll container. Place it in a
 * `relative` wrapper around (not inside) the scrolling element; `fadeFrom` is the surface colour
 * behind the content (`from-card` by default).
 */
export function ScrollEdgeCues({
  axis,
  edges,
  fadeFrom = 'from-card',
}: {
  axis: ScrollAxis;
  edges: ScrollEdges;
  fadeFrom?: string;
}) {
  return (
    <>
      {(['start', 'end'] as const).map((side) => (
        <span
          key={side}
          aria-hidden
          data-scroll-cue={side}
          data-visible={edges[side] || undefined}
          className={cn(
            cueBase,
            cueSides[axis][side],
            // Solid for the first fifth, then fading: reads as an edge, not a smudge.
            fadeFrom,
            'from-20% to-transparent',
            edges[side] ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}
    </>
  );
}
