import * as React from 'react';
import { GraphChartVisualizationProps } from '../GraphChartVisualization';
import { Menu } from '@neo4j-ndl/react';
import { MagnifyingGlassCircleIconOutline, PencilIconOutline } from '@neo4j-ndl/react/icons';
import { RenderNode, RenderNodeChip, RenderRelationshipChip } from '../../../report/ReportRecordProcessing';
import { getNodeLabel } from '../util/NodeUtils';
import { EditAction, EditType, GraphChartEditModal } from './GraphChartEditModal';
import { handleExpand, handleGetNodeRelTypes } from '../util/ExplorationUtils';
import { useEffect } from 'react';
import { mergeDatabaseStatCountsWithCountsInView } from '../util/ExplorationUtils';
import { createPortal } from 'react-dom';

/**
 * Renders the context menu that is present when a user right clicks on a node or relationship in the graph.
 * The context menu can be used to inspect and edit nodes/relationships, or explore the graph.
 */
export const GraphChartContextMenu = (props: GraphChartVisualizationProps) => {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editableEntity, setEditableEntity] = React.useState(undefined);
  const [editableEntityType, setEditableEntityType] = React.useState(EditType.Node);
  const [action, setAction] = React.useState(EditAction.Create);
  const [neighbourRelCounts, setNeighbourRelCounts] = React.useState([]);
  // A zero-size element at the click, which the menu is placed against.
  const [anchor, setAnchor] = React.useState<HTMLDivElement | null>(null);
  const { contextMenuOpen, selectedEntity, clickPosition } = props.interactivity;
  const handleClose = () => {
    props.interactivity.setContextMenuOpen(false);
  };
  const dialogProps = { ...props, selectedNode: editableEntity, dialogOpen: dialogOpen, setDialogOpen: setDialogOpen };
  const expandable = selectedEntity && selectedEntity.labels !== undefined;
  const exploring = props.interactivity.enableExploration && expandable;

  // The neighbour counts for "Expand..." load as the menu opens, so they're ready in the submenu.
  useEffect(() => {
    setNeighbourRelCounts([]);
    if (!contextMenuOpen || !exploring) {
      return;
    }
    const id = selectedEntity?.id;
    // Virtual relationships do not have any neighbours
    if (id < 0) {
      return;
    }
    handleGetNodeRelTypes(id, props.engine, (records) =>
      setNeighbourRelCounts(mergeDatabaseStatCountsWithCountsInView(id, records, props.data.links))
    );
  }, [contextMenuOpen, selectedEntity]);

  const title = selectedEntity ? (expandable ? selectedEntity.labels.join(', ') : selectedEntity.type) : '';

  return (
    <>
      <GraphChartEditModal type={editableEntityType} action={action} {...dialogProps} />
      {contextMenuOpen
        ? createPortal(
            <div
              ref={setAnchor}
              aria-hidden='true'
              style={{ position: 'fixed', top: clickPosition.y, left: clickPosition.x, width: 0, height: 0 }}
            />,
            document.body
          )
        : null}
      <Menu
        anchorRef={{ current: anchor }}
        isOpen={contextMenuOpen && anchor !== null}
        onClose={handleClose}
        placement='bottom-start-top-start'
        minWidth={220}
        className='nd-graph-context-menu'
      >
        <Menu.CategoryItem>{title}</Menu.CategoryItem>
        <Menu.Item
          title='Inspect'
          leadingVisual={<MagnifyingGlassCircleIconOutline />}
          onClick={() => {
            props.interactivity.setContextMenuOpen(false);
            props.interactivity.setPropertyInspectorOpen(true);
          }}
        />
        {props.interactivity.enableEditing ? (
          <Menu.Item
            title='Edit'
            leadingVisual={<PencilIconOutline />}
            onClick={() => {
              setEditableEntityType(expandable ? EditType.Node : EditType.Relationship);
              setAction(EditAction.Edit);
              props.interactivity.setContextMenuOpen(false);
              setDialogOpen(true);
            }}
          />
        ) : (
          <></>
        )}
        {exploring ? (
          <Menu title='Expand...' className='nd-graph-context-submenu'>
            {neighbourRelCounts.length == 0 ? <Menu.Item title='No relationships...' isDisabled /> : <></>}
            {neighbourRelCounts.map((item, index) => {
              const dir = item[1] == 'any' ? undefined : item[1] == 'out';
              return (
                <Menu.Item
                  key={`expand-${index}`}
                  title={
                    <span className='nd-graph-context-path'>
                      {RenderNodeChip(selectedEntity.labels)}
                      {RenderRelationshipChip(item[0], dir)}
                      {RenderNodeChip('...')}
                    </span>
                  }
                  trailingContent={item[2]}
                  onClick={() => {
                    props.interactivity.setContextMenuOpen(false);
                    handleExpand(selectedEntity.id, item[0], item[1], props);
                    setDialogOpen(false);
                  }}
                />
              );
            })}
          </Menu>
        ) : (
          <></>
        )}
        {props.interactivity.enableEditing && expandable ? (
          <Menu title='Create relationship...' className='nd-graph-context-submenu'>
            {props.data &&
              props.data.nodes.map((node, index) => (
                <Menu.Item
                  key={`create-${index}`}
                  title={RenderNode(node, false)}
                  trailingContent={
                    props.engine.selection[node.mainLabel] ? getNodeLabel(props.engine.selection, node) : ''
                  }
                  onClick={() => {
                    setEditableEntityType(EditType.Relationship);
                    setAction(EditAction.Create);
                    setEditableEntity(node);
                    props.interactivity.setContextMenuOpen(false);
                    setDialogOpen(true);
                  }}
                />
              ))}
          </Menu>
        ) : (
          <></>
        )}
      </Menu>
    </>
  );
};
