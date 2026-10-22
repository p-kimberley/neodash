import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { Link } from '../GraphChartVisualization';
import { Node } from '../GraphChartVisualization';

/**
 * Renders a tooltip above the user's cursor showing information on the selected node/relationship.
 */
export function getTooltip(entity: Node | Link) {
  const tooltip = (
    <div className='nd-graph-tooltip'>
      <b>{entity.labels ? (entity.labels.length > 0 ? entity.labels.join(', ') : 'Node') : entity.type}</b>
      {Object.keys(entity.properties).length == 0 ? (
        <i>(No properties)</i>
      ) : (
        <table className='nd-props-table'>
          <tbody>
            {Object.keys(entity.properties)
              .sort()
              .map((key) => (
                <tr key={key}>
                  <th scope='row'>{key}</th>
                  <td>
                    {entity.properties[key].toString().length <= 30
                      ? entity.properties[key].toString()
                      : `${entity.properties[key].toString().substring(0, 40)}...`}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
  return ReactDOMServer.renderToString(tooltip);
}
