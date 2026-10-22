import React from 'react';
import { connect } from 'react-redux';
import { createColumnHelper, getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import { CleanIconButton, DataGrid } from '@neo4j-ndl/react';
import { PencilSquareIconOutline, TrashIconOutline } from '@neo4j-ndl/react/icons';
import ShowMoreText from '../../../component/text/ShowMoreText';
import { getModelExamples } from '../../state/QueryTranslatorSelector';
import { deleteModelExample } from '../../state/QueryTranslatorActions';

type Example = {
  question: string;
  answer: string;
};

const columnHelper = createColumnHelper<Example>();

/** The dashboard's example questions for Build with AI, five per page, each with Edit and Delete. */
function ExampleDisplayTable({ examples, deleteModelExample, handleEdit }) {
  const columns = React.useMemo(
    () => [
      columnHelper.accessor('question', {
        header: 'Question',
        cell: (info) => <ShowMoreText lines={3}>{info.getValue()}</ShowMoreText>,
        size: 300,
      }),
      columnHelper.accessor('answer', {
        header: 'Query',
        cell: (info) => (
          <code className='nd-example-query'>
            <ShowMoreText lines={3}>{info.getValue()}</ShowMoreText>
          </code>
        ),
        size: 400,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        size: 96,
        cell: ({ row }) => (
          <div className='n-flex n-justify-end n-w-full'>
            <CleanIconButton description='Edit example' size='small' onClick={() => handleEdit(row.index)}>
              <PencilSquareIconOutline />
            </CleanIconButton>
            <CleanIconButton
              description='Delete example'
              size='small'
              variant='danger'
              onClick={() => deleteModelExample(row.index)}
            >
              <TrashIconOutline />
            </CleanIconButton>
          </div>
        ),
      }),
    ],
    [handleEdit, deleteModelExample]
  );

  const table = useReactTable<Example>({
    data: examples,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 5 } },
  });

  return (
    <div className='n-mb-4'>
      <DataGrid
        tableInstance={table}
        isResizable={false}
        styling={{ borderStyle: 'horizontal', headerStyle: 'clean', hasHoverEffects: false }}
        components={{ RowsPerPage: null }}
      />
    </div>
  );
}

const mapStateToProps = (state) => ({
  examples: getModelExamples(state),
});

const mapDispatchToProps = (dispatch) => ({
  deleteModelExample: (index) => dispatch(deleteModelExample(index)),
});

export default connect(mapStateToProps, mapDispatchToProps)(ExampleDisplayTable);
