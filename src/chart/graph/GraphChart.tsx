import React, { useEffect, useMemo, useState } from 'react';
import useDimensions from 'react-cool-dimensions';
import { ChartProps } from '../Chart';
import { NeoGraphChartInfoPopup } from './component/GraphChartInfoPopup';
import { NeoGraphChartSearch, buildSearchIndex, findMatches } from './component/GraphChartSearch';
import { NeoGraphChartVisualization3D } from '../../extensions/advancedcharts/chart/graph3d/GraphChartVisualization3D';
import { NeoGraphChartVisualization2D } from './GraphChartVisualization2D';
import { NeoGraphChartDeepLinkButton } from './component/button/GraphChartDeepLinkButton';
import { NeoGraphChartCanvas } from './component/GraphChartCanvas';
import { NeoGraphChartLockButton } from './component/button/GraphChartLockButton';
import { NeoGraphChartFitViewButton } from './component/button/GraphChartFitViewButton';
import { buildGraphVisualizationObjectFromRecords } from './util/RecordUtils';
import { parseNodeIconConfig } from './util/NodeUtils';
import { GraphChartVisualizationProps, Link, layouts } from './GraphChartVisualization';
import { handleExpand } from './util/ExplorationUtils';
import { nodeSchemeColors } from '../echarts/theme';
import { IconButtonArray, CleanIconButton } from '@neo4j-ndl/react';

import { downloadCSV } from '../ChartUtils';
import { generateSafeColumnKey } from '../table/TableChart';
import { GraphChartContextMenu } from './component/GraphChartContextMenu';
import { getSettings } from '../SettingsUtils';
import { palettes } from '../../theme/palette';

import { getPageNumbersAndNamesList } from '../../extensions/advancedcharts/Utils';
import { CloudArrowDownIconOutline, CubeIconOutline, CubeTransparentIconOutline } from '@neo4j-ndl/react/icons';

/** Whether a colour setting is unset or still the built-in default (and so may follow the theme). */
const isDefault = (value: unknown, builtIn: string) =>
  value === undefined || value === null || value === '' || value === builtIn;

export interface GraphChartProps extends ChartProps {
  lockable?: boolean;
  component?: any;
}

const DEFAULT_VISUALIZATION_COMPONENT = NeoGraphChartVisualization2D;
const SEARCH_DEBOUNCE_MS = 150;

type GraphMode = '2d' | '3d';
const MODE_STORAGE_PREFIX = 'neodash.graph.mode.';

/** The 2D/3D view this browser last chose for a report, if any. */
const readStoredMode = (reportId?: string): GraphMode | undefined => {
  try {
    const stored = reportId ? window.localStorage.getItem(MODE_STORAGE_PREFIX + reportId) : null;
    return stored === '2d' || stored === '3d' ? stored : undefined;
  } catch (e) {
    return undefined;
  }
};

let webglSupport: boolean | undefined;
/** Whether this browser can render WebGL (3D graphs need it); checked once. */
const supportsWebGL = (): boolean => {
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
      webglSupport = Boolean(gl);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (e) {
      webglSupport = false;
    }
  }
  return webglSupport;
};

const storeMode = (reportId: string | undefined, mode: GraphMode, reportDefault: GraphMode) => {
  if (!reportId) {
    return;
  }
  try {
    if (mode === reportDefault) {
      window.localStorage.removeItem(MODE_STORAGE_PREFIX + reportId);
    } else {
      window.localStorage.setItem(MODE_STORAGE_PREFIX + reportId, mode);
    }
  } catch (e) {
    // Storage blocked: the choice simply isn't remembered.
  }
};

/**
 * Draws graph data using a force-directed-graph visualization.
 * This visualization is powered by `react-force-graph`.
 * See https://github.com/vasturiano/react-force-graph for examples on customization.
 */
const NeoGraphChart = (props: GraphChartProps) => {
  if (props.records == null || props.records.length == 0 || props.records[0].keys == null) {
    return <>No data, re-run the report.</>;
  }

  // Retrieve config from advanced settings
  const settings = getSettings(props.settings, props.extensions, props.getGlobalParameter);
  const lockable = props.lockable !== undefined ? props.lockable : true;
  const linkDirectionalParticles = props.settings && props.settings.relationshipParticles ? 5 : undefined;
  const arrowLengthProp = props?.settings?.arrowLengthProp ?? 3;
  let nodePositions = props.settings && props.settings.nodePositions ? props.settings.nodePositions : {};
  const parameters = props.parameters ? props.parameters : {};

  const setNodePositions = (positions) =>
    props.updateReportSetting && props.updateReportSetting('nodePositions', positions);
  const handleEntityClick = (item) => {
    setSelectedEntity(item);
    setContextMenuOpen(false);
    if (item !== undefined && settings.showPropertiesOnClick) {
      setInspectModalOpen(true);
    }
  };

  const handleEntityRightClick = (item, event) => {
    setSelectedEntity(item);
    setContextMenuOpen(true);
    setClickPosition({
      x: event.clientX,
      y: event.clientY,
    });
  };
  const frozen: boolean = props.settings && props.settings.frozen !== undefined ? props.settings.frozen : false;
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  // 2D/3D view: the report type's default (a "Graph (3D)" report starts in 3D), unless this browser
  // switched it.
  const reportMode: GraphMode = props.component === NeoGraphChartVisualization3D ? '3d' : '2d';
  const [chosenMode, setMode] = useState<GraphMode>(() => readStoredMode(props.id) ?? reportMode);
  // Without WebGL, graphs are drawn in 2D (on a canvas).
  const webgl = useMemo(supportsWebGL, []);
  const mode: GraphMode = webgl ? chosenMode : '2d';
  const Visualization = mode === '3d' ? NeoGraphChartVisualization3D : DEFAULT_VISUALIZATION_COMPONENT;
  const [searchText, setSearchText] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  // Whether the view has moved to the current match yet: the first Enter goes to the first match.
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState(undefined);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [clickPosition, setClickPosition] = useState({ x: 0, y: 0 });
  const [recenterAfterEngineStop, setRecenterAfterEngineStop] = useState(true);
  const [cooldownTicks, setCooldownTicks] = useState(100);

  let [nodeLabels, setNodeLabels] = useState({});
  let [linkTypes, setLinkTypes] = useState({});
  const [data, setData] = useState({ nodes: [] as Node[], links: [] as Link[] });

  const setLayoutFrozen = (value) => {
    if (value == false) {
      setCooldownTicks(100);
      setRecenterAfterEngineStop(true);
      setNodePositions({});
    }
    props.updateReportSetting && props.updateReportSetting('frozen', value);
  };

  const setGraph = (nodes, links) => {
    setData({ nodes: nodes, links: links });
  };
  const setNodes = (nodes) => {
    setData({ nodes: nodes, links: data.links });
  };
  const setLinks = (links) => {
    setData({ nodes: data.nodes, links: links });
  };

  let icons = parseNodeIconConfig(settings.iconStyle);
  const { theme } = props;
  const appearance = theme === 'dark' ? 'dark' : 'light';
  const themeColors = palettes[appearance];
  const colorScheme = nodeSchemeColors(settings.nodeColorScheme, appearance);

  const generateVisualizationDataGraph = (records, _) => {
    let nodes: Record<string, any>[] = [];
    let links: Record<string, any>[] = [];
    const extractedGraphFromRecords = buildGraphVisualizationObjectFromRecords(
      records,
      nodes,
      links,
      nodeLabels,
      linkTypes,
      colorScheme,
      props.fields,
      settings.nodeColorProp,
      settings.defaultNodeColor,
      settings.nodeSizeProp,
      settings.defaultNodeSize,
      settings.relWidthProp,
      settings.defaultRelWidth,
      settings.relColorProp,
      settings.defaultRelColor,
      settings.styleRules,
      nodePositions,
      frozen
    );
    setData(extractedGraphFromRecords);
  };

  const { observe, width, height } = useDimensions({
    onResize: ({ observe, unobserve }) => {
      unobserve(); // To stop observing the current target element
      observe(); // To re-start observing the current target element
    },
  });

  const pageNames = getPageNumbersAndNamesList();
  // Highlighting follows typing after a short pause, so a fast typist doesn't restyle the whole
  // graph on every keystroke.
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchText), searchText ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [searchText]);
  const nodeTextIndex = useMemo(() => buildSearchIndex(data.nodes), [data.nodes]);
  const searchMatches = useMemo(() => findMatches(nodeTextIndex, searchQuery), [nodeTextIndex, searchQuery]);
  const searchMatchSet = useMemo(() => new Set(searchMatches), [searchMatches]);
  useEffect(() => setSearchIndex(0), [searchMatches]);
  const chartProps: GraphChartVisualizationProps = {
    data: {
      nodes: data.nodes,
      nodeLabels: nodeLabels,
      links: data.links,
      linkTypes: linkTypes,
      parameters: parameters,
      setGraph: setGraph,
      setNodes: setNodes,
      setLinks: setLinks,
      setNodeLabels: setNodeLabels,
      setLinkTypes: setLinkTypes,
    },
    style: {
      width: width,
      height: height,
      // Default colours follow the appearance; colours an author picked explicitly are kept.
      backgroundColor: isDefault(settings.backgroundColor, '#fafafa') ? themeColors.surface : settings.backgroundColor,
      linkDirectionalParticles: linkDirectionalParticles,
      linkDirectionalArrowLength: arrowLengthProp,
      linkDirectionalParticleSpeed: settings.relationshipParticleSpeed ?? 0.005,
      nodeLabelFontSize: settings.nodeLabelFontSize,
      nodeLabelColor: isDefault(settings.nodeLabelColor, 'black') ? themeColors.text : settings.nodeLabelColor,
      // Captions get a halo in the background colour, so they read over nodes and relationships.
      nodeLabelHaloColor: isDefault(settings.backgroundColor, '#fafafa') ? themeColors.surface : settings.backgroundColor,
      relLabelFontSize: settings.relLabelFontSize,
      relLabelColor: isDefault(settings.relLabelColor, '#a0a0a0') ? themeColors.textMuted : settings.relLabelColor,
      defaultNodeSize: settings.defaultNodeSize,
      nodeIcons: icons,
      colorScheme: colorScheme,
      nodeColorProp: settings.nodeColorProp,
      defaultNodeColor: settings.defaultNodeColor,
      nodeSizeProp: settings.nodeSizeProp,
      relWidthProp: settings.relWidthProp,
      defaultRelWidth: settings.defaultRelWidth,
      relColorProp: settings.relColorProp,
      defaultRelColor: settings.defaultRelColor,
      theme: theme,
    },
    engine: {
      layout: layouts[settings.layout],
      graphDepthSep: settings.graphDepthSep,
      queryCallback: props.queryCallback,
      cooldownTicks: cooldownTicks,
      setCooldownTicks: setCooldownTicks,
      selection: props.selection,
      setSelection: () => {
        throw 'NotImplemented';
      },
      fields: props.fields,
      setFields: props.setFields,
      recenterAfterEngineStop: recenterAfterEngineStop,
      setRecenterAfterEngineStop: setRecenterAfterEngineStop,
    },
    interactivity: {
      enableExploration: settings.enableExploration,
      enableEditing: settings.enableEditing,
      layoutFrozen: frozen,
      setLayoutFrozen: setLayoutFrozen,
      nodePositions: nodePositions,
      setNodePositions: setNodePositions,
      showPropertiesOnHover: settings.showPropertiesOnHover,
      showPropertiesOnClick: settings.showPropertiesOnClick,
      showPropertyInspector: inspectModalOpen,
      setPropertyInspectorOpen: setInspectModalOpen,
      fixNodeAfterDrag: settings.fixNodeAfterDrag,
      handleExpand: handleExpand,
      setGlobalParameter: props.setGlobalParameter,
      setPageNumber: props.setPageNumber,
      pageNames: pageNames,
      onNodeClick: (item) => handleEntityClick(item),
      onNodeRightClick: (item, event) => handleEntityRightClick(item, event),
      onRelationshipClick: (item) => handleEntityClick(item),
      onRelationshipRightClick: (item, event) => handleEntityRightClick(item, event),
      drilldownLink: settings.drilldownLink,
      selectedEntity: selectedEntity,
      setSelectedEntity: setSelectedEntity,
      contextMenuOpen: contextMenuOpen,
      setContextMenuOpen: setContextMenuOpen,
      clickPosition: clickPosition,
      setClickPosition: setClickPosition,
      search: searchQuery.trim() ? { matches: searchMatchSet, current: searchMatches[searchIndex] } : undefined,
      createNotification: props.createNotification,
    },
    extensions: {
      styleRules: settings.styleRules,
      actionsRules: settings.actionsRules,
    },
  };

  // Steps through the search matches, centring the view on each.
  const stepSearch = (direction: 1 | -1) => {
    // Enter right after typing: use the text as typed, not the debounced query.
    if (searchQuery !== searchText) {
      setSearchQuery(searchText);
    }
    const matches = searchQuery === searchText ? searchMatches : findMatches(nodeTextIndex, searchText);
    if (matches.length === 0) {
      return;
    }
    let step: number = direction;
    if (!searchFocused) {
      step = direction === 1 ? 0 : -1;
    }
    const index = (searchIndex + step + matches.length) % matches.length;
    setSearchIndex(index);
    setSearchFocused(true);
    const node = data.nodes.find((n) => n.id === matches[index]);
    chartProps.interactivity.focusNode && chartProps.interactivity.focusNode(node);
  };

  const toggleMode = () => {
    const next: GraphMode = mode === '3d' ? '2d' : '3d';
    setMode(next);
    storeMode(props.id, next, reportMode);
    setContextMenuOpen(false);
    setInspectModalOpen(false);
    setRecenterAfterEngineStop(true);
    setCooldownTicks(100);
  };

  // When data is refreshed, rebuild the visualization data.
  useEffect(() => {
    generateVisualizationDataGraph(props.records, chartProps);
  }, [props.records]);

  // The default node colours have light and dark versions: on a change of appearance, nodes coloured
  // from the scheme swap to the other version in place, so the layout stays where it is.
  const previousScheme = React.useRef(colorScheme);
  useEffect(() => {
    const before = previousScheme.current;
    previousScheme.current = colorScheme;
    if (before === colorScheme || !data.nodes.length) {
      return;
    }
    data.nodes.forEach((node: any) => {
      const index = before.indexOf(node.color);
      if (index !== -1) {
        node.color = colorScheme[index % colorScheme.length];
      }
    });
    setData({ nodes: data.nodes, links: data.links });
  }, [appearance]);

  return (
    <div ref={observe} style={{ width: '100%', height: '100%' }}>
      <NeoGraphChartCanvas>
        <IconButtonArray
          isFloating
          orientation='horizontal'
          className='n-z-10 n-absolute n-bottom-2 n-right-4'
          htmlAttributes={{ 'aria-label': 'graph icon' }}
        >
          <GraphChartContextMenu {...chartProps} />
          <NeoGraphChartFitViewButton {...chartProps} />
          {webgl ? (
            <CleanIconButton
              description={mode === '3d' ? 'Show in 2D' : 'Show in 3D'}
              size='small'
              onClick={toggleMode}
            >
              {mode === '3d' ? <CubeTransparentIconOutline /> : <CubeIconOutline />}
            </CleanIconButton>
          ) : (
            <></>
          )}
          {/* Frozen layouts are 2D only. */}
          {lockable && settings.lockable && mode === '2d' ? <NeoGraphChartLockButton {...chartProps} /> : <></>}
          {settings.drilldownLink ? <NeoGraphChartDeepLinkButton {...chartProps} /> : <></>}
        </IconButtonArray>
        <NeoGraphChartSearch
          text={searchText}
          setText={(text) => {
            setSearchText(text);
            setSearchFocused(false);
          }}
          matches={searchMatches}
          current={searchIndex}
          onStep={stepSearch}
        />
        {!webgl && reportMode === '3d' ? (
          <div className='nd-graph-notice' role='status'>
            3D needs WebGL, which this browser doesn't provide: showing the graph in 2D.
          </div>
        ) : (
          <></>
        )}
        <Visualization {...chartProps} />
        <NeoGraphChartInfoPopup {...chartProps} />
        {settings.allowDownload && props.records && props.records.length > 0 ? (
          <IconButtonArray isFloating orientation='horizontal' className='n-z-10 n-absolute n-bottom-2 n-left-4'>
            <CleanIconButton
              description='Download CSV'
              size='small'
              onClick={() => {
                const rows = props.records.map((record, rownumber) => {
                  return Object.assign(
                    { id: rownumber },
                    ...record._fields.map((field, i) => ({ [generateSafeColumnKey(record.keys[i])]: field }))
                  );
                });
                downloadCSV(rows);
              }}
            >
              <CloudArrowDownIconOutline />
            </CleanIconButton>
          </IconButtonArray>
        ) : (
          <></>
        )}
      </NeoGraphChartCanvas>
    </div>
  );
};

export default NeoGraphChart;
