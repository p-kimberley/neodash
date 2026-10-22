import React from 'react';
import { CardActions, FormControl, MenuItem, Select } from '@mui/material';
import { categoricalColorSchemes } from '../../config/ColorConfig';
import { getReportTypes } from '../../extensions/ExtensionUtils';
import { SELECTION_TYPES } from '../../config/CardConfig';
// The design system's select, distinct from Material UI's Select used for the colour schemes.
import { Select as NdlSelect } from '@neo4j-ndl/react';

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
    <CardActions className='nd-card-footer' disableSpacing>
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
              return (
                <div key={nodeLabel} className='nd-field-select'>
                  <label className='nd-field-select-label' id={`${nodeLabel}-label`}>
                    {nodeLabel}
                  </label>
                  <Select
                    labelId={`${nodeLabel}-label`}
                    id={nodeLabel}
                    size='small'
                    className='nd-field-select-input'
                    startAdornment={
                      <span className='nd-field-select-dot' style={{ backgroundColor: color }} aria-hidden />
                    }
                    onChange={(e) => onSelectionUpdate(nodeLabel, e.target.value)}
                    value={selection && selection[nodeLabel] ? selection[nodeLabel] : ''}
                  >
                    {/* Render choices */}
                    {properties.length &&
                      properties.map &&
                      properties.map((field) => {
                        return (
                          <MenuItem key={field} value={field}>
                            {field}
                          </MenuItem>
                        );
                      })}
                  </Select>
                </div>
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
              <FormControl key={index} size={'small'} className='nd-field-select'>
                <NdlSelect
                  label={selectableFields[selectable].label}
                  type='select'
                  selectProps={{
                    placeholder: selectableFields[selectable].multiple ? 'Select (multiple)' : 'Select',
                    onChange: (newValue) => {
                      if (newValue && selectableFields[selectable].multiple) {
                        onSelectionUpdate(
                          selectable,
                          newValue.map((v) => v.value)
                        );
                      } else {
                        onSelectionUpdate(selectable, newValue.value);
                      }
                    },
                    options: fieldsToRender.map((option) => ({ label: option, value: option })),
                    value: selectableFields[selectable].multiple
                      ? selection[selectable].map((sel) => ({ label: sel, value: sel }))
                      : { label: selection[selectable], value: selection[selectable] },
                    isMulti: selectableFields[selectable].multiple,
                    isClearable: false,
                    menuPortalTarget: document.querySelector('#overlay'),
                  }}
                  isFluid
                  style={{
                    minWidth: selectableFields[selectable].multiple ? 180 : 140,
                    display: 'inline-block',
                  }}
                  htmlAttributes={{ id: selectable }}
                ></NdlSelect>
              </FormControl>
            );
          }
        }
      })}
    </CardActions>
  );
};

export default NeoCardViewFooter;
