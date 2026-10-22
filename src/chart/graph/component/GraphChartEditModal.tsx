import { GraphChartVisualizationProps } from '../GraphChartVisualization';
import React, { useEffect } from 'react';
import { PlusIconOutline, PlayIconOutline } from '@neo4j-ndl/react/icons';
import { FilledButton, IconButton, TextInput } from '@neo4j-ndl/react';
import { Dialog } from '../../../component/dialog/Dialog';
import { LabelTypeAutocomplete } from './autocomplete/LabelTypeAutocomplete';
import { DeletePropertyButton } from './button/modal/DeletePropertyButton';
import {
  handleNodeCreate,
  handleNodeDelete,
  handleNodeEdit,
  handleRelationshipCreate,
  handleRelationshipDelete,
  handleRelationshipEdit,
} from '../util/EditUtils';
import { PropertyNameAutocomplete } from './autocomplete/PropertyNameAutocomplete';

export enum EditType {
  Node = 0,
  Relationship = 1,
}

export enum EditAction {
  Create = 0,
  Edit = 1,
  Delete = 2,
}

interface GraphChartEditorVisualizationProps extends GraphChartVisualizationProps {
  type: EditType;
  action: EditAction;
  selectedNode: any;
  dialogOpen: any;
  setDialogOpen: any;
}

/**
 * The edit modal is a pop-up window that lets users change a node or relationship in the graph.
 * This is a generic component, that can be used for creating/editing/deleting either nodes or relationships, and their properties.
 */
export const GraphChartEditModal = (props: GraphChartEditorVisualizationProps) => {
  const [properties, setProperties] = React.useState([{ name: '', value: '' }]);
  const [labelRecords, setLabelRecords] = React.useState([]);
  const [labelInputText, setLabelInputText] = React.useState('');
  const [propertyRecords, setPropertyRecords] = React.useState([]);
  const [propertyInputTexts, setPropertyInputTexts] = React.useState([]);
  const [label, setLabel] = React.useState(undefined);

  // When the dialog gets opened, and we are editing, prepopulate the fields with current node/rel data in the database.
  useEffect(() => {
    if (
      props.dialogOpen &&
      props.interactivity.selectedEntity &&
      props.type == EditType.Node &&
      props.action == EditAction.Edit
    ) {
      const label = props.interactivity.selectedEntity.labels ? props.interactivity.selectedEntity.labels[0] : '';
      setLabelInputText(label);
      setLabel(label);
      const selectedProps = Object.keys(props.interactivity.selectedEntity.properties).map((prop) => {
        return { name: prop, value: props.interactivity.selectedEntity.properties[prop] };
      });
      setProperties(selectedProps);
      setPropertyInputTexts(selectedProps.map((p) => p.name));
    } else if (
      props.dialogOpen &&
      props.interactivity.selectedEntity &&
      props.type == EditType.Relationship &&
      props.action == EditAction.Edit
    ) {
      const { type } = props.interactivity.selectedEntity;
      setLabelInputText(type);
      setLabel(type);
      const selectedProps = Object.keys(props.interactivity.selectedEntity.properties).map((prop) => {
        return { name: prop, value: props.interactivity.selectedEntity.properties[prop] };
      });
      setProperties(selectedProps);
      setPropertyInputTexts(selectedProps.map((p) => p.name));
    } else if (props.dialogOpen) {
      setLabelInputText('');
      setLabel('');
    }
  }, [props.dialogOpen]);

  return (
    <Dialog
      size='large'
      isOpen={props.dialogOpen}
      onClose={() => {
        props.interactivity.setContextMenuOpen(false);
        props.setDialogOpen(false);
        setProperties([{ name: '', value: '' }]);
      }}
    >
      <Dialog.Header>
        {props.action == EditAction.Create ? 'Create' : 'Edit'} a{' '}
        {props.type == EditType.Node ? 'Node' : 'Relationship'}
      </Dialog.Header>

      <Dialog.Content>
        <div>
          <LabelTypeAutocomplete
            records={labelRecords}
            setRecords={setLabelRecords}
            value={label}
            setValue={setLabel}
            queryCallback={props.engine.queryCallback}
            type={props.type}
            input={labelInputText}
            setInput={setLabelInputText}
            disabled={props.type == EditType.Relationship && props.action == EditAction.Edit}
          />
          <h4 style={{ margin: '16px 0 8px' }}>Properties</h4>

          <table>
            <tbody>
              {properties.map((property, index) => {
                const disabled = !(
                  typeof property.value == 'string' ||
                  typeof property.value == 'number' ||
                  property.value.toNumber !== undefined
                );

                return (
                  <tr key={`trEditProp${index}`} style={{ height: 40 }}>
                    <td style={{ paddingLeft: '2px', paddingRight: '2px' }}>
                      <span>{index + 1}.</span>
                    </td>
                    <td style={{ paddingLeft: '5px', paddingRight: '5px' }}>
                      <PropertyNameAutocomplete
                        records={propertyRecords}
                        setRecords={setPropertyRecords}
                        values={properties}
                        setValues={setProperties}
                        queryCallback={props.engine.queryCallback}
                        index={index}
                        inputs={propertyInputTexts}
                        setInputs={setPropertyInputTexts}
                        disabled={disabled}
                      />
                    </td>
                    <td style={{ paddingLeft: '5px', paddingRight: '5px' }}>
                      <TextInput
                        key={`txtFieldEditProp${index}`}
                        size='small'
                        isFluid
                        placeholder='Value...'
                        isDisabled={disabled}
                        value={property.value}
                        htmlAttributes={{ 'aria-label': 'Property value' }}
                        onChange={(e) => {
                          const newProperties = [...properties];
                          newProperties[index].value = e.target.value;
                          setProperties(newProperties);
                        }}
                      />
                    </td>

                    <td>
                      <DeletePropertyButton
                        key={`deletePropBtn${index}`}
                        onClick={() => {
                          setProperties([...properties.slice(0, index), ...properties.slice(index + 1)]);
                          setPropertyInputTexts([
                            ...propertyInputTexts.slice(0, index),
                            ...propertyInputTexts.slice(index + 1),
                          ]);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}

              <tr key={'trEditButtons'}>
                <td style={{ minWidth: '450px' }} colSpan={4}>
                  <div className='n-flex n-justify-center n-my-2'>
                    <IconButton
                      description='Add property'
                      key={'btnAddProp'}
                      size='small'
                      onClick={() => {
                        const newProperty = { name: '', value: '' };
                        setProperties(properties.concat(newProperty));
                      }}
                    >
                      <PlusIconOutline />
                    </IconButton>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Dialog.Content>
      <Dialog.Actions>
        <FilledButton
          key={'btnEditProp'}
          isDisabled={label === undefined || label == '' || labelInputText !== label}
          onClick={() => {
            const newProperties = {};

            properties.map((prop) => {
              if (prop.name !== '' && prop.value !== '') {
                newProperties[prop.name] = prop.value;
              }
            });

            if (props.action == EditAction.Create && props.type == EditType.Node) {
              handleNodeCreate();
            } else if (props.action == EditAction.Create && props.type == EditType.Relationship) {
              handleRelationshipCreate(
                props.interactivity.selectedEntity,
                label,
                newProperties,
                props.selectedNode,
                props.engine,
                props.interactivity,
                props.data
              );
            } else if (props.action == EditAction.Edit && props.type == EditType.Node) {
              const labels = label.split(',').map((l) => l.trim());
              handleNodeEdit(props.interactivity.selectedEntity, labels, newProperties, props);
            } else if (props.action == EditAction.Edit && props.type == EditType.Relationship) {
              handleRelationshipEdit(props.interactivity.selectedEntity, newProperties, props);
            } else if (props.action == EditAction.Delete && props.type == EditType.Node) {
              handleNodeDelete();
            } else if (props.action == EditAction.Delete && props.type == EditType.Relationship) {
              handleRelationshipDelete();
            }
            props.setDialogOpen(false);
            setProperties([{ name: '', value: '' }]);
          }}
        >
          {props.action == EditAction.Create ? 'Create' : 'Save'}
          <PlayIconOutline className='btn-icon-base-r' />
        </FilledButton>
      </Dialog.Actions>
    </Dialog>
  );
};
