import React, { useEffect } from 'react';
import { ParameterSelectProps } from './ParameterSelect';
import NeoDatePicker from '../../../component/field/DateField';
import { Date as Neo4jDate } from 'neo4j-driver-core';
import { isEmptyObject } from '../../ChartUtils';

function castPropsToBoltDate(dict) {
  if (isEmptyObject(dict)) {
    return undefined;
  }
  return new Neo4jDate(dict.year, dict.month, dict.day);
}

// An unset parameter shows an empty field: showing today's date made an inactive filter look active.
function castPropsToJsDate(dict): Date | null {
  if (dict === null || dict === undefined || dict === '' || isEmptyObject(dict)) {
    return null;
  }
  return new Date(dict.year, dict.month - 1, dict.day);
}

/** A configured default date ("YYYY-MM-DD"), as a local date; undefined if there is none. */
function parseDefaultDate(text): Date | undefined {
  const match = typeof text === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(text.trim()) : null;
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const DatePickerParameterSelectComponent = (props: ParameterSelectProps) => {
  const defaultDate = parseDefaultDate(props?.settings?.defaultValue);

  const [inputDate, setInputDate] = React.useState<Date | null>(castPropsToJsDate(props.parameterValue));
  const label = props?.settings?.entityType ? props.settings.entityType : '';
  const helperText = props?.settings?.helperText ? props.settings.helperText : '';
  const clearParameterOnFieldClear =
    props.settings && props.settings.clearParameterOnFieldClear ? props.settings.clearParameterOnFieldClear : false;
  const disabled = props?.settings?.disabled ? props.settings.disabled : false;

  const setParameterValue = (value) => {
    props.setParameterValue(castPropsToBoltDate(value));
  };

  useEffect(() => {
    setInputDate(castPropsToJsDate(props.parameterValue));
  }, [props.parameterValue]);

  // If the parameter value mismatches the input value, it was changed elsewhere: show the new value.
  // (Clearing is handled by the effect above, so a date being picked isn't reset while the parameter catches up.)
  const parameterDate = castPropsToJsDate(props.parameterValue);
  if (inputDate && parameterDate && !sameDay(inputDate, parameterDate)) {
    setInputDate(parameterDate);
  }

  return (
    <div style={{ width: '100%' }}>
      <NeoDatePicker
        label={helperText ? helperText : label}
        value={inputDate}
        disabled={disabled}
        onChange={(newValue) => {
          if (newValue === null) {
            // Cleared: the configured default comes back, unless the parameter should be cleared too
            // (as with the other parameter selectors).
            const restored = !clearParameterOnFieldClear && defaultDate ? defaultDate : null;
            setInputDate(restored);
            setParameterValue(restored ? Neo4jDate.fromStandardDate(restored) : undefined);
            return;
          }
          setInputDate(newValue);
          if (!isNaN(newValue.getTime())) {
            setParameterValue(Neo4jDate.fromStandardDate(newValue));
          }
        }}
      />
    </div>
  );
};

export default DatePickerParameterSelectComponent;
