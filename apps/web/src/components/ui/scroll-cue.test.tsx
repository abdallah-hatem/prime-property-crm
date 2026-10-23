import { act, render, screen } from '@testing-library/react';
import { ScrollEdgeCues, scrollEdgesOf, useScrollEdges } from './scroll-cue';
import { selectSideFor } from './select';

const box = (over: Partial<Record<string, number>>) => ({
  scrollLeft: 0,
  scrollTop: 0,
  scrollWidth: 300,
  scrollHeight: 200,
  clientWidth: 300,
  clientHeight: 200,
  ...over,
});

describe('scrollEdgesOf', () => {
  it('shows no cue when the content fits', () => {
    expect(scrollEdgesOf(box({}), 'x')).toEqual({ start: false, end: false });
    // A sub-pixel overflow (zoom rounding) is not something to scroll to.
    expect(scrollEdgesOf(box({ scrollWidth: 300.6 }), 'x')).toEqual({
      start: false,
      end: false,
    });
  });

  it('shows only the end cue before scrolling, both mid-way, only the start cue at the end', () => {
    const wide = { scrollWidth: 600 };
    expect(scrollEdgesOf(box(wide), 'x')).toEqual({ start: false, end: true });
    expect(scrollEdgesOf(box({ ...wide, scrollLeft: 150 }), 'x')).toEqual({
      start: true,
      end: true,
    });
    expect(scrollEdgesOf(box({ ...wide, scrollLeft: 300 }), 'x')).toEqual({
      start: true,
      end: false,
    });
  });

  it('reads RTL scroll positions (negative scrollLeft) the same way', () => {
    const wide = { scrollWidth: 600 };
    expect(scrollEdgesOf(box({ ...wide, scrollLeft: -150 }), 'x')).toEqual({
      start: true,
      end: true,
    });
    expect(scrollEdgesOf(box({ ...wide, scrollLeft: -300 }), 'x')).toEqual({
      start: true,
      end: false,
    });
  });

  it('works on the vertical axis', () => {
    expect(scrollEdgesOf(box({ scrollHeight: 500 }), 'y')).toEqual({
      start: false,
      end: true,
    });
  });
});

function Scroller({ width }: { width: number }) {
  const { attach, edges } = useScrollEdges<HTMLDivElement>('x');
  return (
    <div>
      <div
        data-testid="scroller"
        ref={(el) => {
          if (el) {
            Object.defineProperty(el, 'clientWidth', {
              value: 300,
              configurable: true,
            });
            Object.defineProperty(el, 'scrollWidth', {
              value: width,
              configurable: true,
            });
            // jsdom doesn't scroll; a writable value stands in for the position.
            Object.defineProperty(el, 'scrollLeft', {
              value: el.scrollLeft,
              writable: true,
              configurable: true,
            });
          }
          return attach(el);
        }}
      />
      <ScrollEdgeCues axis="x" edges={edges} />
    </div>
  );
}

const visibleCues = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-scroll-cue][data-visible]')).map(
    (el) => el.getAttribute('data-scroll-cue'),
  );

describe('useScrollEdges + ScrollEdgeCues', () => {
  it('draws no cue on a box that fits', () => {
    const { container } = render(<Scroller width={300} />);
    expect(visibleCues(container)).toEqual([]);
  });

  it('draws the end cue when content overflows, and the start cue once scrolled', () => {
    const { container } = render(<Scroller width={800} />);
    expect(visibleCues(container)).toEqual(['end']);
    const scroller = screen.getByTestId('scroller');
    act(() => {
      scroller.scrollLeft = 500;
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(visibleCues(container)).toEqual(['start']);
  });
});

describe('selectSideFor', () => {
  it('opens below when a few rows fit there, even if above is roomier', () => {
    expect(selectSideFor(500, 160)).toBe('bottom');
    expect(selectSideFor(560, 140)).toBe('bottom');
  });
  it('opens above only when below is cramped and above has more room', () => {
    expect(selectSideFor(500, 60)).toBe('top');
    expect(selectSideFor(40, 60)).toBe('bottom');
  });
});
