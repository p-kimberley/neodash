import React, { useEffect, useMemo } from 'react';
import { ClickAwayListener, Popper } from '@mui/material';
import { IconButton } from '@neo4j-ndl/react';
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
        <div className='nd-floating-menu nd-graph-info' role='dialog' aria-label='Properties'>
          <div className='nd-graph-info-header'>
            <span className='nd-graph-info-title'>{getEntityHeader(selectedEntity, props?.engine?.selection)}</span>
            <IconButton aria-label='close' size='small' clean onClick={() => setPropertyInspectorOpen(false)}>
              <XMarkIconOutline />
            </IconButton>
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
