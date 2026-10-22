import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Checkbox, CleanIconButton, DataGrid, FilledButton, Popover, TextInput, toast } from '@neo4j-ndl/react';
import { CloudArrowDownIconOutline, FunnelIconOutline } from '@neo4j-ndl/react/icons';
import { ChartProps } from '../Chart';
import {
  evaluateRulesOnDict,
  evaluateSingleRuleOnDict,
  generateCssBasedOnRules,
  useStyleRules,
} from '../../extensions/styling/StyleRuleEvaluator';
import { downloadCSV } from '../ChartUtils';
import { getRendererForValue, rendererForType, RenderSubValue } from '../../report/ReportRecordProcessing';
import {
  getRule,
  executeActionRule,
  getPageNumbersAndNamesList,
  performActionOnElement,
} from '../../extensions/advancedcharts/Utils';
import { extensionEnabled } from '../../utils/ReportUtils';
import { getCheckboxes, hasCheckboxes, updateCheckBoxes } from './TableActionsHelper';
import { SelectField } from '../../component/field/SelectField';

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_STORAGE_PREFIX = 'neodash.table.pageSize.';

/** The rows-per-page this browser chose for a table, if it was chosen under the table's current setting. */
const readStoredPageSize = (reportId: string | undefined, configured: number): number | undefined => {
  if (!reportId) {
    return undefined;
  }
  try {
    const stored = JSON.parse(window.localStorage.getItem(PAGE_SIZE_STORAGE_PREFIX + reportId) ?? 'null');
    return stored && stored.configured === configured && stored.pageSize > 0 ? stored.pageSize : undefined;
  } catch (e) {
    // Storage blocked or unreadable: fall back to the report's setting.
    return undefined;
  }
};

/** Remembers (or with no size, forgets) this browser's rows-per-page for a table. */
const storePageSize = (reportId: string | undefined, configured: number, pageSize: number | undefined) => {
  if (!reportId) {
    return;
  }
  try {
    const key = PAGE_SIZE_STORAGE_PREFIX + reportId;
    if (pageSize === undefined || pageSize === configured) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify({ pageSize, configured }));
    }
  } catch (e) {
    // Storage blocked: the choice simply isn't remembered.
  }
};
const HIDDEN_COLUMN_PREFIX = '__';
const fallbackRenderer = (value) => {
  return JSON.stringify(value);
};

function renderAsButtonWrapper(renderer) {
  return function renderAsButton(value) {
    const outputValue = renderer(value, true);
    // If there's nothing to be rendered, there's no button needed.
    if (outputValue == '') {
      return <></>;
    }
    return (
      <FilledButton size='small' isFluid>
        {outputValue}
      </FilledButton>
    );
  };
}

/** How a column renders its values (and whether they are numbers), from a sample value. */
function columnRendering(value, asAction) {
  const renderer = getRendererForValue(value) ?? rendererForType.string;
  const renderValue = renderer?.renderValue ?? fallbackRenderer;
  return {
    type: renderer?.type,
    // Renderers take the cell's value as { value }.
    render: (v) => (asAction ? renderAsButtonWrapper(renderValue) : renderValue)({ value: v }),
  };
}

/** Text for filtering: what a reader would recognise in the cell. */
const filterText = (value): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(filterText).join(' ');
  }
  if (typeof value === 'object') {
    if (value.properties) {
      const name = value.labels ? value.labels.join(' ') : (value.type ?? '');
      return [name, ...Object.values(value.properties).map(filterText)].join(' ');
    }
    if (value.toString !== Object.prototype.toString) {
      return value.toString();
    }
    return JSON.stringify(value);
  }
  return String(value);
};

/** A value to sort by: numbers (including Neo4j integers) as numbers, everything else as text. */
const sortValue = (value): number | string => {
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof value.toNumber === 'function' && value.low !== undefined) {
    return value.toNumber();
  }
  return filterText(value).toLowerCase();
};

const compareValues = (a, b) => {
  const x = sortValue(a);
  const y = sortValue(b);
  if (typeof x === 'number' && typeof y === 'number') {
    return x - y;
  }
  // Numbers before text, then text in natural order.
  if (typeof x === 'number') {
    return -1;
  }
  if (typeof y === 'number') {
    return 1;
  }
  return x.localeCompare(y, undefined, { numeric: true });
};

export const generateSafeColumnKey = (key) => {
  return key != 'id' ? key : `${key} `;
};

type Row = Record<string, any> & { id: number };

/** The filter for one column, opened from the column's menu. */
const ColumnFilter = ({ anchor, label, value, onChange, onClose }) => {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <Popover
      isOpen={anchor !== null}
      anchorElement={anchor}
      onOpenChange={(open) => !open && onClose()}
      // Typing goes straight into the filter.
      initialFocus={input}
    >
      <Popover.Content className='nd-table-filter'>
        <TextInput
          ref={input}
          label={`Filter ${label}`}
          size='small'
          isFluid
          isClearable
          value={value}
          placeholder='Contains...'
          onChange={(e) => onChange(e.target.value)}
          htmlAttributes={{
            onKeyDown: (e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                onClose();
              }
            },
          }}
        />
      </Popover.Content>
    </Popover>
  );
};

export const NeoTableChart = (props: ChartProps) => {
  const transposed = props.settings && props.settings.transposed ? props.settings.transposed : false;
  const wrapContent = props.settings && props.settings.wrapContent ? props.settings.wrapContent : false;
  const allowDownload =
    props.settings && props.settings.allowDownload !== undefined ? props.settings.allowDownload : false;

  const actionsRules =
    extensionEnabled(props.extensions, 'actions') && props.settings && props.settings.actionsRules
      ? props.settings.actionsRules
      : [];
  const compact = props.settings && props.settings.compact !== undefined ? props.settings.compact : false;
  const styleRules = useStyleRules(
    extensionEnabled(props.extensions, 'styling'),
    props.settings.styleRules,
    props.getGlobalParameter
  );

  // The rule styles are scoped to this table.
  const scope = `nd-table-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ruleCss = useMemo(() => generateCssBasedOnRules(styleRules, scope), [styleRules, scope]);

  const columnWidthsType =
    props.settings && props.settings.columnWidthsType ? props.settings.columnWidthsType : 'Relative (%)';
  const relativeWidths = columnWidthsType == 'Relative (%)';
  let columnWidths = null;
  try {
    columnWidths = props.settings && props.settings.columnWidths && JSON.parse(props.settings.columnWidths);
  } catch (e) {
    // do nothing
  }

  const { records } = props;
  const hasData = !(records == null || records.length == 0 || records[0].keys == null);

  const actionableFields = actionsRules.filter((r) => r.condition !== 'rowCheck').map((r) => r.field);

  // Columns: their field (key in a row), header, a sample value (for the renderer) and width.
  const columnSpecs: { field: string; header: string; sample: any; width: number }[] = !hasData
    ? []
    : transposed
      ? [records[0].keys[0]].concat(records.map((record) => record._fields[0]?.toString() || '')).map((key, i) => ({
          field: generateSafeColumnKey(`${String(key)}_${i}`),
          header: generateSafeColumnKey(key),
          sample: key,
          width: columnWidths && i < columnWidths.length ? columnWidths[i] : relativeWidths ? 1 : 100,
        }))
      : records[0].keys.map((key, i) => ({
          field: generateSafeColumnKey(key),
          header: generateSafeColumnKey(key),
          sample: records[0].get(key),
          width: columnWidths && i < columnWidths.length ? columnWidths[i] : relativeWidths ? 1 : 100,
        }));

  // Rows per page: the report's setting (default 25), unless this browser picked another size for this
  // table, which is remembered in localStorage until the report's setting changes.
  const configuredPageSize =
    props.settings && Number(props.settings.pageSize) > 0
      ? Math.floor(Number(props.settings.pageSize))
      : DEFAULT_PAGE_SIZE;
  const [pagination, setPagination] = useState(() => ({
    pageSize: readStoredPageSize(props.id, configuredPageSize) ?? configuredPageSize,
    pageIndex: 0,
  }));
  const lastConfiguredPageSize = React.useRef(configuredPageSize);
  useEffect(() => {
    // The author changed the setting: it replaces any size remembered for this table. (Compared with
    // the last value rather than skipping the first run, which React's strict mode runs twice.)
    if (lastConfiguredPageSize.current === configuredPageSize) {
      return;
    }
    lastConfiguredPageSize.current = configuredPageSize;
    storePageSize(props.id, configuredPageSize, undefined);
    setPagination({ pageSize: configuredPageSize, pageIndex: 0 });
  }, [configuredPageSize]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [filterOpen, setFilterOpen] = useState<{ column: string; anchor: HTMLElement } | null>(null);
  // Columns whose names start with "__" are hidden.
  const columnVisibility = useMemo(
    () =>
      Object.fromEntries(
        columnSpecs.filter((c) => c.field.startsWith(HIDDEN_COLUMN_PREFIX)).map((c) => [c.field, false])
      ),
    [JSON.stringify(columnSpecs.map((c) => c.field))]
  );

  const getTransposedRows = (records) => {
    // Skip first key
    const rowKeys = [...records[0].keys];
    rowKeys.shift();

    // Add values in rows
    const rowsWithValues = rowKeys.map((key, i) =>
      Object.assign(
        { id: i, Field: key },
        ...records.map((record, j) => ({
          // Note the true here is for the rendered to know we are inside a transposed table
          // It will be needed for rendering the records properly, if they are arrays
          [`${record._fields[0]}_${j + 1}`]: RenderSubValue(record._fields[i + 1], true),
        }))
      )
    );

    // Add field in rows
    return rowsWithValues.map((row, i) => ({
      ...row,
      [`${records[0].keys[0]}_${0}`]: rowKeys[i],
    }));
  };

  const rows: Row[] = !hasData
    ? []
    : transposed
      ? getTransposedRows(records)
      : records.map((record, rownumber) => {
          return Object.assign(
            { id: rownumber },
            ...record._fields.map((field, i) => ({ [generateSafeColumnKey(record.keys[i])]: field }))
          );
        });

  const pageNames = getPageNumbersAndNamesList();
  const checkboxes = hasCheckboxes(actionsRules);
  // Checked rows follow the parameters the checkboxes set (they may change elsewhere too).
  const rowSelection: RowSelectionState = Object.fromEntries(
    checkboxes ? getCheckboxes(actionsRules, rows, props.getGlobalParameter).map((id) => [`${id}`, true]) : []
  );

  const columns: ColumnDef<Row>[] = columnSpecs.map((spec) => {
    const { type, render } = columnRendering(spec.sample, actionableFields.includes(spec.header));
    return {
      id: spec.field,
      accessorFn: (row) => row[spec.field],
      header: spec.header,
      cell: (info) => <span className='nd-table-cell-value'>{render(info.getValue())}</span>,
      // Relative widths are weights (the grid shares out the width in proportion); fixed ones are px.
      size: relativeWidths ? Math.max(1, Number(spec.width) || 1) * 100 : Math.max(40, Number(spec.width) || 100),
      minSize: relativeWidths ? 1 : 40,
      sortingFn: (a, b, id) => compareValues(a.getValue(id), b.getValue(id)),
      filterFn: (row, id, text) => filterText(row.getValue(id)).toLowerCase().includes(`${text}`.toLowerCase()),
      meta: {
        isNumber: type === 'number',
        columnActions: {
          hasDefaultSortingActions: true,
          actions: [
            {
              title: 'Filter...',
              leadingVisual: <FunnelIconOutline />,
              onClick: () => {
                // Below the column's header.
                const header = document.querySelector(`.${scope} [data-column-id="${CSS.escape(spec.field)}"]`);
                setFilterOpen({ column: spec.field, anchor: header as HTMLElement });
              },
            },
          ],
        },
      } as any,
    };
  });

  const selectColumn: ColumnDef<Row> = {
    id: '__select',
    header: ({ table }) => (
      <Checkbox
        ariaLabel='Select all rows'
        isChecked={table.getIsAllRowsSelected()}
        isIndeterminate={table.getIsSomeRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        ariaLabel={`Select row ${row.index + 1}`}
        isChecked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
    size: 48,
    minSize: 48,
    maxSize: 48,
    enableSorting: false,
    enableColumnFilter: false,
  };

  const table = useReactTable<Row>({
    data: rows,
    columns: checkboxes ? [selectColumn, ...columns] : columns,
    getRowId: (row) => `${row.id}`,
    state: { pagination, sorting, columnFilters, columnVisibility, rowSelection },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      if (next.pageSize !== pagination.pageSize) {
        storePageSize(props.id, configuredPageSize, next.pageSize);
      }
      setPagination(next);
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    enableRowSelection: checkboxes,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      const selected = Object.keys(next)
        .filter((id) => next[id])
        .map((id) => Number(id));
      updateCheckBoxes(actionsRules, rows, selected, props.setGlobalParameter);
    },
    autoResetPageIndex: false,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Back to the first page when the data changes or a filter narrows the rows.
  useEffect(() => {
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, [records, columnFilters]);

  // The grid's parts are made once, so they keep their state (e.g. an open picker) across renders;
  // they read this render's values from `live`.
  const live = React.useRef<any>({});
  const components = useMemo(
    () => ({
      BodyRow: ({ row, ...rest }) => (
        <DataGrid.BodyRow {...rest} row={row} className={live.current.rowClass(row.original as Row)} />
      ),
      BodyCell: ({ cell, ...rest }) => {
        const field = cell.column.id;
        if (field === '__select') {
          return <DataGrid.BodyCell {...rest} cell={cell} />;
        }
        const numeric = (cell.column.columnDef.meta as any)?.isNumber;
        return (
          <DataGrid.BodyCell
            {...rest}
            cell={cell}
            className={`${numeric ? 'nd-table-number' : ''} ${live.current.cellClass(field, cell.getValue(), cell.row.original as Row)}`}
            htmlAttributes={{
              onClick: () => live.current.onCellClick(cell),
              onDoubleClick: () => live.current.onCellDoubleClick(cell),
            }}
          />
        );
      },
      HeaderCell: ({ cell, ...rest }) => (
        <DataGrid.HeaderCell
          {...rest}
          cell={cell}
          className={(cell.column.columnDef.meta as any)?.isNumber ? 'nd-table-number' : undefined}
          htmlAttributes={{ 'data-column-id': cell.column.id } as any}
        />
      ),
      HeaderTitle: ({ cell, ...rest }) => (
        <span className='nd-table-header-title'>
          <DataGrid.HeaderTitle {...rest} cell={cell} />
          {cell.column.getIsFiltered() ? (
            <FunnelIconOutline className='nd-table-filter-mark' aria-label='Filtered' />
          ) : (
            <></>
          )}
        </span>
      ),
      TableResults: () => (
        <div className='nd-table-results'>
          {live.current.allowDownload && live.current.rows.length > 0 ? (
            <CleanIconButton description='Download CSV' size='small' onClick={() => downloadCSV(live.current.rows)}>
              <CloudArrowDownIconOutline />
            </CleanIconButton>
          ) : (
            <></>
          )}
          <DataGrid.TableResults />
        </div>
      ),
      RowsPerPage: () => (
        <div className='nd-table-page-size'>
          <span aria-hidden>Rows per page</span>
          <SelectField
            ariaLabel='Rows per page'
            options={live.current.pageSizeOptions.map((size) => ({ label: `${size}`, value: size }))}
            value={live.current.pageSize}
            onChange={(size) => size && live.current.setPageSize(Number(size))}
          />
        </div>
      ),
    }),
    []
  );

  if (!hasData) {
    return <>No data, re-run the report.</>;
  }

  // What the action rules receive for a cell (the shape the previous table gave them).
  const cellEvent = (cell) => ({ field: cell.column.id, value: cell.getValue(), row: cell.row.original });

  // Style rule classes: rows for the row rules, cells for the cell rules (a cell rule may test another
  // field of the row than the one it colours).
  const rowClass = (row: Row) =>
    ['row color', 'row text color'].map((e) => `rule${evaluateRulesOnDict(row, styleRules, [e])}`).join(' ');
  const cellClass = (field: string, value, row: Row) =>
    ['cell color', 'cell text color']
      .map((e) => {
        for (const [index, rule] of styleRules.entries()) {
          let ruleClass = '';
          if (rule.targetField) {
            if (rule.targetField === field) {
              ruleClass = `rule${evaluateSingleRuleOnDict({ [rule.field]: row[rule.field] }, rule, index, [e])}`;
            }
          } else {
            ruleClass = `rule${evaluateSingleRuleOnDict({ [field]: value }, rule, index, [e])}`;
          }
          // rule-1 means the rule doesn't apply.
          if (ruleClass && ruleClass !== 'rule-1') {
            return ruleClass;
          }
        }
        return '';
      })
      .join(' ');

  const pageSizeOptions = Array.from(new Set([10, 25, 50, 100, configuredPageSize, pagination.pageSize])).sort(
    (a, b) => a - b
  );
  live.current = {
    rowClass,
    cellClass,
    rows,
    allowDownload,
    pageSizeOptions,
    pageSize: pagination.pageSize,
    setPageSize: (size: number) => table.setPageSize(size),
    onCellClick: (cell) =>
      performActionOnElement(cellEvent(cell), actionsRules, { ...props, pageNames: pageNames }, 'Click', 'Table'),
    onCellDoubleClick: (cell) => {
      const event = cellEvent(cell);
      let rules = getRule(event, actionsRules, 'doubleClick');
      if (rules !== null) {
        rules.forEach((rule) => executeActionRule(rule, event, { ...props, pageNames: pageNames }, 'table'));
      } else {
        navigator.clipboard?.writeText(filterText(event.value));
        toast.neutral('Value copied to clipboard.', { isCloseable: true });
      }
    },
  };
  const filterColumn = filterOpen ? columnSpecs.find((c) => c.field === filterOpen.column) : undefined;
  const filterValue = filterOpen ? ((table.getColumn(filterOpen.column)?.getFilterValue() as string) ?? '') : '';

  return (
    <div className={`nd-table ${wrapContent ? 'nd-table-wrap' : 'nd-table-nowrap'}`}>
      {ruleCss ? <style>{ruleCss}</style> : <></>}
      <DataGrid
        className={scope}
        tableInstance={table}
        isResizable={!relativeWidths}
        isAutoResizingColumns={relativeWidths}
        styling={{ isCompact: compact, borderStyle: 'horizontal', headerStyle: 'clean', hasHoverEffects: true }}
        components={components}
      />
      {filterOpen && filterColumn ? (
        <ColumnFilter
          anchor={filterOpen.anchor}
          label={filterColumn.header}
          value={filterValue}
          onChange={(text) => table.getColumn(filterOpen.column)?.setFilterValue(text || undefined)}
          onClose={() => setFilterOpen(null)}
        />
      ) : (
        <></>
      )}
    </div>
  );
};

export default NeoTableChart;
