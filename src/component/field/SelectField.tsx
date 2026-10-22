import React from 'react';
import { Combobox } from '@neo4j-ndl/react';

/** A choice; its value can be any value (setting values include booleans and numbers). */
export type SelectFieldOption = { label: string; value: any };

const key = (value: any) => (value === undefined || value === null ? '' : String(value));

/**
 * A select on the design system's Combobox (its Select is deprecated). The combobox works with text
 * values, so options keep their own values here and those are what `onChange` receives. A search box
 * shows for longer lists. Without a visible label, `ariaLabel` names it for screen readers.
 */
export const SelectField = ({
  label,
  ariaLabel,
  options,
  value,
  valueLabel,
  onChange,
  isMulti = false,
  placeholder,
  isDisabled = false,
  isFluid = false,
  isClearable = false,
  isSearchable,
  size = 'small',
  helpText,
  style,
  className,
  htmlAttributes,
}: {
  label?: string;
  ariaLabel?: string;
  options: SelectFieldOption[];
  /** The selected value (or values, with `isMulti`). */
  value: any;
  /** The label shown for a value that isn't among the options. */
  valueLabel?: string;
  onChange: (value: any) => void;
  isMulti?: boolean;
  placeholder?: string;
  isDisabled?: boolean;
  isFluid?: boolean;
  isClearable?: boolean;
  isSearchable?: boolean;
  size?: 'large' | 'medium' | 'small';
  helpText?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  htmlAttributes?: React.HTMLAttributes<HTMLDivElement> & Record<string, any>;
}) => {
  const choices = (options || []).map((o) => ({ label: `${o.label ?? key(o.value)}`, value: key(o.value) }));
  const raw = (option) => (options || []).find((o) => key(o.value) === option.value)?.value ?? option.value;
  const toOption = (v, fallbackLabel?: string) => ({
    label: choices.find((c) => c.value === key(v))?.label ?? fallbackLabel ?? key(v),
    value: key(v),
  });
  const common = {
    label: label ?? ariaLabel ?? '',
    hasVisuallyHiddenLabel: !label,
    options: choices,
    placeholder,
    isDisabled,
    isFluid,
    isClearable,
    isSearchable: isSearchable ?? choices.length > 10,
    size,
    helpText,
    style,
    className,
    htmlAttributes,
  };
  if (isMulti) {
    return (
      <Combobox
        {...common}
        isMulti
        maxRows={null}
        value={(Array.isArray(value) ? value : []).map((v) => toOption(v))}
        onChange={(selected) => onChange(selected.map(raw))}
      />
    );
  }
  const hasValue = value !== undefined && value !== null && !(value === '' && !valueLabel);
  return (
    <Combobox
      {...common}
      value={hasValue ? toOption(value, valueLabel) : null}
      onChange={(selected) => onChange(selected ? raw(selected) : null)}
    />
  );
};

export default SelectField;
