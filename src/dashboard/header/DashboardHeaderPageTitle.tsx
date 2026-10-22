import React, { useState, useCallback, useEffect } from 'react';
import { connect } from 'react-redux';
import classnames from 'classnames';
import debounce from 'lodash/debounce';
import { setPageTitle } from '../../page/PageActions';
import { removePageThunk } from '../DashboardThunks';
import { Tabs, Menu, CleanIconButton } from '@neo4j-ndl/react';
import { EllipsisHorizontalIconOutline, PencilIconOutline, TrashIconOutline } from '@neo4j-ndl/react/icons';
import { NeoDeletePageModal } from '../../modal/DeletePageModal';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type MenuEditEvent = React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement> | React.FormEvent<HTMLElement>;

export const DashboardHeaderPageTitle = ({ title, tabIndex, removePage, setPageTitle, disabled = false }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const menuOpen = Boolean(anchorEl);
  const [deleteModalOpen, setDeleteModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [inputWidth, setInputWidth] = React.useState(125);
  const handleMenuEditClick = (event: MenuEditEvent) => {
    event.preventDefault();
    setEditing(!editing);
    setAnchorEl(null);
  };

  const handleDeleteModalClose = () => {
    setAnchorEl(null);
    setDeleteModalOpen(false);
  };

  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isSorting } = useSortable({
    id: `tab_${tabIndex}`,
  });

  useEffect(() => {
    // Reset text to the dashboard state when the page gets reorganized.
    if ((isDragging || isSorting) && editing) {
      setEditing(false);
    }
    setAnchorEl(null);
  }, [isDragging, isSorting]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const debouncedSetPageTitle = useCallback(debounce(setPageTitle, 200), []);

  const [titleText, setTitleText] = React.useState(title);
  useEffect(() => {
    // Reset text to the dashboard state when the page gets reorganized.
    if (titleText !== title) {
      setTitleText(title);
    }
  }, [title]);

  const content = (
    <div
      className='n-inline-flex n-items-center nd-page-tab'
      ref={setNodeRef}
      style={style}
      id={`tab_${tabIndex}`}
      {...attributes}
      {...listeners}
    >
      <Tabs.Tab id={`${tabIndex}`} key={tabIndex}>
        {!editing ? (
          title ? (
            title
          ) : (
            '(no title)'
          )
        ) : (
          <form
            onSubmit={(event) => {
              if (editing) {
                handleMenuEditClick(event);
              }
            }}
          >
            <input
              data-no-dnd='true'
              autoFocus={true}
              value={titleText}
              className=''
              onBlur={(event) => {
                if (editing) {
                  handleMenuEditClick(event);
                }
              }}
              onChange={(event) => {
                const { target } = event;
                target.style.width = '125px';
                setInputWidth(target.scrollWidth);

                if (disabled) {
                  return;
                }
                setTitleText(event.target.value);
                debouncedSetPageTitle(tabIndex, event.target.value);
              }}
              style={{
                height: '1.9rem',
                marginBottom: -5,
                width: inputWidth,
                paddingLeft: 5,
                paddingRight: 5,
              }}
              placeholder='Page name...'
            />
          </form>
        )}
      </Tabs.Tab>
      {/* Outside the tab (itself a button): a button can't contain another. */}
      {!disabled && !editing && (
        <>
          <CleanIconButton
            description='Page actions'
            className={classnames('n-relative visible-on-tab-hover', {
              'open-menu': menuOpen,
            })}
            style={{ height: '1.1rem' }}
            onClick={(e) => {
              e.stopPropagation();
              setAnchorEl(e.currentTarget);
            }}
            size='small'
          >
            <EllipsisHorizontalIconOutline />
          </CleanIconButton>
          <Menu anchorRef={{ current: anchorEl }} isOpen={menuOpen} onClose={() => setAnchorEl(null)}>
            <Menu.Items>
              <Menu.Item
                leadingVisual={<PencilIconOutline />}
                title={'Edit name'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (editing) {
                    debouncedSetPageTitle(tabIndex, titleText);
                  }
                  !disabled && handleMenuEditClick(e);
                }}
              />
              <Menu.Item
                className='n-text-danger-text'
                leadingVisual={<TrashIconOutline />}
                title='Delete'
                onClick={(e) => {
                  e.stopPropagation();
                  !disabled && setDeleteModalOpen(true);
                }}
              />
            </Menu.Items>
          </Menu>
        </>
      )}
      <NeoDeletePageModal
        modalOpen={deleteModalOpen}
        onRemove={() => removePage(tabIndex)}
        handleClose={handleDeleteModalClose}
      />
    </div>
  );

  return content;
};

const mapDispatchToProps = (dispatch) => ({
  setPageTitle: (number: any, title: any) => {
    dispatch(setPageTitle(number, title));
  },
  removePage: (index: any) => {
    dispatch(removePageThunk(index));
  },
});

export default connect(null, mapDispatchToProps)(DashboardHeaderPageTitle);
