import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

/** The page grid's geometry, in px and grid cells. */
export interface GridGeometry {
  /** The number of columns at a width (the grid's breakpoints). */
  colsForWidth: (width: number) => number;
  rowHeight: number;
  /** Space between cells, and between cells and the grid's edges. */
  margin: number;
  /** Rows the reports currently take up. */
  rows: number;
}

/** A report's place on the grid, in cells. */
export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReportDrawLayerHandle {
  /** Starts drawing from a press elsewhere (the Add report tile), once the pointer has moved a little. */
  armFrom: (event: React.PointerEvent) => void;
  /** Whether a drawing just ended, so the click that follows it should be ignored. */
  consumeClick: () => boolean;
}

/** The smallest report, as on the grid (see Page). */
export const MIN_W = 4;
export const MIN_H = 2;
/** Empty rows kept below the reports while editing, to draw in. */
const SPARE_ROWS = 3;
/** Pointer movement (px) that turns a press into a drawing. */
const DRAG_THRESHOLD = 6;
/** How close to the scroll area's top or bottom edge (px) the page starts scrolling while drawing. */
const SCROLL_EDGE = 56;
const MAX_SCROLL_STEP = 22;

/** The element the page scrolls in (it may not scroll yet: the drawing can make the page taller). */
const scrollParentOf = (element: HTMLElement | null): HTMLElement | null => {
  for (let e = element?.parentElement; e; e = e.parentElement) {
    const { overflowY } = getComputedStyle(e);
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return e;
    }
  }
  return null;
};

/**
 * Lets editors draw a new report on the page grid: press on empty space (or on the Add report tile)
 * and drag. The outline snaps to the grid's cells and shows its size; near the top or bottom of the
 * window the page scrolls, and the drawable area grows, so reports can be many rows tall. It lies
 * behind the reports, so it only receives presses on empty space.
 */
export const ReportDrawLayer = React.forwardRef<
  ReportDrawLayerHandle,
  { geometry: GridGeometry; onDraw: (rect: GridRect) => void }
>(({ geometry, onDraw }, ref) => {
  const layer = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);
  const [drawing, setDrawing] = useState<{ anchor: { col: number; row: number }; rect: GridRect } | null>(null);
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const pointer = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const justDrew = useRef(false);

  const { colsForWidth, rowHeight, margin, rows } = geometry;
  const cols = colsForWidth(width);
  const colWidth = width > 0 ? (width - margin * (cols + 1)) / cols : 0;

  useEffect(() => {
    const element = layer.current;
    if (!element) {
      return undefined;
    }
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  /** The cell under a point on the screen. */
  const cellAt = useCallback(
    (clientX: number, clientY: number) => {
      const box = layer.current!.getBoundingClientRect();
      const col = Math.floor((clientX - box.left - margin / 2) / (colWidth + margin));
      const row = Math.floor((clientY - box.top - margin / 2) / (rowHeight + margin));
      return { col: Math.min(cols - 1, Math.max(0, col)), row: Math.max(0, row) };
    },
    [colWidth, cols, margin, rowHeight]
  );

  /** The report rectangle from the anchor cell to another, at least the smallest report's size. */
  const rectBetween = useCallback(
    (anchor: { col: number; row: number }, cell: { col: number; row: number }): GridRect => {
      let x = Math.min(anchor.col, cell.col);
      let w = Math.abs(cell.col - anchor.col) + 1;
      if (w < MIN_W) {
        // Grow towards the pointer, staying on the grid.
        x = cell.col < anchor.col ? anchor.col - MIN_W + 1 : anchor.col;
        x = Math.max(0, Math.min(x, cols - MIN_W));
        w = MIN_W;
      }
      let y = Math.min(anchor.row, cell.row);
      let h = Math.abs(cell.row - anchor.row) + 1;
      if (h < MIN_H) {
        y = cell.row < anchor.row ? Math.max(0, anchor.row - MIN_H + 1) : anchor.row;
        h = MIN_H;
      }
      return { x, y, w, h };
    },
    [cols]
  );

  const update = useCallback(() => {
    const { current } = drawingRef;
    if (!current) {
      return;
    }
    const rect = rectBetween(current.anchor, cellAt(pointer.current.x, pointer.current.y));
    const old = current.rect;
    if (rect.x !== old.x || rect.y !== old.y || rect.w !== old.w || rect.h !== old.h) {
      setDrawing({ anchor: current.anchor, rect });
    }
  }, [cellAt, rectBetween]);

  const begin = useCallback(
    (clientX: number, clientY: number, pointerId?: number) => {
      const anchor = cellAt(clientX, clientY);
      pointer.current = { x: clientX, y: clientY };
      setHover(null);
      setDrawing({ anchor, rect: rectBetween(anchor, anchor) });
      if (pointerId !== undefined) {
        try {
          layer.current?.setPointerCapture(pointerId);
        } catch (e) {
          // The pointer is already gone; the drawing ends with the next release anywhere.
        }
      }
    },
    [cellAt, rectBetween]
  );

  const finish = useCallback(
    (create: boolean) => {
      const { current } = drawingRef;
      setDrawing(null);
      if (create && current) {
        onDraw(current.rect);
      }
    },
    [onDraw]
  );

  const isDrawing = Boolean(drawing);

  // While drawing: the page scrolls when the pointer is near the scroll area's edge, the outline
  // follows the pointer, and Escape cancels.
  useEffect(() => {
    if (!drawing) {
      return undefined;
    }
    const scroller = scrollParentOf(layer.current);
    let frame = 0;
    const tick = () => {
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        const { y } = pointer.current;
        const below = y - (box.bottom - SCROLL_EDGE);
        const above = box.top + SCROLL_EDGE - y;
        if (below > 0) {
          scroller.scrollTop += Math.min(MAX_SCROLL_STEP, Math.ceil(below / 3));
        } else if (above > 0) {
          scroller.scrollTop -= Math.min(MAX_SCROLL_STEP, Math.ceil(above / 3));
        }
      }
      update();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        finish(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [isDrawing, update, finish]);

  useImperativeHandle(
    ref,
    () => ({
      armFrom: (event: React.PointerEvent) => {
        if (event.button !== 0) {
          return;
        }
        const start = { x: event.clientX, y: event.clientY };
        let dragged = false;
        const onMove = (e: PointerEvent) => {
          pointer.current = { x: e.clientX, y: e.clientY };
          if (!dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_THRESHOLD) {
            dragged = true;
            begin(start.x, start.y);
            pointer.current = { x: e.clientX, y: e.clientY };
          }
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          if (dragged) {
            // A drag from the tile (drawn, or cancelled with Escape) is not a click on it. The click, if
            // any, comes straight after this release, so the flag only lasts until then.
            justDrew.current = true;
            setTimeout(() => {
              justDrew.current = false;
            }, 0);
          }
          if (drawingRef.current) {
            finish(true);
          }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },
      consumeClick: () => {
        const drew = justDrew.current;
        justDrew.current = false;
        return drew;
      },
    }),
    [begin, finish]
  );

  const pixelRect = (rect: GridRect): React.CSSProperties => ({
    left: margin + rect.x * (colWidth + margin),
    top: margin + rect.y * (rowHeight + margin),
    width: rect.w * colWidth + (rect.w - 1) * margin,
    height: rect.h * rowHeight + (rect.h - 1) * margin,
  });

  // Room to draw: the reports' rows plus a few spare ones, and more below the outline as it grows.
  const drawnBottom = drawing ? drawing.rect.y + drawing.rect.h : 0;
  const totalRows = Math.max(rows + SPARE_ROWS, drawnBottom + SPARE_ROWS);
  const height = margin + totalRows * (rowHeight + margin);

  // The press only starts a drawing once it moves, so a stray click on empty space adds nothing.
  const pressed = useRef<{ x: number; y: number; id: number } | null>(null);

  return (
    <div
      ref={layer}
      className={`nd-draw-layer ${drawing ? 'is-drawing' : ''}`}
      style={{ height }}
      onPointerDown={(e) => {
        if (e.button === 0 && colWidth > 0) {
          // No text selection or focus change while drawing.
          e.preventDefault();
          pressed.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }
      }}
      onPointerMove={(e) => {
        pointer.current = { x: e.clientX, y: e.clientY };
        const press = pressed.current;
        if (!drawing && press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_THRESHOLD) {
          begin(press.x, press.y, press.id);
          pointer.current = { x: e.clientX, y: e.clientY };
          pressed.current = null;
        } else if (!drawing && !press && colWidth > 0) {
          const cell = cellAt(e.clientX, e.clientY);
          if (!hover || hover.col !== cell.col || hover.row !== cell.row) {
            setHover(cell);
          }
        }
      }}
      onPointerUp={() => {
        pressed.current = null;
        if (drawing) {
          finish(true);
        }
      }}
      onPointerCancel={() => {
        pressed.current = null;
        finish(false);
      }}
      onPointerLeave={() => setHover(null)}
    >
      {drawing && colWidth > 0 ? (
        <>
          {/* The cells the outline snaps to. */}
          <div className='nd-draw-cells' aria-hidden>
            {Array.from({ length: totalRows * cols }, (_, i) => (
              <div
                key={i}
                className='nd-draw-cell'
                style={pixelRect({ x: i % cols, y: Math.floor(i / cols), w: 1, h: 1 })}
              />
            ))}
          </div>
          <div className='nd-draw-outline' style={pixelRect(drawing.rect)} role='status'>
            <span>
              {drawing.rect.w} × {drawing.rect.h}
            </span>
          </div>
        </>
      ) : hover && colWidth > 0 ? (
        // A hint where the pointer is: the smallest report, and what to do.
        <div
          className='nd-draw-hint'
          style={pixelRect({ x: Math.min(hover.col, cols - MIN_W), y: hover.row, w: MIN_W, h: MIN_H })}
          aria-hidden
        >
          <span>Drag to draw a report</span>
        </div>
      ) : (
        <></>
      )}
    </div>
  );
});

export default ReportDrawLayer;
