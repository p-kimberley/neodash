import React, { useEffect } from 'react';
import debounce from 'lodash/debounce';
import { useCallback } from 'react';
import NeoCodeEditorComponent, {
  DEFAULT_CARD_SETTINGS_HELPER_TEXT_STYLE,
} from '../../component/editor/CodeEditorComponent';
import { getReportTypes } from '../../extensions/ExtensionUtils';
import { SelectField } from '../../component/field/SelectField';
import { EXTENSIONS_CARD_SETTINGS_COMPONENT } from '../../extensions/ExtensionConfig';
import { objMerge } from '../../utils/ObjectManipulation';
import NeoText2CypherQueryEditor from '../../text2cypher/component/OverrideCardQueryEditor';
import { text2cypherAvailable } from '../../text2cypher/util/Util';
import { AskAiBox } from '../../ai/AskAiBox';

const NeoCardSettingsContent = ({
  pagenumber,
  reportId,
  query,
  database, // Current report database
  databaseList, // List of databases the user can choose from ('system' is filtered out)
  reportSettings,
  type,
  extensions,
  onQueryUpdate,
  onReportSettingUpdate,
  onTypeUpdate,
  forceRunQuery, // Callback to force close the card settings.
  onDatabaseChanged, // When the database related to a report is changed it must be stored in the report state
}) => {
  // Ensure that we only trigger a text update event after the user has stopped typing.
  const [queryText, setQueryText] = React.useState(query);
  const debouncedQueryUpdate = useCallback(debounce(onQueryUpdate, 200), []);
  // State to manage the current database entry inside the form
  const [databaseText, setDatabaseText] = React.useState(database);
  const debouncedDatabaseUpdate = useCallback(debounce(onDatabaseChanged, 200), []);

  useEffect(() => {
    // Reset text to the dashboard state when the page gets reorganized.
    if (query !== queryText) {
      setQueryText(query);
    }
  }, [query]);

  const reportTypes = getReportTypes(extensions);
  const report = reportTypes[type];
  const SettingsComponent = report?.settingsComponent || {};

  function hasExtensionComponents() {
    return (
      Object.keys(EXTENSIONS_CARD_SETTINGS_COMPONENT).filter(
        (name) => extensions[name] && EXTENSIONS_CARD_SETTINGS_COMPONENT[name]
      ).length > 0
    );
  }

  function updateCypherQuery(value) {
    debouncedQueryUpdate(value);
    setQueryText(value);
  }

  function renderExtensionsComponents() {
    const res = (
      <>
        {Object.keys(EXTENSIONS_CARD_SETTINGS_COMPONENT).map((name) => {
          const Component = extensions[name] ? EXTENSIONS_CARD_SETTINGS_COMPONENT[name] : '';
          return Component ? (
            <Component
              pagenumber={pagenumber}
              reportId={reportId}
              reportType={type}
              extensions={extensions}
              onExecute={() => {
                onQueryUpdate(queryText);
                forceRunQuery();
              }}
              cypherQuery={queryText}
              updateCypherQuery={updateCypherQuery}
            />
          ) : (
            <></>
          );
        })}
      </>
    );
    return res;
  }

  const defaultQueryBoxComponent = (
    <>
      <NeoCodeEditorComponent
        value={queryText}
        editable={true}
        language={report?.inputMode || 'cypher'}
        onExecute={() => {
          onQueryUpdate(queryText);
          forceRunQuery();
        }}
        onChange={(value) => {
          updateCypherQuery(value);
        }}
        placeholder={`Enter Cypher here...`}
      />
      <div style={DEFAULT_CARD_SETTINGS_HELPER_TEXT_STYLE}>{report?.helperText || ''}</div>
    </>
  );

  return (
    <div className='nd-card-settings-content'>
      <SelectField
        label='Type'
        options={Object.keys(reportTypes).map((option) => ({
          label: reportTypes[option].label,
          value: reportTypes[option].label,
        }))}
        value={report?.label || ''}
        onChange={(label) =>
          label && onTypeUpdate(Object.keys(reportTypes).find((key) => reportTypes[key].label === label))
        }
        isSearchable
        className='nd-card-settings-select'
        htmlAttributes={{ 'data-test': 'type-dropdown', id: 'type' }}
      />

      {report?.disableDatabaseSelector == undefined ? (
        <SelectField
          label='Database'
          placeholder='neo4j'
          options={databaseList.map((database) => ({ label: database, value: database }))}
          value={databaseText}
          onChange={(database) => {
            if (database) {
              setDatabaseText(database);
              debouncedDatabaseUpdate(database);
            }
          }}
          className='nd-card-settings-select'
          htmlAttributes={{ id: 'databaseSelector' }}
        />
      ) : (
        <></>
      )}

      <br />
      <br />
      {/* Allow for overriding the code box with a custom component */}
      {report && report.settingsComponent ? (
        <SettingsComponent
          onReportSettingUpdate={onReportSettingUpdate}
          settings={objMerge({ helperText: report.helperText, inputMode: report.inputMode }, reportSettings)}
          database={database}
          query={query}
          onQueryUpdate={onQueryUpdate}
          onExecute={() => {
            onQueryUpdate(queryText);
            forceRunQuery();
          }}
        />
      ) : (
        <div>
          {/* With a language model on the server: Ask AI changes the whole report, and the query can also
              be written in English (query help only). */}
          {text2cypherAvailable() ? <AskAiBox reportId={reportId} /> : <></>}
          {text2cypherAvailable() ? (
            <NeoText2CypherQueryEditor
              pagenumber={pagenumber}
              reportId={reportId}
              reportType={type}
              extensions={extensions}
              cypherQuery={queryText}
              updateCypherQuery={updateCypherQuery}
            />
          ) : hasExtensionComponents() ? (
            renderExtensionsComponents()
          ) : (
            defaultQueryBoxComponent
          )}
        </div>
      )}
    </div>
  );
};

export default NeoCardSettingsContent;
