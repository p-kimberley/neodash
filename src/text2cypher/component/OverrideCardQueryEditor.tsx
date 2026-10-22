import React, { useCallback, useContext, useEffect } from 'react';
import { connect } from 'react-redux';
import { Switch, OutlinedButton } from '@neo4j-ndl/react';
import NeoCodeEditorComponent, {
  DEFAULT_CARD_SETTINGS_HELPER_TEXT_STYLE,
} from '../../component/editor/CodeEditorComponent';
import { getReportTypes } from '../../extensions/ExtensionUtils';
import { queryTranslationThunk } from '../state/QueryTranslatorThunks';
import { Neo4jContext, Neo4jContextState } from '../../api/Neo4jContext';
import debounce from 'lodash/debounce';
import { updateLastMessage } from '../state/QueryTranslatorActions';
import { createNotification } from '../../application/ApplicationActions';
import { getHistoryPerCard, getLastMessage, QUERY_TRANSLATOR_EXTENSION_NAME } from '../state/QueryTranslatorSelector';
import { getDatabase } from '../../settings/SettingsSelectors';
import { api } from '../../api/client';
import { LoadingSpinner } from '@neo4j-ndl/react';
import { TEXT2CYPHER_LOADING_ICON } from './LoadingIcon';
import {
  deleteSessionStoragePrepopulationReportFunction,
  setSessionStoragePrepopulationReportFunction,
} from '../../extensions/state/ExtensionActions';
import { getPrepopulateReportExtension } from '../../extensions/state/ExtensionSelectors';
import { docsUrl } from '../../utils/docs';
import { text2cypherAvailable } from '../util/Util';

// TODO: right now if we change the database in the cardSelector, it should forgot the card history
export const NeoOverrideCardQueryEditor = ({
  pagenumber,
  reportId,
  cypherQuery,
  extensions,
  reportType,
  updateCypherQuery,
  lastMessage,
  prepopulateExtensionName,
  translateQuery,
  updateEnglishQuery,
  displayError,
  displayDescribeError,
  setPrepopulationReportFunction,
  deletePrepopulationReportFunction,
  history = [],
  database,
}) => {
  enum Language {
    ENGLISH,
    CYPHER,
  }

  // States
  const [language, setLanguage] = React.useState(Language.CYPHER);
  const [runningTranslation, setRunningTranslation] = React.useState(false);
  const [englishQuestion, setEnglishQuestion] = React.useState('');
  const [needsUpdate, setNeedsUpdate] = React.useState(true);
  const [describing, setDescribing] = React.useState(false);
  const debouncedEnglishQuestionUpdate = useCallback(debounce(updateEnglishQuery, 250), []);
  const { driver } = useContext<Neo4jContextState>(Neo4jContext);

  useEffect(() => {
    // Reset text to the dashboard state when the page gets reorganized.
    if (lastMessage !== englishQuestion) {
      setEnglishQuestion(lastMessage);
    }
  }, [lastMessage]);

  const reportTypes = getReportTypes(extensions);

  const cypherEditor = (
    <NeoCodeEditorComponent
      value={cypherQuery}
      editable={true}
      language={reportTypes[reportType]?.inputMode || 'cypher'}
      onChange={(value) => updateCypherQuery(value)}
      placeholder={`Enter Cypher here...`}
    />
  );

  // Without a language model on the server, the query is written in Cypher only.
  if (!text2cypherAvailable()) {
    return (
      <div>
        {cypherEditor}
        <div style={DEFAULT_CARD_SETTINGS_HELPER_TEXT_STYLE}>{reportTypes[reportType]?.helperText}</div>
      </div>
    );
  }

  function updateEnglishQuestion(value) {
    debouncedEnglishQuestionUpdate(pagenumber, reportId, value);
    setEnglishQuestion(value);
    if (needsUpdate) {
      updateCypherQuery(`${cypherQuery} `);
      setNeedsUpdate(false);
    }
  }

  // To prevent a bug with the code editor component, we wrap it in an extra enclosing bracket.
  const englishEditor = (
    <div>
      <NeoCodeEditorComponent
        value={englishQuestion}
        editable={true}
        language={'markdown'}
        onChange={(value) => {
          setPrepopulationReportFunction(reportId);
          updateEnglishQuestion(value);
        }}
        style={{ border: '1px dashed darkgrey' }}
        placeholder={`Enter English here...`}
      />
    </div>
  );

  /**
   * Switching to English shows the query in plain English (written by the model), to read or change
   * and translate back. A question that produced exactly this query is kept as it is.
   */
  async function switchToEnglish() {
    setLanguage(Language.ENGLISH);
    const query = `${cypherQuery ?? ''}`.trim();
    const last: any = Array.isArray(history) ? history[history.length - 1] : undefined;
    const questionMatches = last && `${last.query ?? ''}`.trim() === query && lastMessage;
    if (!query || questionMatches) {
      return;
    }
    setDescribing(true);
    try {
      const { text } = await api.aiDescribe({ query, database: database || undefined });
      setEnglishQuestion(text);
      updateEnglishQuery(pagenumber, reportId, text);
      // The description can be translated straight back (or changed first).
      setPrepopulationReportFunction(reportId);
    } catch (e: any) {
      displayDescribeError(e?.message ?? String(e));
    } finally {
      setDescribing(false);
    }
  }

  function triggerTranslation() {
    setRunningTranslation(true);
    translateQuery(
      pagenumber,
      reportId,
      englishQuestion,
      reportType,
      driver,
      () => {
        setRunningTranslation(false);
      },
      (e) => {
        setRunningTranslation(false);
        console.log(e);
        displayError(e);
      }
    );
  }

  return (
    <div>
      {runningTranslation ? (
        <div style={{ height: 150, border: '1px dashed grey', position: 'relative' }}>{TEXT2CYPHER_LOADING_ICON}</div>
      ) : (
        <>
          <table style={{ marginBottom: 5, width: '100%' }}>
            <tr style={{ display: 'block', width: '100%' }}>
              <td style={{ marginBottom: 5, width: '100%' }}>
                <div style={{ float: 'left', display: 'flex', justifyContent: 'flex-end' }}></div>
              </td>
            </tr>
            <tr style={{ display: 'inline', width: '100%' }}>
              <td style={{ width: 50, textAlign: 'right', paddingTop: '6px' }}>Cypher</td>
              <td style={{ width: 50, textAlign: 'left', paddingTop: '8px' }}>
                <Switch
                  ariaLabel='Write the query in English'
                  style={{ backgroundColor: 'grey' }}
                  isChecked={language == Language.ENGLISH}
                  isDisabled={describing}
                  onChange={() => {
                    if (language == Language.ENGLISH) {
                      setLanguage(Language.CYPHER);
                      deletePrepopulationReportFunction(reportId);
                    } else {
                      void switchToEnglish();
                    }
                  }}
                  className='n-ml-2'
                />
              </td>
              <td style={{ width: 50, textAlign: 'left', paddingTop: '6px' }}>&nbsp;English&nbsp;</td>
              <td style={{ float: 'right' }}>
                {/* Only show translation button if there's something new to translate */}
                {language == Language.ENGLISH ? (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div>
                      <OutlinedButton
                        isDisabled={prepopulateExtensionName == undefined || describing}
                        style={{ marginLeft: '8px' }}
                        onClick={() => {
                          if (prepopulateExtensionName !== undefined) {
                            triggerTranslation();
                            setLanguage(Language.CYPHER);
                            deletePrepopulationReportFunction(reportId);
                          }
                        }}
                      >
                        Translate
                      </OutlinedButton>
                    </div>
                  </div>
                ) : (
                  <></>
                )}
              </td>
            </tr>
          </table>
          {language == Language.CYPHER ? (
            cypherEditor
          ) : describing ? (
            <div className='nd-describing' role='status'>
              <LoadingSpinner size='small' />
              <span>Describing the query in English…</span>
            </div>
          ) : (
            englishEditor
          )}
          <div
            style={
              language == Language.CYPHER
                ? DEFAULT_CARD_SETTINGS_HELPER_TEXT_STYLE
                : {
                    ...DEFAULT_CARD_SETTINGS_HELPER_TEXT_STYLE,
                    // color: '#006FD6',
                    borderBottom: '1px dashed darkgrey',
                    borderLeft: '1px dashed darkgrey',
                    borderRight: '1px dashed darkgrey',
                  }
            }
          >
            {language == Language.ENGLISH ? (
              <>
                For best results, use a descriptive question. See also the{' '}
                <a
                  target='_blank'
                  style={{ textDecoration: 'underline' }}
                  href={docsUrl('user-guide/build-with-ai')}
                >
                  documentation
                </a>
                .
              </>
            ) : (
              reportTypes[reportType]?.helperText
            )}
          </div>
        </>
      )}
    </div>
  );
};

const mapStateToProps = (state, ownProps) => ({
  lastMessage: getLastMessage(state, ownProps.pagenumber, ownProps.reportId),
  history: getHistoryPerCard(state, ownProps.pagenumber, ownProps.reportId),
  database: getDatabase(state, ownProps.pagenumber, ownProps.reportId),
  prepopulateExtensionName: getPrepopulateReportExtension(state, ownProps.reportId),
});

const mapDispatchToProps = (dispatch) => ({
  translateQuery: (pagenumber, reportId, text, reportType, driver, onComplete, onError) => {
    dispatch(queryTranslationThunk(pagenumber, reportId, text, reportType, driver, onComplete, onError));
  },
  updateEnglishQuery: (pagenumber, reportId, message) => {
    dispatch(updateLastMessage(message, pagenumber, reportId));
  },
  displayError: (message) => {
    dispatch(createNotification("Build with AI couldn't write the query", message));
  },
  displayDescribeError: (message) => {
    dispatch(createNotification("Build with AI couldn't describe the query", message));
  },
  setPrepopulationReportFunction: (reportId) => {
    dispatch(setSessionStoragePrepopulationReportFunction(reportId, QUERY_TRANSLATOR_EXTENSION_NAME));
  },
  deletePrepopulationReportFunction: (reportId) => {
    dispatch(deleteSessionStoragePrepopulationReportFunction(reportId));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(NeoOverrideCardQueryEditor);
