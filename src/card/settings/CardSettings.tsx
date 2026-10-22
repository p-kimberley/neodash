import React from 'react';
import { ReportItemContainer } from '../CardStyle';
import NeoCardSettingsHeader from './CardSettingsHeader';
import NeoCardSettingsContent from './CardSettingsContent';
import NeoCardSettingsFooter from './CardSettingsFooter';
import { CARD_HEADER_HEIGHT } from '../../config/CardConfig';

const NeoCardSettings = ({
  settingsOpen,
  closingSettings = undefined, // { current: 'save' | 'cancel' }: how the settings are closing
  pagenumber,
  reportId,
  query,
  database, // Current database related to the report
  databaseList, // List of databases the user can choose from ('system' is filtered out)
  width,
  height,
  type,
  reportSettings,
  reportSettingsOpen,
  fields,
  schema,
  heightPx,
  extensions, // A set of enabled extensions.
  onQueryUpdate,
  onDatabaseChanged, // When the database related to a report is changed it must be stored in the report state
  onRemovePressed,
  onClonePressed,
  onReportSettingUpdate,
  onToggleCardSettings,
  onCancelSettings = () => {},
  onTypeUpdate,
  setActive,
  onReportHelpButtonPressed,
  onToggleReportSettings,
  expanded,
  onToggleCardExpand,
}) => {
  const reportHeight = heightPx - CARD_HEADER_HEIGHT + 19;

  const cardSettingsHeader = (
    <NeoCardSettingsHeader
      expanded={expanded}
      onToggleCardExpand={onToggleCardExpand}
      onRemovePressed={onRemovePressed}
      onClonePressed={onClonePressed}
      onReportHelpButtonPressed={onReportHelpButtonPressed}
      onToggleCardSettings={(e) => {
        setActive(reportSettings.autorun !== undefined ? reportSettings.autorun : true);
        onToggleCardSettings(e);
      }}
      onCancelSettings={onCancelSettings}
    />
  );

  // TODO - instead of hiding everything based on settingsopen, only hide the components that slow down render (cypher editor)
  const cardSettingsContent = settingsOpen ? (
    <NeoCardSettingsContent
      closingSettings={closingSettings}
      pagenumber={pagenumber}
      reportId={reportId}
      query={query}
      database={database}
      reportSettings={reportSettings}
      width={width}
      height={height}
      type={type}
      extensions={extensions}
      databaseList={databaseList}
      onDatabaseChanged={onDatabaseChanged}
      onQueryUpdate={onQueryUpdate}
      onReportSettingUpdate={onReportSettingUpdate}
      onTypeUpdate={onTypeUpdate}
      forceRunQuery={onToggleCardSettings}
    ></NeoCardSettingsContent>
  ) : (
    <div className='nd-card-settings-content' />
  );

  const cardSettingsFooter = settingsOpen ? (
    <NeoCardSettingsFooter
      closingSettings={closingSettings}
      type={type}
      fields={fields}
      schema={schema}
      extensions={extensions}
      reportSettings={reportSettings}
      reportSettingsOpen={reportSettingsOpen}
      onToggleReportSettings={onToggleReportSettings}
      onReportSettingUpdate={onReportSettingUpdate}
    ></NeoCardSettingsFooter>
  ) : (
    <div></div>
  );

  return (
    <div
      className={`card-view n-bg-neutral-bg-weak n-text-neutral-text-default ${
        expanded ? 'expanded' : ''
      } n-overflow-y-auto n-h-full`}
    >
      {cardSettingsHeader}
      <ReportItemContainer style={{ height: reportHeight }} className='-n-mt-2'>
        {cardSettingsContent}
        {cardSettingsFooter}
      </ReportItemContainer>
    </div>
  );
};

export default NeoCardSettings;
