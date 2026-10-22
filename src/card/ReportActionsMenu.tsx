import React from 'react';
import { CleanIconButton, Menu } from '@neo4j-ndl/react';
import {
  DocumentDuplicateIconOutline,
  EllipsisVerticalIconOutline,
  QuestionMarkCircleIconOutline,
  TrashIconOutline,
} from '@neo4j-ndl/react/icons';

/** One item of a report's ⋮ menu. */
export interface ReportMenuItem {
  key: string;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Shown in the danger colour (e.g. Delete). */
  danger?: boolean;
}

/** The editing actions both faces' menus end with: duplicate, help for the report type, delete. */
export const reportEditItems = ({ onClonePressed, onReportHelpButtonPressed, onRemovePressed }): ReportMenuItem[] => [
  { key: 'duplicate', icon: <DocumentDuplicateIconOutline />, title: 'Duplicate', onClick: onClonePressed },
  { key: 'help', icon: <QuestionMarkCircleIconOutline />, title: 'Help', onClick: onReportHelpButtonPressed },
  { key: 'delete', icon: <TrashIconOutline />, title: 'Delete', onClick: onRemovePressed, danger: true },
];

/**
 * A report's actions menu (⋮), on both faces of the card. Items come in groups, shown with a divider
 * between them; empty groups are left out, and with no items at all there is no button.
 */
export const ReportActionsMenu = ({ groups }: { groups: (ReportMenuItem | false | undefined | null)[][] }) => {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const shown = groups.map((group) => group.filter(Boolean) as ReportMenuItem[]).filter((group) => group.length > 0);
  if (shown.length === 0) {
    return <></>;
  }
  const close = () => setAnchor(null);
  return (
    <>
      <CleanIconButton
        description='Report actions'
        onClick={(e) => setAnchor(e.currentTarget)}
        size='medium'
        isActive={Boolean(anchor)}
      >
        <EllipsisVerticalIconOutline />
      </CleanIconButton>
      <Menu anchorRef={{ current: anchor }} isOpen={Boolean(anchor)} onClose={close} placement='bottom-end-top-end'>
        {shown.map((group, index) => (
          <React.Fragment key={group[0].key}>
            {index > 0 ? <Menu.Divider /> : <></>}
            <Menu.Group>
              {group.map((item) => (
                <Menu.Item
                  key={item.key}
                  className={item.danger ? 'n-text-danger-text' : undefined}
                  leadingVisual={item.icon}
                  title={item.title}
                  onClick={() => {
                    close();
                    item.onClick();
                  }}
                />
              ))}
            </Menu.Group>
          </React.Fragment>
        ))}
      </Menu>
    </>
  );
};

export default ReportActionsMenu;
