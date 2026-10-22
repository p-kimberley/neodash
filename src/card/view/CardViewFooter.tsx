import React from 'react';
import { categoricalColorSchemes } from '../../config/ColorConfig';
import { getReportTypes } from '../../extensions/ExtensionUtils';
import { SELECTION_TYPES } from '../../config/CardConfig';
// The design system's select, distinct from Material UI's Select used for the colour schemes.
import { Combobox } from '@neo4j-ndl/react';

const NeoCardViewFooter = ({
  fields,
  settings,
  selection,
  type,
  extensions,
  showOptionalSelections,
  onSelectionUpdate,
}) => {
  /**
   * For each selectable field in the visualization, give the user an option to select them from the query output fields.
   */
  const reportTypes = getReportTypes(extensions);
  const selectableFields = reportTypes[type].selection;
  const selectables = selectableFields ? Object.keys(selectableFields) : [];
  const nodeColorScheme = settings && settings.nodeColorScheme ? settings.nodeColorScheme : 'neodash';
  const hideSelections = settings && settings.hideSelections ? settings.hideSelections : false;
  const { ignoreLabelColors } = reportTypes[type];
  if (!fields || fields.length == 0 || hideSelections) {
    return <div></div>;
  }
  return (
    <div className='nd-card-footer'>
      {selectables.map((selectable, index) => {
        const selectionIsMandatory = !selectableFields[selectable].optional;

        // Creates the component for node property selections.
        if (selectableFields[selectable].type == SELECTION_TYPES.NODE_PROPERTIES) {
          // Only show optional selections if we explicitly allow it.
          if (showOptionalSelections || selectionIsMandatory) {
            const totalColors = categoricalColorSchemes[nodeColorScheme]
              ? categoricalColorSchemes[nodeColorScheme].length
              : 0;
            const fieldSelections = fields.map((field, i) => {
              // TODO logically, it should be the last element in the field (node labels) array, as that is typically
              // the most specific node label when we have multi-labels
              const nodeLabel = field[0];
              // TODO this convention that we have for storing node labels and properties in fields should be documented
              // , and probably even converted to a generic type.
              const discoveredProperties = field.slice(1);
              const properties = (discoveredProperties ? [...discoveredProperties].sort() : []).concat([
                '(label)',
                '(id)',
                '(no label)',
              ]);
              const color =
                totalColors > 0 && !ignoreLabelColors
                  ? categoricalColorSchemes[nodeColorScheme][i % totalColors]
                  : 'var(--nd-border-strong)';
              // Same look as the other field selectors: caption above, outlined compact select. The
              // node label's colour is shown as a dot, so the legend role is kept.
              const value = selection && selection[nodeLabel] ? selection[nodeLabel] : '';
              return (
                <Combobox
                  key={nodeLabel}
                  label={nodeLabel}
                  size='small'
                  className='nd-field-select'
                  isSearchable={properties.length > 10}
                  options={properties.map((property) => ({ label: property, value: property }))}
                  value={value ? { label: value, value: value } : null}
                  onChange={(option) => option && onSelectionUpdate(nodeLabel, option.value)}
                  components={{
                    SingleValue: ({ option }) => (
                      <span className='nd-field-select-value'>
                        <span className='nd-field-select-dot' style={{ backgroundColor: color }} aria-hidden />
                        {option.label}
                      </span>
                    ),
                  }}
                />
              );
            });
            return fieldSelections;
          }
        }
        // Creates the selection for all other types of components
        if (
          selectableFields[selectable].type == SELECTION_TYPES.LIST ||
          selectableFields[selectable].type == SELECTION_TYPES.NUMBER ||
          selectableFields[selectable].type == SELECTION_TYPES.NUMBER_OR_DATETIME ||
          selectableFields[selectable].type == SELECTION_TYPES.TEXT
        ) {
          if (selectionIsMandatory || showOptionalSelections) {
            const sortedFields = fields ? [...fields].sort() : [];

            const fieldsToRender = selectionIsMandatory ? sortedFields : sortedFields.concat(['(none)']);
            return (
              <Combobox
                key={index}
                label={selectableFields[selectable].label}
                size='small'
                className='nd-field-select'
                isSearchable={fieldsToRender.length > 10}
                placeholder={selectableFields[selectable].multiple ? 'Select (multiple)' : 'Select'}
                options={fieldsToRender.map((option) => ({ label: option, value: option }))}
                {...(selectableFields[selectable].multiple
                  ? {
                      isMulti: true as const,
                      value: (selection[selectable] || []).map((sel) => ({ label: sel, value: sel })),
                      onChange: (values) =>
                        onSelectionUpdate(
                          selectable,
                          values.map((v) => v.value)
                        ),
                    }
                  : {
                      value:
                        selection[selectable] !== undefined
                          ? { label: selection[selectable], value: selection[selectable] }
                          : null,
                      onChange: (option) => option && onSelectionUpdate(selectable, option.value),
                    })}
                htmlAttributes={{ id: selectable }}
                style={{ minWidth: selectableFields[selectable].multiple ? 180 : 140 }}
              />
            );
          }
        }
      })}
    </div>
  );
};

export default NeoCardViewFooter;
