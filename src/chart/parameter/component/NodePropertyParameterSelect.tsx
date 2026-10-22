import React, { useCallback, useEffect } from 'react';
import debounce from 'lodash/debounce';
import { Combobox, DismissibleTag, ReadOnlyTag } from '@neo4j-ndl/react';
import { ParameterSelectProps } from './ParameterSelect';
import { RenderSubValue } from '../../../report/ReportRecordProcessing';
import { SelectionConfirmationButton } from './SelectionConfirmationButton';
import NeoCodeViewerComponent from '../../../component/editor/CodeViewerComponent';
import { toNumber } from '../../ChartUtils';

const NodePropertyParameterSelectComponent = (props: ParameterSelectProps) => {
  const suggestionsUpdateTimeout =
    props.settings && props.settings.suggestionsUpdateTimeout ? props.settings.suggestionsUpdateTimeout : 250;
  const defaultValue =
    props.settings && props.settings.defaultValue && props.settings.defaultValue.length > 0
      ? props.settings.defaultValue
      : '';

  const disabled = props?.settings?.disabled ? props.settings.disabled : false;
  const getInitialValue = (value, multi) => {
    if (value && Array.isArray(value)) {
      return multi ? value : null;
    } else if (value) {
      return multi ? [value] : value;
    }
    return multi ? [] : value;
  };
  const { multiSelector, manualParameterSave } = props;
  const allParameters = props.allParameters ? props.allParameters : {};
  const [extraRecords, setExtraRecords] = React.useState([]);

  // The text typed into the selector's search, which the suggestions query receives as $input.
  const [searchText, setSearchText] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(getInitialValue(props.parameterDisplayValue, multiSelector));

  const [paramValueLocal, setParamValueLocal] = React.useState(props.parameterValue);
  const [paramValueDisplayLocal, setParamValueDisplayLocal] = React.useState(props.parameterDisplayValue);

  const debouncedQueryCallback = useCallback(debounce(props.queryCallback, suggestionsUpdateTimeout), []);
  const label = props.settings && props.settings.entityType ? props.settings.entityType : '';
  const multiSelectLimit = props.settings && props.settings.multiSelectLimit ? props.settings.multiSelectLimit : 5;
  const propertyType = props.settings && props.settings.propertyType ? props.settings.propertyType : '';
  const helperText = props.settings && props.settings.helperText ? props.settings.helperText : '';
  const clearParameterOnFieldClear =
    props.settings && props.settings.clearParameterOnFieldClear ? props.settings.clearParameterOnFieldClear : false;
  const autoSelectFirstValue =
    props.settings && props.settings.autoSelectFirstValue ? props.settings.autoSelectFirstValue : false;

  // index of the display value in the resulting extra records retrieved by the component when the user types. equals '1' for NeoDash 2.2.2 and later.
  const displayValueRowIndex = props.compatibilityMode
    ? 0
    : extraRecords[0]?.keys?.findIndex((e) => e.toLowerCase() == 'display') || 0;

  const realValueRowIndex = props.compatibilityMode ? 0 : 1 - displayValueRowIndex;

  const manualHandleParametersUpdate = () => {
    handleParametersUpdate(paramValueLocal, paramValueDisplayLocal, false);
  };
  const handleParametersUpdate = (value, displayValue, manual = false) => {
    setParamValueLocal(value);
    setParamValueDisplayLocal(displayValue);

    if (manual) {
      return;
    }

    props.setParameterValue(value);
    props.setParameterDisplayValue(displayValue);
  };
  const handleCrossClick = (isMulti, value) => {
    if (isMulti) {
      if (value !== null && value.length == 0 && clearParameterOnFieldClear) {
        setInputValue([]);
        handleParametersUpdate(undefined, undefined, manualParameterSave);
        return true;
      }
      if (value !== null && value.length == 0) {
        setInputValue([]);
        handleParametersUpdate([], [], manualParameterSave);
        return true;
      }
    } else {
      if (value && clearParameterOnFieldClear) {
        setInputValue(null);
        handleParametersUpdate(undefined, undefined, manualParameterSave);
        return true;
      }
      if (value == null) {
        setInputValue(null);
        handleParametersUpdate(defaultValue, defaultValue, manualParameterSave);
        return true;
      }
      return false;
    }
  };
  const propagateSelection = (event, newDisplay) => {
    const isMulti = Array.isArray(newDisplay);
    if (handleCrossClick(isMulti, newDisplay)) {
      return;
    }
    let newValue;
    let valReference = manualParameterSave ? paramValueLocal : props.parameterValue;
    let valDisplayReference = manualParameterSave ? paramValueDisplayLocal : props.parameterDisplayValue;
    // Multiple and new entry
    if (isMulti && inputValue !== null && newDisplay !== null && inputValue.length < newDisplay.length) {
      newValue = Array.isArray(valReference)
        ? [...valReference]
        : valReference && valReference !== null
          ? [valReference]
          : [];
      const newDisplayValue = [...newDisplay].slice(-1)[0];
      let val = extraRecords.filter((r) => r._fields[displayValueRowIndex].toString() == newDisplayValue)[0]._fields[
        realValueRowIndex
      ];
      if (newValue.low) {
        newValue.push(toNumber(val));
      } else {
        newValue.push(RenderSubValue(val));
      }
    } else if (!isMulti) {
      // if records are toStringed before comparison, toString the comparing variable
      const newDisplay2 = typeof newDisplay === 'boolean' ? newDisplay.toString() : newDisplay;
      newValue = extraRecords.filter((r) => (r?._fields?.[displayValueRowIndex]?.toString() || null) == newDisplay2)[0]
        ._fields[realValueRowIndex];

      newValue =
        (newValue.low && newValue.low != null) || newValue.low === 0 ? toNumber(newValue) : RenderSubValue(newValue);
    } else {
      let ele = valDisplayReference.filter((x) => !newDisplay.includes(x))[0];
      newValue = [...valReference];
      newValue.splice(valDisplayReference.indexOf(ele), 1);
    }

    newDisplay = newDisplay.low ? toNumber(newDisplay) : RenderSubValue(newDisplay);
    setInputValue(newDisplay);
    handleParametersUpdate(newValue, newDisplay, manualParameterSave);
  };

  // If we don't have an error message, render the selector:
  useEffect(() => {
    // Handle external updates of parameter values, with varying value types and parameter selector types.
    // Handles multiple scenarios if an external parameter changes type from value to lists.
    const isArray = Array.isArray(props.parameterDisplayValue);
    if (multiSelector) {
      if (isArray) {
        setInputValue(props.parameterDisplayValue);
      } else if (props.parameterDisplayValue !== '') {
        setInputValue([props.parameterDisplayValue]);
      } else {
        setInputValue([]);
      }
    } else {
      setInputValue(props.parameterDisplayValue);
    }
  }, [props.parameterDisplayValue]);

  // The query used to populate the selector is invalid.
  if (extraRecords && extraRecords[0] && extraRecords[0].error) {
    return (
      <NeoCodeViewerComponent
        value={`The parameter value retrieval query is invalid: \n${props.query}\n\nError message:\n${extraRecords[0].error}`}
      />
    );
  }

  // "false" will not be mapped to "(no data)"
  let options = extraRecords
    ?.map((r) => r?._fields?.[displayValueRowIndex])
    .map((f) => (f === undefined || f === null ? '(no data)' : f));
  options = props.autoSort ? options.sort() : options;

  // The combobox works with text; selections are mapped back to the query's values (numbers,
  // booleans...), so parameters keep their types.
  const text = (v) => (v === undefined || v === null ? '' : v.toString());
  const toOption = (v) => ({ label: text(v), value: text(v) });
  const fromOption = (option) => {
    const match = options.find((o) => text(o) === option.value);
    return match === undefined ? option.value : match;
  };
  const selected = multiSelector
    ? (Array.isArray(inputValue) ? inputValue : []).map(toOption)
    : inputValue !== undefined && inputValue !== null && text(inputValue) !== ''
      ? toOption(inputValue)
      : null;
  const selectedCount = Array.isArray(selected) ? selected.length : 0;

  const onOpenChange = (open) => {
    setIsOpen(open);
    if (open) {
      // Suggestions for what is typed (every value while nothing is).
      if (extraRecords && extraRecords.length == 0) {
        debouncedQueryCallback(props.query, { input: `${searchText}`, ...allParameters }, setExtraRecords);
      }
      return;
    }
    // Closed without choosing anything: we may want to auto-select the first value produced by the
    // selector query (`autoSelectFirstValue == true`).
    if (autoSelectFirstValue && paramValueDisplayLocal == '') {
      debouncedQueryCallback(props.query, { input: '', ...allParameters }, (records) => {
        if (records && records.length > 0 && records[0] && records[0]._fields) {
          let values = records?.map((r) => r?._fields?.[displayValueRowIndex] || '(no data)');
          values = props.autoSort ? values.sort() : values;
          setExtraRecords(records);
          propagateSelection(undefined, values[0]);
        }
      });
    }
  };

  return (
    <div className={'n-flex n-flex-row n-flex-wrap n-items-center'}>
      <Combobox
        label={helperText ? helperText : `${label} ${propertyType}`}
        placeholder='Start typing...'
        searchPlaceholder='Start typing...'
        className='nd-parameter-select'
        style={{
          maxWidth: 'calc(100% - 40px)',
          minWidth: `calc(100% - ${manualParameterSave ? '60' : '30'}px)`,
          marginLeft: '15px',
          marginTop: '5px',
        }}
        isDisabled={disabled}
        isClearable
        options={options.map(toOption)}
        searchValue={searchText}
        onSearchChange={(value) => {
          setSearchText(value);
          debouncedQueryCallback(props.query, { input: `${value}`, ...allParameters }, setExtraRecords);
        }}
        onOpenChange={onOpenChange}
        {...(multiSelector
          ? {
              isMulti: true as const,
              value: selected as { label: string; value: string }[],
              onChange: (values) => propagateSelection(undefined, values.map(fromOption)),
              // Tags wrap freely; while the list is closed, only the first `multiSelectLimit` show.
              maxRows: null,
              components: {
                MultiValue: ({ option, index, isDisabled, remove }) => {
                  if (!isOpen && index >= multiSelectLimit) {
                    return index === multiSelectLimit ? (
                      <ReadOnlyTag size='small'>+{selectedCount - multiSelectLimit}</ReadOnlyTag>
                    ) : null;
                  }
                  return isDisabled ? (
                    <ReadOnlyTag size='small'>{option.label}</ReadOnlyTag>
                  ) : (
                    <DismissibleTag size='small' onRemove={() => remove()}>
                      {option.label}
                    </DismissibleTag>
                  );
                },
              },
            }
          : {
              value: selected as { label: string; value: string } | null,
              onChange: (option) => propagateSelection(undefined, option ? fromOption(option) : null),
            })}
      />
      {manualParameterSave ? <SelectionConfirmationButton onClick={() => manualHandleParametersUpdate()} /> : <></>}
    </div>
  );
};

export default NodePropertyParameterSelectComponent;
