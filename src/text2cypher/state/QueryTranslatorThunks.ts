import { updateReportQueryThunk } from '../../card/CardThunks';
import { getDatabase } from '../../settings/SettingsSelectors';
import { api } from '../../api/client';
import { updateLastMessage, updateMessageHistory } from './QueryTranslatorActions';
import { getHistoryPerCard, getModelExamples } from './QueryTranslatorSelector';

/** A report's earlier questions and the queries they produced (older sessions kept chat messages). */
const historyPairs = (history: any[]): { question: string; query: string }[] =>
  (Array.isArray(history) ? history : []).filter(
    (entry) => entry && typeof entry.question === 'string' && typeof entry.query === 'string'
  );

/**
 * Thunk used to translate a question into a query for a report, with the language model configured on
 * the server (which reads the database schema and checks the query before answering).
 * @param pagenumber Index of the page where the card lives
 * @param cardId Index that identifies a card inside its page
 * @param message Message inserted by the user
 * @param reportType Type of report used by the card calling the thunk
 * @param _driver Unused (the server reads the schema); kept so existing callers don't change
 * @param onComplete Function used to bring the query back to the calling component
 * @param onError Function used to bring the error back to the calling component
 */
export const queryTranslationThunk =
  (
    pagenumber,
    cardId,
    message,
    reportType,
    _driver,
    onComplete = (_query: string) => {},
    onError = (_error: unknown) => {}
  ) =>
  async (dispatch: any, getState: any) => {
    try {
      const state = getState();
      // Storing the message that will be sent to the model
      dispatch(updateLastMessage(message, pagenumber, cardId));
      const history = historyPairs(getHistoryPerCard(state, pagenumber, cardId));
      const { query } = await api.text2cypher({
        question: message,
        database: getDatabase(state, pagenumber, cardId) || undefined,
        reportType,
        history,
        examples: getModelExamples(state),
        context: { dashboard: state.dashboard?.uuid, page: pagenumber, report: cardId },
      });
      dispatch(updateMessageHistory([...history, { question: message, query }], pagenumber, cardId));
      dispatch(updateReportQueryThunk(cardId, query));
      onComplete(query);
    } catch (e: any) {
      onError(e?.message ?? String(e));
    }
  };
