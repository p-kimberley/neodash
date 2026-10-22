import React from 'react';
import { GraphChartVisualizationProps } from '../../GraphChartVisualization';
import { CleanIconButton } from '@neo4j-ndl/react';
import { FitToScreenIcon } from '@neo4j-ndl/react/icons';

/**
 * Renders an icon on the bottom-right of the graph visualization to fit the current graph to the user's view.
 */
export const NeoGraphChartFitViewButton = (props: GraphChartVisualizationProps) => {
  return (
    <CleanIconButton description='Fit graph to view' size='small' onClick={() => props.interactivity.zoomToFit()}>
      <FitToScreenIcon />
    </CleanIconButton>
  );
};
