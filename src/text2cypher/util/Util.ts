import { createNotification } from '../../application/ApplicationActions';
import { session } from '../../api/client';
import { toggleCardSettingsThunk } from '../../card/CardThunks';
import { getLastMessage } from '../state/QueryTranslatorSelector';
import { queryTranslationThunk } from '../state/QueryTranslatorThunks';

/** Whether the server offers Build with AI (a language model is configured and switched on). */
export const text2cypherAvailable = () => Boolean(session.config?.ai?.enabled);

/**
 * This function translates a query using the specified driver and dispatches actions accordingly.
 * It reads the question last written for the report (from the dashboard state: Build with AI is part of the app,
 * so it is not among the active extensions a report is given) and dispatches queryTranslationThunk with it.
 * The result is set using the provided setResult function; without a question, setResult gets undefined and
 * the report runs the query it has.
 * If an error occurs during translation, a notification with an error message is dispatched.
 * @param driver Neo4j driver
 * @param dispatch Dispatch function to call actions
 * @param pagenumber number of the page where the card lives
 * @param id id of the card
 * @param reportType Type of the report (needed for prompting logic)
 * @param _extensions Unused (the question is read from the dashboard state); kept so callers don't change
 * @param setResult Functions to set the results back to the calling component
 */
export function translateQuery(driver, dispatch, pagenumber, id, reportType, _extensions, setResult) {
  dispatch((_: any, getState: any) => {
    const lastMessage = getLastMessage(getState(), pagenumber, id);
    if (!lastMessage) {
      setResult(undefined);
      return;
    }
    dispatch(
      queryTranslationThunk(
        pagenumber,
        id,
        lastMessage,
        reportType,
        driver,
        (result) => {
          setResult(result);
        },
        (error) => {
          dispatch(createNotification("Build with AI couldn't write the query", error));
          dispatch(toggleCardSettingsThunk(id, true));
        }
      )
    );
  });
}
