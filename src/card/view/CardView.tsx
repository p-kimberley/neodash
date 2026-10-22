import React, { useEffect, useState } from 'react';
import { ReportItemContainer } from '../CardStyle';
import NeoCardViewHeader from './CardViewHeader';
import NeoCardViewFooter from './CardViewFooter';
import NeoCodeEditorComponent from '../../component/editor/CodeEditorComponent';
import { CARD_FOOTER_HEIGHT, CARD_HEADER_HEIGHT } from '../../config/CardConfig';
import { DASHBOARD_SETTINGS } from '../../config/DashboardConfig';
import { getReportTypes } from '../../extensions/ExtensionUtils';
import NeoCodeViewerComponent from '../../component/editor/CodeViewerComponent';
import { NeoReportWrapper } from '../../report/ReportWrapper';
import { identifyStyleRuleParameters } from '../../extensions/styling/StyleRuleEvaluator';
import { CleanIconButton } from '@neo4j-ndl/react';
import { PlayCircleIconSolid } from '@neo4j-ndl/react/icons';
import { canViewAsTable, extensionEnabled } from '../../utils/ReportUtils';
import { objMerge } from '../../utils/ObjectManipulation';
import { REPORT_TYPES } from '../../config/ReportConfig';
import { EmptyReport, isUnconfigured } from './EmptyReport';
import { AiBuilderPanel } from '../../ai/AiBuilderPanel';
import { text2cypherAvailable } from '../../text2cypher/util/Util';

const NeoCardView = ({
  id,
  title,
  database,
  query,
  globalParameters,
  widthPx,
  heightPx,
  fields,
  extensions,
  active,
  setActive,
  onDownloadImage,
  type,
  selection,
  dashboardSettings,
  settings,
  updateReportSetting,
  createNotification,
  settingsOpen,
  editable,
  onGlobalParameterUpdate,
  onSelectionUpdate,
  onToggleCardSettings,
  onTitleUpdate,
  onFieldsUpdate,
  expanded,
  onToggleCardExpand,
  viewAsTable = false,
  onToggleViewAsTable = () => {},
  onRemovePressed = () => {},
  onClonePressed = () => {},
  onReportHelpButtonPressed = () => {},
}) => {
  // With field selectors below, the report stops where they start (they end 12px above the card's
  // edge); without, it fills the card down to its border.
  const reportHeight = heightPx - CARD_FOOTER_HEIGHT - CARD_HEADER_HEIGHT + 19;
  const reportHeightWithoutFooter = heightPx - CARD_HEADER_HEIGHT;
  const cardHeight = heightPx - CARD_FOOTER_HEIGHT - CARD_HEADER_HEIGHT + 95;
  const ref = React.useRef(undefined);

  const settingsSelector = Object.keys(
    Object.fromEntries(Object.entries(REPORT_TYPES[type]?.settings || {}).filter(([_, value]) => value.refresh))
  ).reduce((obj, key) => {
    return Object.assign(obj, {
      [key]: settings[key],
    });
  }, {});

  const [lastRunTimestamp, setLastRunTimestamp] = useState(Date.now());
  // Build with AI, open inside the (empty) report.
  const [aiOpen, setAiOpen] = useState(false);

  // TODO : selectorChange should handle every case where query execution needs to be re-executed
  // e.g. Change of query, type, some advanced settings...
  const [selectorChange, setSelectorChange] = useState(false);

  const getLocalParameters = (parse_string, drilldown = true): unknown => {
    if (!parse_string || !globalParameters) {
      return {};
    }

    let re = /(?:^|\W|%20)\$(\w+)(?!\w)/g;
    let match;

    // If the report styling extension is enabled, extend the list of local (relevant) parameters with those used by the style rules.
    const styleRules = settings.styleRules ? settings.styleRules : [];
    const styleParams = extensionEnabled(extensions, 'styling') ? identifyStyleRuleParameters(styleRules) : [];

    // Similarly, if the forms extension is enabled, extract nested parameters used by parameter selectors inside the form.
    const formFields = settings.formFields ? settings.formFields : [];
    const formsParams =
      drilldown && extensionEnabled(extensions, 'forms')
        ? formFields
            .map((f) => {
              return Object.keys(getLocalParameters(f.query, false));
            })
            .flat()
        : [];

    let localQueryVariables: string[] = [...styleParams, ...formsParams];
    while ((match = re.exec(parse_string))) {
      localQueryVariables.push(match[1]);
    }

    let params = Object.fromEntries(
      Object.entries(globalParameters).filter(([local]) => localQueryVariables.includes(local))
    );

    return settings.ignoreNonDefinedParams
      ? objMerge(Object.fromEntries(localQueryVariables.map((name) => [name, null])), params)
      : params;
  };

  const reportTypes = getReportTypes(extensions);
  // A report that isn't set up yet shows how to set it up instead of running.
  const unconfigured = isUnconfigured({ type, query, settings });
  const tableView = viewAsTable && !unconfigured && canViewAsTable(type, reportTypes);

  // @ts-ignore
  const reportHeader = (
    <NeoCardViewHeader
      title={title}
      editable={editable}
      description={settings.description}
      downloadImageEnabled={settings.downloadImageEnabled}
      refreshButtonEnabled={settings.refreshButtonEnabled}
      onTitleUpdate={onTitleUpdate}
      onToggleCardSettings={onToggleCardSettings}
      onManualRefreshCard={() => setLastRunTimestamp(Date.now())}
      settings={settings}
      onDownloadImage={onDownloadImage}
      onToggleCardExpand={onToggleCardExpand}
      expanded={expanded}
      canViewAsTable={active && !unconfigured && canViewAsTable(type, reportTypes)}
      viewAsTable={tableView}
      onToggleViewAsTable={onToggleViewAsTable}
      onRemovePressed={onRemovePressed}
      onClonePressed={onClonePressed}
      onReportHelpButtonPressed={onReportHelpButtonPressed}
      parameters={getLocalParameters(title)}
    ></NeoCardViewHeader>
  );

  // @ts-ignore
  const reportFooter = active ? (
    <NeoCardViewFooter
      fields={fields}
      settings={settings}
      extensions={extensions}
      selection={selection}
      type={type}
      onSelectionUpdate={onSelectionUpdate}
      showOptionalSelections={settings.showOptionalSelections}
      dashboardSettings={dashboardSettings}
    ></NeoCardViewFooter>
  ) : (
    <></>
  );

  const localParameters = { ...getLocalParameters(query), ...getLocalParameters(settings.drilldownLink) };
  const reportTypeHasNoFooter = reportTypes[type] && reportTypes[type].withoutFooter;
  // The table view has no use for the chart's field selectors.
  const withoutFooter =
    tableView ||
    unconfigured ||
    (reportTypeHasNoFooter
      ? reportTypes[type].withoutFooter
      : (reportTypes[type] && !reportTypes[type].selection) || (settings && settings.hideSelections));

  const getGlobalParameter = (key: string): unknown => {
    return globalParameters ? globalParameters[key] : undefined;
  };

  useEffect(() => {
    if (!settingsOpen) {
      setLastRunTimestamp(Date.now());
    }
  }, [JSON.stringify(localParameters)]);

  useEffect(() => {
    if (!settingsOpen && (selectorChange || type === 'select')) {
      setLastRunTimestamp(Date.now());
    }
    setSelectorChange(false);
  }, [settingsOpen]);

  useEffect(() => {
    setSelectorChange(true);
  }, [query, type, database, JSON.stringify(settingsSelector)]);

  const cardContentStyle = {
    paddingBottom: '0px',
    paddingLeft: '0px',
    paddingRight: '0px',
    paddingTop: '0px',
    width: '100%',
    // Starts below the title row (it used to overlap it by 9px, covering the buttons' lower edge).
    height: expanded
      ? withoutFooter
        ? 'calc(100% - 3px)'
        : `calc(100% - ${CARD_FOOTER_HEIGHT + 4}px)`
      : withoutFooter
        ? `${reportHeightWithoutFooter}px`
        : `${reportHeight}px`,
    overflow: 'auto',
  };
  const reportContent = (
    <div ref={ref} className='nd-card-content' style={cardContentStyle}>
      {unconfigured && aiOpen && editable ? (
        <AiBuilderPanel reportId={id} onClose={() => setAiOpen(false)} />
      ) : unconfigured ? (
        <EmptyReport
          editable={editable}
          onConfigure={onToggleCardSettings}
          onBuildWithAI={text2cypherAvailable() ? () => setAiOpen(true) : undefined}
        />
      ) : active ? (
        <NeoReportWrapper
          id={id}
          query={query}
          database={database}
          parameters={localParameters}
          lastRunTimestamp={lastRunTimestamp}
          extensions={extensions}
          disabled={settingsOpen}
          selection={selection}
          fields={fields}
          settings={settings}
          expanded={expanded}
          rowLimit={dashboardSettings.disableRowLimiting ? 1000000 : reportTypes[type] && reportTypes[type].maxRecords}
          dimensions={{ width: widthPx, height: heightPx }}
          type={type}
          ChartType={reportTypes[type] && reportTypes[type].component}
          viewAsTable={tableView}
          setGlobalParameter={onGlobalParameterUpdate}
          getGlobalParameter={getGlobalParameter}
          updateReportSetting={updateReportSetting}
          createNotification={createNotification}
          queryTimeLimit={dashboardSettings.queryTimeLimit || DASHBOARD_SETTINGS.queryTimeLimit.default}
          setFields={onFieldsUpdate}
        />
      ) : (
        <>
          <CleanIconButton
            description='Run'
            style={{ float: 'right', marginRight: '9px' }}
            onClick={() => {
              setActive(true);
            }}
          >
            <PlayCircleIconSolid className='n-w-5 n-h-5' aria-label={'play'} />
          </CleanIconButton>
          <NeoCodeEditorComponent
            value={query}
            language={'cypher'}
            editable={false}
            className='nd-code-editor-preview'
            onChange={() => {}}
            placeholder={'No query specified...'}
          />
        </>
      )}
    </div>
  );

  return (
    <div
      className={`card-view n-bg-neutral-bg-weak n-text-neutral-text-default ${expanded ? 'expanded' : ''}`}
      style={settings && settings.backgroundColor ? { backgroundColor: settings.backgroundColor } : {}}
    >
      {reportHeader}
      {/* if there's no selection for this report, we don't have a footer, so the report can be taller. */}
      <ReportItemContainer
        style={{
          height: expanded
            ? `calc(100% - ${withoutFooter ? CARD_HEADER_HEIGHT - 3 : CARD_HEADER_HEIGHT - 23}px)`
            : cardHeight,
        }}
      >
        {reportTypes[type] ? (
          reportContent
        ) : (
          <NeoCodeViewerComponent value={'Invalid report type. Are you missing an extension?'} />
        )}
        {reportTypes[type] && !tableView && !unconfigured ? reportFooter : <></>}
      </ReportItemContainer>
    </div>
  );
};

export default NeoCardView;
