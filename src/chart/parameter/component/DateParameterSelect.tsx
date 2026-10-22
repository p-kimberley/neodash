import React, { useEffect } from 'react';
import { ParameterSelectProps } from './ParameterSelect';
import NeoDatePicker from '../../../component/field/DateField';
import dayjs from 'dayjs';
import { Date as Neo4jDate } from 'neo4j-driver-core';
import { isCastableToNeo4jDate, isEmptyObject } from '../../ChartUtils';

function castPropsToBoltDate(dict) {
  if (isEmptyObject(dict)) {
    return undefined;
  }
  return new Neo4jDate(dict.year, dict.month, dict.day);
}

// An unset parameter shows an empty field: showing today's date made an inactive filter look active.
function castPropsToJsDate(dict) {
  if (dict === null || dict === undefined || dict === '' || isEmptyObject(dict)) {
    return null;
  }
  return dayjs(new Date(dict.year, dict.month - 1, dict.day));
}

const DatePickerParameterSelectComponent = (props: ParameterSelectProps) => {
  const defaultValue =
    props.settings && props.settings.defaultValue && props.settings.defaultValue.length > 0
      ? props.settings.defaultValue
      : dayjs();

  const [inputDate, setInputDate] = React.useState(castPropsToJsDate(props.parameterValue));
  const label = props?.settings?.entityType ? props.settings.entityType : '';
  const helperText = props?.settings?.helperText ? props.settings.helperText : '';
  const clearParameterOnFieldClear =
    props.settings && props.settings.clearParameterOnFieldClear ? props.settings.clearParameterOnFieldClear : false;
  const disabled = props?.settings?.disabled ? props.settings.disabled : false;

  const setParameterValue = (value) => {
    props.setParameterValue(castPropsToBoltDate(value));
  };
  //
  useEffect(() => {
    setInputDate(castPropsToJsDate(props.parameterValue));
  }, [props.parameterValue]);

  // If the user hasn't typed, and the parameter value mismatches the input value --> it was changed externally --> refresh the input value.
  // (Clearing is handled by the effect above, so a date being picked isn't reset while the parameter catches up.)
  const parameterDate = castPropsToJsDate(props.parameterValue);
  if (inputDate && parameterDate && isCastableToNeo4jDate(inputDate) && !inputDate.isSame(parameterDate)) {
    setInputDate(castPropsToJsDate(props.parameterValue));
  }

  return (
    <div style={{ width: '100%' }}>
      <NeoDatePicker
        label={helperText ? helperText : label}
        value={inputDate}
        disabled={disabled}
        onChange={(newValue) => {
          setInputDate(newValue);

          // Check whether the user has inputted a valid year. If not, do not update the parameter.
          if (!newValue || isNaN(newValue.$y) || isNaN(newValue.$m) || isNaN(newValue.$d)) {
            return;
          }
          if (newValue == null && clearParameterOnFieldClear) {
            setParameterValue(Neo4jDate.fromStandardDate(defaultValue.toDate()));
          } else if (newValue == null) {
            setParameterValue(undefined);
          } else if (newValue.isValid()) {
            setParameterValue(Neo4jDate.fromStandardDate(newValue.toDate()));
          }
        }}
      />
    </div>
  );
};

export default DatePickerParameterSelectComponent;
