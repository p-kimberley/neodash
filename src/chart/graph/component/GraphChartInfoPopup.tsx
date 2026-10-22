import React from 'react';
import { CleanIconButton, Popover } from '@neo4j-ndl/react';
import { XMarkIconOutline } from '@neo4j-ndl/react/icons';
import { GraphChartVisualizationProps } from '../GraphChartVisualization';
import { getEntityHeader } from '../util/NodeUtils';
import GraphEntityInspectionTable from './GraphEntityInspectionTable';

/**
 * Shows a node's or relationship's properties in a popup next to where it was clicked (or inspected
 * from the right-click menu). Unlike the dialog it replaces, it doesn't block the graph: clicking
 * elsewhere or pressing Escape closes it, and clicking another node moves it there. The popover
 * flips and shifts to stay inside the window, also when its content grows ("Show more").
 */
export const NeoGraphChartInfoPopup = (props: GraphChartVisualizationProps) => {
  const { showPropertyInspector, setPropertyInspectorOpen, selectedEntity, clickPosition } = props.interactivity;
  const open = Boolean(showPropertyInspector && selectedEntity);

  if (!open) {
    return <></>;
  }
  return (
    <Popover
      isOpen
      // Closes on a press outside it (before a click on another node opens it there) and on Escape.
      onOpenChange={(isOpen) => !isOpen && setPropertyInspectorOpen(false)}
      anchorPosition={{ x: clickPosition?.x ?? 0, y: clickPosition?.y ?? 0 }}
      placement='top-end-top-start'
      offset={12}
      shouldConstrainSize
    >
      <Popover.Content className='nd-graph-info' htmlAttributes={{ 'aria-label': 'Properties' }}>
        <div className='nd-graph-info-header'>
          <span className='nd-graph-info-title'>{getEntityHeader(selectedEntity, props?.engine?.selection)}</span>
          <CleanIconButton description='Close' size='small' onClick={() => setPropertyInspectorOpen(false)}>
            <XMarkIconOutline />
          </CleanIconButton>
        </div>
        <div className='nd-graph-info-body'>
          <GraphEntityInspectionTable entity={selectedEntity} />
        </div>
      </Popover.Content>
    </Popover>
  );
};

export default NeoGraphChartInfoPopup;
