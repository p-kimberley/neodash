import React from 'react';
import { replaceDashboardParametersInString } from '../../../ChartUtils';
import { GraphChartVisualizationProps } from '../../GraphChartVisualization';
import { CleanIconButton } from '@neo4j-ndl/react';
import { MagnifyingGlassIconOutline } from '@neo4j-ndl/react/icons';

/**
 * If a deep-link URL is specified in the advanced settings, renders an icon at the top right of the graph visualization that redirects to the link.
 */
export const NeoGraphChartDeepLinkButton = (props: GraphChartVisualizationProps) => {
  return (
    <CleanIconButton
      as='a'
      description='Investigate graph'
      size='small'
      htmlAttributes={{
        href: replaceDashboardParametersInString(props.interactivity.drilldownLink, props.data.parameters),
        target: '_blank',
        rel: 'noopener noreferrer',
      }}
    >
      <MagnifyingGlassIconOutline />
    </CleanIconButton>
  );
};
