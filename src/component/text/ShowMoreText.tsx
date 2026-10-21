import React, { useLayoutEffect, useRef, useState } from 'react';

/**
 * Text clamped to `lines` lines, with a "Show more" / "Show less" toggle when it doesn't fit
 * (replaces react-show-more-text, which doesn't support React 19).
 */
export const ShowMoreText = ({ lines, children }: { lines: number; children: React.ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Re-measured whenever the content or its width changes, while clamped.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) {
      return undefined;
    }
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, expanded, lines]);

  const clamp: React.CSSProperties = expanded
    ? {}
    : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' };

  return (
    <div>
      <div ref={ref} style={{ ...clamp, overflowWrap: 'anywhere' }}>
        {children}
      </div>
      {overflows || expanded ? (
        <button type='button' className='nd-show-more' onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : (
        <></>
      )}
    </div>
  );
};

export default ShowMoreText;
