import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ClickAwayListener, Popper } from '@mui/material';
import { CleanIconButton } from '@neo4j-ndl/react';
import { XMarkIconOutline } from '@neo4j-ndl/react/icons';
import { GraphChartVisualizationProps } from '../GraphChartVisualization';
import { getEntityHeader } from '../util/NodeUtils';
import GraphEntityInspectionTable from './GraphEntityInspectionTable';

/**
 * Shows a node's or relationship's properties in a popup next to where it was clicked (or inspected
 * from the right-click menu). Unlike the dialog it replaces, it doesn't block the graph: clicking
 * elsewhere or pressing Escape closes it, and clicking another node moves it there.
 */
export const NeoGraphChartInfoPopup = (props: GraphChartVisualizationProps) => {
  const { showPropertyInspector, setPropertyInspectorOpen, selectedEntity, clickPosition } = props.interactivity;
  const open = Boolean(showPropertyInspector && selectedEntity);

  // Popper positions itself against a zero-size "element" at the click position (viewport coords).
  const anchor = useMemo(
    () => ({
      getBoundingClientRect: () => new DOMRect(clickPosition?.x ?? 0, clickPosition?.y ?? 0, 0, 0),
    }),
    [clickPosition?.x, clickPosition?.y]
  );

  // Re-placed when its content changes size (e.g. "Show more"), so it stays inside the window. A
  // callback ref, because Popper mounts the content (through a portal) after this component.
  const popperRef = useRef<{ update: () => void } | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const contentRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (el) {
      observer.current = new ResizeObserver(() => popperRef.current?.update());
      observer.current.observe(el);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPropertyInspectorOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) {
    return <></>;
  }
  return (
    <Popper
      open
      anchorEl={anchor}
      popperRef={popperRef as any}
      placement='right-start'
      // Above maximised reports (dialogs) as well as the dashboard.
      style={{ zIndex: 1400 }}
      modifiers={[
        { name: 'offset', options: { offset: [0, 12] } },
        { name: 'preventOverflow', options: { padding: 8 } },
        { name: 'flip', options: { fallbackPlacements: ['left-start', 'bottom', 'top'] } },
      ]}
    >
      {/* Mouse-down, so a click on another node closes this popup before that node's click opens it again. */}
      <ClickAwayListener mouseEvent='onMouseDown' onClickAway={() => setPropertyInspectorOpen(false)}>
        <div ref={contentRef} className='nd-floating-menu nd-graph-info' role='dialog' aria-label='Properties'>
          <div className='nd-graph-info-header'>
            <span className='nd-graph-info-title'>{getEntityHeader(selectedEntity, props?.engine?.selection)}</span>
            <CleanIconButton description='Close' size='small' onClick={() => setPropertyInspectorOpen(false)}>
              <XMarkIconOutline />
            </CleanIconButton>
          </div>
          <div className='nd-graph-info-body'>
            <GraphEntityInspectionTable entity={selectedEntity} />
          </div>
        </div>
      </ClickAwayListener>
    </Popper>
  );
};

export default NeoGraphChartInfoPopup;
