import React, { useEffect } from 'react';
import { CardHeader, Dialog, DialogContent, DialogTitle, TextField } from '@mui/material';
import debounce from 'lodash/debounce';
import { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import gfm from 'remark-gfm';
import { replaceDashboardParameters } from '../../chart/ChartUtils';

import { CleanIconButton } from '@neo4j-ndl/react';
import {
  DragIcon,
  Cog6ToothIconOutline,
  ArrowPathIconOutline,
  ExpandIcon,
  ShrinkIcon,
  CameraIconSolid,
  InformationCircleIconOutline,
  XMarkIconOutline,
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
  parameters,
}) => {
  const [text, setText] = React.useState(title);
  const [parsedText, setParsedText] = React.useState(title);
  const [editing, setEditing] = React.useState(false);
  const [descriptionModalOpen, setDescriptionModalOpen] = React.useState(false);

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
    <table className='nd-card-header' style={{ width: '100%' }}>
      <tbody>
        <tr>
          {editable ? (
            <td>
              <CleanIconButton
                description='Move report'
                className='n-mb-3 n-relative -n-left-3 drag-handle'
                size='medium'
                onClick={() => {}}
              >
                <DragIcon />
              </CleanIconButton>
            </td>
          ) : (
            <></>
          )}
          <td style={{ width: '100%' }}>
            <TextField
              id='standard-outlined'
              onFocus={() => {
                setEditing(true);
              }}
              onBlur={() => {
                setEditing(false);
              }}
              className={'no-underline large nd-card-title'}
              label=''
              disabled={!editable}
              placeholder='Report name...'
              fullWidth
              maxRows={4}
              value={editing ? text : parsedText !== ' ' ? parsedText : ''}
              onChange={(event) => {
                setText(event.target.value);
                debouncedTitleUpdate(event.target.value);
              }}
              size={'small'}
              style={{ paddingTop: '0px important!' }}
              variant={'standard'}
              sx={{
                '& .MuiInputBase-input.Mui-disabled': {
                  WebkitTextFillColor: 'inherit',
                },
              }}
            />
          </td>
        </tr>
      </tbody>
    </table>
  );

  const descriptionEnabled = description && description.length > 0;

  // TODO: all components like buttons should probably be seperate files
  const settingsButton = (
    <CleanIconButton description='Settings' onClick={onToggleCardSettings} size='medium'>
      <Cog6ToothIconOutline />
    </CleanIconButton>
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

  const downloadImageButton = (
    <CleanIconButton description='Download as Image' onClick={onDownloadImage} size='medium'>
      <CameraIconSolid />
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
        maxWidth={'lg'}
        open={descriptionModalOpen}
        onClose={() => setDescriptionModalOpen(false)}
        aria-labelledby='form-dialog-title'
      >
        <DialogTitle id='form-dialog-title'>
          {title}
          <CleanIconButton
            description='Close'
            onClick={() => setDescriptionModalOpen(false)}
            style={{ padding: '3px', float: 'right' }}
          >
            <XMarkIconOutline />
          </CleanIconButton>
        </DialogTitle>
        <DialogContent style={{ minWidth: '400px' }}>
          <div>
            {/* remarkPlugins (the old `plugins` prop was ignored, so tables etc. never rendered). Links open
                in a new tab via the anchor renderer, not a <base> tag, which changed every link on the page. */}
            <ReactMarkdown remarkPlugins={[gfm]} components={{ a: MarkdownLink }} children={description} />
          </div>
        </DialogContent>
      </Dialog>
      <CardHeader
        style={{ height: '72px' }}
        action={
          <>
            {downloadImageEnabled ? downloadImageButton : <></>}
            {/* Every report can be maximised to fill the window. */}
            {expanded ? unMaximizeButton : maximizeButton}
            {descriptionEnabled ? descriptionButton : <></>}
            {refreshButtonEnabled ? refreshButton : <></>}
            {editable ? settingsButton : <></>}
          </>
        }
        title={cardTitle}
      />
    </>
  );
};

export default NeoCardViewHeader;
