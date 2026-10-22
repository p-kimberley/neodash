import React from 'react';
import { SuggestInput } from '../../../../component/field/SuggestInput';
import { EditType } from '../GraphChartEditModal';

/**
 * Renders an auto-complete text field that uses either:
 * - The labels from the active Neo4j database.
 * - The relationship types from the active Neo4j database.
 * Typing searches; picking a suggestion sets the value.
 * TODO - check that the same database is used that the component has selected.
 */
export const LabelTypeAutocomplete = ({
  type,
  disabled,
  input,
  setInput,
  value,
  setValue,
  records,
  setRecords,
  queryCallback,
}) => {
  return (
    <SuggestInput
      label={type == EditType.Relationship ? 'Type' : 'Label'}
      placeholder='Start typing...'
      isDisabled={disabled}
      style={{ width: '100%', marginTop: '5px' }}
      suggestions={records.map((r) => (r._fields ? r._fields[0] : '(no data)'))}
      value={input}
      onChange={(text) => {
        setInput(text);
        if (type == EditType.Node) {
          queryCallback(
            'CALL db.labels() YIELD label WITH label as nodeLabel WHERE toLower(nodeLabel) CONTAINS toLower($input) RETURN DISTINCT nodeLabel LIMIT 5',
            { input: text },
            setRecords
          );
        } else {
          queryCallback(
            'CALL db.relationshipTypes() YIELD relationshipType WITH relationshipType as relType WHERE toLower(relType) CONTAINS toLower($input) RETURN DISTINCT relType LIMIT 5',
            { input: text },
            setRecords
          );
        }
      }}
      onPick={(picked) => {
        setInput(picked);
        setValue(picked);
      }}
      onBlur={() => setInput(value || '')}
    />
  );
};
