import React from 'react';
import { connect } from 'react-redux';
import { SquaresPlusIconOutline } from '@neo4j-ndl/react/icons';

/**
 * Button to add a new report to the current page: a light dashed placeholder where the report
 * will go, clickable as a whole.
 */
const NeoAddNewCard = ({ onCreatePressed }) => {
  return (
    <button type='button' className='add-report-card' aria-label='Add report' onClick={() => onCreatePressed()}>
      <SquaresPlusIconOutline className='n-w-7 n-h-7' aria-hidden />
      <span>Add report</span>
    </button>
  );
};

const mapStateToProps = () => ({});

const mapDispatchToProps = () => ({});

export default connect(mapStateToProps, mapDispatchToProps)(NeoAddNewCard);
