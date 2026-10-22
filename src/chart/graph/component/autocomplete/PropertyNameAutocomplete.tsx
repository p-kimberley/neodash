import React from 'react';
import { SuggestInput } from '../../../../component/field/SuggestInput';

/**
 * Renders an auto-complete text field for property identifiers. Typing searches the database's
 * property keys; picking one sets the property's name.
 * TODO - check that the same database is used that the component has selected.
 */
export const PropertyNameAutocomplete = ({
  disabled,
  index,
  inputs,
  setInputs,
  values,
  setValues,
  records,
  setRecords,
  queryCallback,
}) => {
  const setInput = (text) => {
    const newPropertyInputTexts = [...inputs];
    newPropertyInputTexts[index] = text;
    setInputs(newPropertyInputTexts);
  };
  return (
    <SuggestInput
      ariaLabel='Property name'
      placeholder='Name...'
      isDisabled={disabled}
      isFluid={false}
      style={{ display: 'inline-block', width: 170 }}
      suggestions={records.map((r) => (r._fields ? r._fields[0] : '(no data)'))}
      value={inputs[index] ?? ''}
      onChange={(text) => {
        setInput(text);
        queryCallback(
          'CALL db.propertyKeys() YIELD propertyKey as propertyName WITH propertyName WHERE toLower(propertyName) CONTAINS toLower($input) RETURN DISTINCT propertyName LIMIT 5',
          { input: text },
          setRecords
        );
      }}
      onPick={(picked) => {
        setInput(picked);
        const newProperties = [...values];
        newProperties[index].name = picked;
        setValues(newProperties);
      }}
      onBlur={() => setInput(values[index]?.name || '')}
    />
  );
};
