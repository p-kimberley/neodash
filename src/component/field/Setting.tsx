import React from 'react';
import NeoField from './Field';
import { categoricalColorSchemes } from '../../config/ColorConfig';
import NeoColorPicker from './ColorPicker';
import { SELECTION_TYPES } from '../../config/CardConfig';

const generateListItem = (label, option) => {
  if (typeof option === 'boolean') {
    return { label: option ? 'on' : 'off', value: Boolean(option) };
  }
  if (label == 'Color Scheme' || label == 'Node Color Scheme') {
    const colorsFull = categoricalColorSchemes[option];
    const colors = Array.isArray(colorsFull)
      ? Array.isArray(colorsFull.slice(-1)[0])
        ? colorsFull.slice(-1)[0]
        : colorsFull
      : colorsFull;
    // The scheme's name, with its colours as a strip of swatches before it.
    return {
      label: `${option}`,
      value: option,
      leadingVisual: Array.isArray(colors) ? (
        <span className='nd-scheme-swatches' aria-hidden='true'>
          {colors.map((element, i) => (
            <span key={i} style={{ background: element }} />
          ))}
        </span>
      ) : undefined,
    };
  }
  return { label: option, value: option };
};

const generateValueLabel = (option) => {
  if (typeof option === 'boolean') {
    return option ? 'on' : 'off';
  }
  return option;
};

const generateValue = (option) => {
  if (typeof option === 'boolean') {
    return Boolean(option);
  }
  return option;
};

/**
 * A setting is a generic React component that is rendered dynamically based on the 'type'.
 */
const NeoSetting = ({
  value,
  choices,
  type,
  label,
  defaultValue,
  disabled = undefined,
  helperText = undefined,
  password = false,
  onChange,
  onClick = () => {},
  style = { width: '100%', marginBottom: '10px', marginRight: '10px', marginLeft: '10px' },
}) => {
  switch (type) {
    case SELECTION_TYPES.NUMBER:
      return (
        <div key={label} style={{ width: '100%', paddingRight: '28px' }}>
          <NeoField
            label={label}
            numeric={true}
            key={label}
            value={value}
            disabled={disabled}
            helperText={helperText}
            defaultValue={''}
            placeholder={`${defaultValue}`}
            style={style}
            onClick={(val) => onClick(val)}
            onChange={(val) => onChange(val)}
          />
        </div>
      );
    case SELECTION_TYPES.TEXT:
      return (
        <div key={label} style={{ width: '100%', paddingRight: '28px' }}>
          <NeoField
            label={label}
            key={label}
            disabled={disabled}
            helperText={helperText}
            value={value}
            password={password}
            defaultValue={''}
            placeholder={`${defaultValue}`}
            style={style}
            onClick={(val) => onClick(val)}
            onChange={(val) => onChange(val)}
          />
        </div>
      );
    case SELECTION_TYPES.MULTILINE_TEXT:
      return (
        <div key={label} style={{ width: '100%', paddingRight: '28px' }}>
          <NeoField
            label={label}
            key={label}
            disabled={disabled}
            helperText={helperText}
            value={value}
            defaultValue={''}
            placeholder={`${defaultValue}`}
            multiline={true}
            style={style}
            onClick={(val) => onClick(val)}
            onChange={(val) => onChange(val)}
          />
        </div>
      );
    case SELECTION_TYPES.DICTIONARY:
      return (
        <div key={label} style={{ width: '100%', paddingRight: '28px' }}>
          <NeoField
            label={label}
            key={label}
            disabled={disabled}
            helperText={helperText}
            value={JSON.stringify(value)}
            defaultValue={''}
            placeholder={defaultValue ? `${JSON.stringify(defaultValue)}` : '{}'}
            style={style}
            onClick={(val) => onClick(val)}
            onChange={(val) => onChange(val)}
          />
        </div>
      );
    case SELECTION_TYPES.LIST: {
      // Charts, graphs and maps draw the old default colour schemes ("set2", "neodash") with the default
      // one, so show them as such.
      const shown =
        (label === 'Color Scheme' && value === 'set2') || (label === 'Node Color Scheme' && value === 'neodash')
          ? 'default'
          : value;
      return (
        <div key={label} style={{ width: '100%', paddingRight: '28px' }}>
          <NeoField
            select
            label={label}
            disabled={disabled}
            helperText={helperText}
            key={label}
            valueLabel={generateValueLabel(shown)}
            value={generateValue(shown)}
            defaultValueLabel={generateValueLabel(defaultValue)}
            defaultValue={generateValue(defaultValue)}
            style={style}
            choices={choices.map((option) => generateListItem(label, option))}
            onClick={(val) => onClick(val)}
            onChange={(val) => onChange(val)}
          />
        </div>
      );
    }
    case SELECTION_TYPES.COLOR:
      return (
        <div key={label} style={{ width: '100%', paddingRight: '28px' }}>
          <NeoColorPicker
            label={label}
            key={label}
            disabled={disabled}
            defaultValue={defaultValue}
            value={value}
            onClick={(val) => onClick(val)}
            onChange={(val) => onChange(val)}
            style={style}
          ></NeoColorPicker>
        </div>
      );
    default:
      return <div key={label}></div>;
  }
};

export default NeoSetting;
