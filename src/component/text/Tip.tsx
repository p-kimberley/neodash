import React from 'react';
import { Tooltip } from '@neo4j-ndl/react';

type Placement = React.ComponentProps<typeof Tooltip>['placement'];

/**
 * A plain-text tooltip on any element, shown on hover and keyboard focus (the design system's
 * simple tooltip). The child is used as the trigger as it is, so it must be a single element that
 * takes a ref (a DOM element or a component that forwards one). Without a title, only the child is
 * rendered.
 */
export const Tip = ({
  title,
  placement = 'top',
  children,
}: {
  title?: React.ReactNode;
  placement?: Placement;
  children: React.ReactElement;
}) => {
  if (title === undefined || title === null || title === '') {
    return children;
  }
  return (
    <Tooltip type='simple' placement={placement}>
      <Tooltip.Trigger hasButtonWrapper>{children}</Tooltip.Trigger>
      <Tooltip.Content>{title}</Tooltip.Content>
    </Tooltip>
  );
};
