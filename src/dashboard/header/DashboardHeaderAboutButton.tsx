import React, { useState } from 'react';
import { connect } from 'react-redux';
import { Menu, CleanIconButton } from '@neo4j-ndl/react';
import {
  QuestionMarkCircleIconOutline,
  BookOpenIconOutline,
  InformationCircleIconOutline,
  ChartBarIconSolid,
} from '@neo4j-ndl/react/icons';

import { DASHBOARD_HEADER_BUTTON_COLOR } from '../../config/ApplicationConfig';
import StyleConfig from '../../config/StyleConfig';
import { getDashboardExtensions } from '../DashboardSelectors';
import { getExampleReports } from '../../extensions/ExtensionUtils';
import { NeoReportExamplesModal } from '../../modal/ReportExamplesModal';
import { enterHandler, openTab } from '../../utils/accessibility';
import { session } from '../../api/client';

type HelpMenuOpenEvent = React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>;

await StyleConfig.getInstance();

export const NeoAboutButton = ({ connection, onAboutModalOpen, extensions }) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const handleHelpMenuOpen = (event: HelpMenuOpenEvent) => {
    setAnchorEl(event.currentTarget);
  };
  const handleHelpMenuClose = () => {
    setAnchorEl(null);
  };
  const menuOpen = Boolean(anchorEl);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const openExamples = () => {
    setExamplesOpen(true);
    handleHelpMenuClose();
  };

  const menuAboutHandler = (e) => {
    onAboutModalOpen(e);
    handleHelpMenuClose();
  };

  return (
    <>
      <CleanIconButton
        description={'Help and documentation'}
        className='logo-btn n-p-1'
        style={DASHBOARD_HEADER_BUTTON_COLOR ? { color: DASHBOARD_HEADER_BUTTON_COLOR } : {}}
        size='large'
        onClick={handleHelpMenuOpen}
      >
        <QuestionMarkCircleIconOutline className='header-icon' />
      </CleanIconButton>
      <Menu
        anchorRef={{ current: anchorEl }}
        isOpen={menuOpen}
        onClose={handleHelpMenuClose}
        placement='bottom-end-top-end'
      >
        <Menu.Items>
          {/* The examples run free-form (synthetic) queries, which only editors may run. */}
          {session.me?.role === 'editor' ? (
            <Menu.Item
              title='Examples'
              onClick={openExamples}
              leadingVisual={<ChartBarIconSolid />}
              htmlAttributes={{ onKeyDown: (e) => enterHandler(e, openExamples) }}
            />
          ) : (
            <></>
          )}
          <Menu.Item
            onClick={() =>
              openTab(
                'https://github.com/neo4j-contrib/neodash/tree/master/docs/modules/ROOT/pages/user-guide/index.adoc'
              )
            }
            title={'Documentation'}
            leadingVisual={<BookOpenIconOutline />}
            htmlAttributes={{
              onKeyDown: (e) =>
                enterHandler(e, () =>
                  openTab(
                    'https://github.com/neo4j-contrib/neodash/tree/master/docs/modules/ROOT/pages/user-guide/index.adoc'
                  )
                ),
            }}
          />
          <Menu.Item
            title={'About'}
            onClick={menuAboutHandler}
            leadingVisual={<InformationCircleIconOutline />}
            htmlAttributes={{ onKeyDown: (e) => enterHandler(e, menuAboutHandler) }}
          />
        </Menu.Items>
      </Menu>
      {examplesOpen ? (
        <NeoReportExamplesModal
          open={examplesOpen}
          onClose={() => setExamplesOpen(false)}
          extensions={extensions}
          examples={getExampleReports(extensions)}
          database={connection.database}
        />
      ) : (
        <></>
      )}
    </>
  );
};

const mapStateToProps = (state) => ({
  extensions: getDashboardExtensions(state),
});

export default connect(mapStateToProps, null)(NeoAboutButton);
