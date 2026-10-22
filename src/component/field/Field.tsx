import React from 'react';
import { TextInput, TextArea, Select } from '@neo4j-ndl/react';

const textFieldStyle = { width: '155px', marginBottom: '10px', marginRight: '10px', marginLeft: '10px' };

const NeoField = ({
  label,
  valueLabel,
  value,
  style = textFieldStyle,
  choices = [],
  onChange,
  onClick = () => {},
  numeric = false,
  select = false,
  disabled = undefined,
  // The design system's inputs have no variants any more; callers may still pass one.
  variant: _variant = undefined,
  password = false,
  helperText = undefined,
  defaultValueLabel = undefined,
  defaultValue = undefined,
  multiline = false,
  placeholder = '',
  size = 'small' as 'small' | 'medium' | 'large',
}) => {
  return select === true ? (
    <div style={style}>
      <Select
        label={label}
        type='select'
        selectProps={{
          placeholder: placeholder,
          options: choices,
          onChange: (newValue) => onChange(newValue.value),
          value:
            value != null ? { label: valueLabel, value: value } : { label: defaultValueLabel, value: defaultValue },
          menuPlacement: 'auto',
          isDisabled: disabled,
          menuPortalTarget: document.querySelector('#overlay'),
        }}
        helpText={helperText}
        size={size}
      ></Select>
    </div>
  ) : multiline === true ? (
    <div style={style}>
      <TextArea
        key={label}
        label={label}
        helpText={helperText}
        isDisabled={disabled}
        value={value != null ? value : defaultValue}
        isFluid
        placeholder={placeholder}
        size={size}
        htmlAttributes={{
          onClick: (e) => {
            onClick(e.target.textContent);
          },
          onChange: (event) => {
            if (!numeric) {
              onChange(event.target.value);
            } else if (
              event.target.value.toString().length == 0 ||
              event.target.value.endsWith('.') ||
              event.target.value.startsWith('-')
            ) {
              onChange(event.target.value);
            } else if (!isNaN(event.target.value)) {
              onChange(Number(event.target.value));
            }
          },
        }}
      ></TextArea>
    </div>
  ) : (
    <div style={style}>
      <TextInput
        key={label}
        label={label}
        helpText={helperText}
        isDisabled={disabled}
        value={value != null ? value : defaultValue}
        isFluid
        onChange={(event) => {
          if (!numeric) {
            onChange(event.target.value);
          } else if (
            event.target.value.toString().length == 0 ||
            event.target.value.endsWith('.') ||
            event.target.value.startsWith('-')
          ) {
            onChange(event.target.value);
          } else if (!isNaN(event.target.value)) {
            onChange(Number(event.target.value));
          }
        }}
        placeholder={placeholder}
        size={size}
        htmlAttributes={{
          type: password ? 'password' : 'text',
          onClick: (e) => {
            onClick(e.target.textContent);
          },
        }}
      ></TextInput>
    </div>
  );
};

export default NeoField;
