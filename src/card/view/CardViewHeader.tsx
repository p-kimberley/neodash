import React, { useEffect } from 'react';
import debounce from 'lodash/debounce';
import { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import gfm from 'remark-gfm';
import { replaceDashboardParameters } from '../../chart/ChartUtils';

import { CleanIconButton, Menu } from '@neo4j-ndl/react';
import { Dialog } from '../../component/dialog/Dialog';
import {
  DragIcon,
  Cog6ToothIconOutline,
  ArrowPathIconOutline,
  ExpandIcon,
  ShrinkIcon,
  InformationCircleIconOutline,
  EllipsisVerticalIconOutline,
  TableCellsIconOutline,
  PresentationChartBarIconOutline,
  PhotoIconOutline,
} from '@neo4j-ndl/react/icons';

const MarkdownLink = ({ node: _node, ...props }: any) => <a {...props} target='_blank' rel='noopener noreferrer' />;

const NeoCardViewHeader = ({
  title,
  description,
  editable,
  onTitleUpdate,
  downloadImageEnabled,
  refreshButtonEnabled,
  onToggleCardSettings,
  onManualRefreshCard,
  onDownloadImage,
  onToggleCardExpand,
  expanded,
  canViewAsTable = false,
  viewAsTable = false,
  onToggleViewAsTable = () => {},
  parameters,
}) => {
  const [text, setText] = React.useState(title);
  const [parsedText, setParsedText] = React.useState(title);
  const [editing, setEditing] = React.useState(false);
  const [descriptionModalOpen, setDescriptionModalOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);

  function replaceParamsOnString(s, p) {
    let parsed: string;
    parsed = replaceDashboardParameters(s, p);
    return parsed;
  }

  // Ensure that we only trigger a text update event after the user has stopped typing.
  const debouncedTitleUpdate = useCallback(debounce(onTitleUpdate, 250), []);

  useEffect(() => {
    let titleParsed = replaceParamsOnString(`${title}`, parameters);
    if (!editing) {
      setParsedText(titleParsed);
    }
  }, [editing, parameters]);

  useEffect(() => {
    // Reset text to the dashboard state when the page gets reorganized.
    if (text !== title) {
      setText(title);
    }
  }, [title]);

  const cardTitle = (
    <div className='nd-card-header'>
      {editable ? (
        <CleanIconButton description='Move report' className='drag-handle' size='medium' onClick={() => {}}>
          <DragIcon />
        </CleanIconButton>
      ) : (
        <></>
      )}
      <div className='nd-card-header-title'>
        {/* The title, editable in place (dashboard parameters in it are filled in while not editing). */}
        <input
          className='nd-card-title'
          aria-label='Report title'
          onFocus={() => {
            setEditing(true);
          }}
          onBlur={() => {
            setEditing(false);
          }}
          disabled={!editable}
          placeholder='Report name...'
          value={editing ? text : parsedText !== ' ' ? parsedText : ''}
          onChange={(event) => {
            setText(event.target.value);
            debouncedTitleUpdate(event.target.value);
          }}
        />
      </div>
    </div>
  );

  const descriptionEnabled = description && description.length > 0;

  // The ⋮ menu: switching between the chart and a table of its results, downloading an image, and
  // (for editors) the report's settings.
  const closeMenuAnd = (action: () => void) => () => {
    setMenuAnchor(null);
    action();
  };
  const menuItems = [
    canViewAsTable && (
      <Menu.Item
        key='table'
        leadingVisual={viewAsTable ? <PresentationChartBarIconOutline /> : <TableCellsIconOutline />}
        title={viewAsTable ? 'View as chart' : 'View as table'}
        onClick={closeMenuAnd(onToggleViewAsTable)}
      />
    ),
    downloadImageEnabled && (
      <Menu.Item
        key='image'
        leadingVisual={<PhotoIconOutline />}
        title='Download as image'
        onClick={closeMenuAnd(onDownloadImage)}
      />
    ),
    editable && (
      <Menu.Item
        key='settings'
        leadingVisual={<Cog6ToothIconOutline />}
        title='Settings'
        onClick={closeMenuAnd(onToggleCardSettings)}
      />
    ),
  ].filter(Boolean);

  const menuButton = (
    <>
      <CleanIconButton
        description='Report actions'
        onClick={(e) => setMenuAnchor(e.currentTarget)}
        size='medium'
        isActive={Boolean(menuAnchor)}
      >
        <EllipsisVerticalIconOutline />
      </CleanIconButton>
      <Menu
        anchorRef={{ current: menuAnchor }}
        isOpen={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        placement='bottom-end-top-end'      >
        <Menu.Items>{menuItems}</Menu.Items>
      </Menu>
    </>
  );

  const refreshButton = (
    <CleanIconButton description='Refresh' onClick={onManualRefreshCard} size='medium'>
      <ArrowPathIconOutline />
    </CleanIconButton>
  );

  const maximizeButton = (
    <CleanIconButton description='Maximize' onClick={onToggleCardExpand} size='medium'>
      <ExpandIcon />
    </CleanIconButton>
  );

  const unMaximizeButton = (
    <CleanIconButton description='Restore' onClick={onToggleCardExpand} size='medium'>
      <ShrinkIcon />
    </CleanIconButton>
  );

  const descriptionButton = (
    <CleanIconButton description='Details' onClick={() => setDescriptionModalOpen(true)} size='medium'>
      <InformationCircleIconOutline />
    </CleanIconButton>
  );

  return (
    <>
      <Dialog
        size='large'
        isOpen={descriptionModalOpen}
        onClose={() => setDescriptionModalOpen(false)}
        className='nd-report-description'
      >
        <Dialog.Header>{title}</Dialog.Header>
        <Dialog.Content>
          <div className='markdown-widget'>
            {/* remarkPlugins (the old `plugins` prop was ignored, so tables etc. never rendered). Links open
                in a new tab via the anchor renderer, not a <base> tag, which changed every link on the page. */}
            <ReactMarkdown remarkPlugins={[gfm]} components={{ a: MarkdownLink }} children={description} />
          </div>
        </Dialog.Content>
      </Dialog>
      <div className='nd-card-bar'>
        <div className='nd-card-bar-title'>{cardTitle}</div>
        <div className='nd-card-bar-actions'>
          {/* Every report can be maximised to fill the window. */}
          {expanded ? unMaximizeButton : maximizeButton}
          {descriptionEnabled ? descriptionButton : <></>}
          {refreshButtonEnabled ? refreshButton : <></>}
          {menuItems.length > 0 ? menuButton : <></>}
        </div>
      </div>
    </>
  );
};

export default NeoCardViewHeader;
