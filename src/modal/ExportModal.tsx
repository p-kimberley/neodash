import React from 'react';
import { connect } from 'react-redux';
import { IconButton } from '@neo4j-ndl/react';
import NeoDashboardSidebarExportModal from '../dashboard/sidebar/modal/DashboardSidebarExportModal';
import { getDashboardJson } from './ModalSelectors';
import { DocumentArrowDownIconOutline } from '@neo4j-ndl/react/icons';
/**
 * A modal to save a dashboard as a JSON text string.
 * The button to open the modal is intended to use in a drawer at the side of the page.
 */
export const NeoExportModal = ({ dashboard }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <IconButton description='Export' className='n-mx-1' onClick={() => setOpen(true)}>
        <DocumentArrowDownIconOutline />
      </IconButton>
      <NeoDashboardSidebarExportModal
        open={open}
        dashboard={dashboard}
        handleClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
};

const mapStateToProps = (state) => ({
  dashboard: getDashboardJson(state),
});

const mapDispatchToProps = () => ({});

export default connect(mapStateToProps, mapDispatchToProps)(NeoExportModal);
