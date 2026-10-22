import React from 'react';
import { connect } from 'react-redux';
import { SquaresPlusIconOutline } from '@neo4j-ndl/react/icons';

/**
 * Button to add a new report to the current page: a light dashed placeholder where the report
 * will go. A click adds a report of the default size there; a drag from it (or from any empty space)
 * draws the report at the size wanted.
 */
const NeoAddNewCard = ({ onCreatePressed, onPointerDown = (_e: React.PointerEvent) => {} }) => {
  return (
    <button
      type='button'
      className='add-report-card'
      aria-label='Add report'
      onClick={() => onCreatePressed()}
      onPointerDown={onPointerDown}
    >
      <SquaresPlusIconOutline className='n-w-7 n-h-7' aria-hidden />
      <span>Add report</span>
      <span className='add-report-card-hint'>or drag on empty space to draw one</span>
    </button>
  );
};

const mapStateToProps = () => ({});

const mapDispatchToProps = () => ({});

export default connect(mapStateToProps, mapDispatchToProps)(NeoAddNewCard);
