import React from 'react';
import ShowMoreText from '../../../component/text/ShowMoreText';
import { Checkbox, TextLink } from '@neo4j-ndl/react';
// import DOMPurify from 'dompurify';

export const formatProperty = (property) => {
  const str = property?.toString() || '';
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return (
      <TextLink href={str} type='external'>
        {str}
      </TextLink>
    );
  }
  return str;
};

/**
 * Component to render node/relationship properties in a table format
 */
export const GraphEntityInspectionTable = ({
  entity,
  setSelectedParameters = (_value) => {
    console.log('undefined function in GraphEntityInspectionTable');
  },
  checklistEnabled = false,
}) => {
  const [checkedParameters, setCheckedParameters] = React.useState<string[]>([]);
  const hasPropertyToShow = Object.keys(entity.properties).length > 0;
  if (!entity) {
    return <></>;
  }

  /**
   * Function to manage the click
   * @param parameter
   * @param checked
   */
  function handleCheckboxClick(parameter, checked) {
    let newCheckedParameters = [...checkedParameters];
    if (checked) {
      newCheckedParameters.push(parameter);
    } else {
      const index = newCheckedParameters.indexOf(parameter);
      if (index > -1) {
        newCheckedParameters.splice(index, 1);
      }
    }
    if (setSelectedParameters) {
      setCheckedParameters(newCheckedParameters);
      setSelectedParameters(newCheckedParameters);
    }
  }

  return (
    <table className='nd-props-table'>
      {hasPropertyToShow ? (
        <thead>
          <tr>
            <th scope='col'>Property</th>
            <th scope='col'>Value</th>
            {checklistEnabled ? <th scope='col'>Select Property</th> : <></>}
          </tr>
        </thead>
      ) : (
        <></>
      )}
      <tbody>
        {!hasPropertyToShow ? (
          <tr key='empty-row'>
            <th scope='row'>(No properties)</th>
          </tr>
        ) : (
          Object.keys(entity.properties)
            .sort()
            .map((key) => (
              <tr key={key}>
                <th scope='row'>{key}</th>
                <td>
                  <ShowMoreText lines={2}>{formatProperty(entity?.properties[key])}</ShowMoreText>
                </td>
                {checklistEnabled ? (
                  <td className='nd-props-table-check'>
                    <Checkbox
                      ariaLabel={`Select ${key}`}
                      isChecked={checkedParameters.includes(key)}
                      onChange={(event) => handleCheckboxClick(key, event.target.checked)}
                    />
                  </td>
                ) : (
                  <></>
                )}
              </tr>
            ))
        )}
      </tbody>
    </table>
  );
};

export default GraphEntityInspectionTable;
