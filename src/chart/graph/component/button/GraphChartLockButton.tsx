import React from 'react';
import { GraphChartVisualizationProps } from '../../GraphChartVisualization';
import { CleanIconButton } from '@neo4j-ndl/react';
import { LockOpenIconSolid, LockClosedIconSolid } from '@neo4j-ndl/react/icons';

/**
 * Renders a button that can be used to 'lock' = freeze the current graph layout by disabling the force layout.
 */
export const NeoGraphChartLockButton = (props: GraphChartVisualizationProps) => {
  const frozen = props.interactivity.layoutFrozen;
  return (
    <CleanIconButton
      description={frozen ? 'Unlock graph layout' : 'Lock graph layout'}
      size='small'
      onClick={() => {
        if (!frozen && props.interactivity.nodePositions == undefined) {
          props.interactivity.nodePositions = {};
        }
        props.interactivity.setLayoutFrozen(!frozen);
      }}
    >
      {frozen ? <LockClosedIconSolid /> : <LockOpenIconSolid />}
    </CleanIconButton>
  );
};
