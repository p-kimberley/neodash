import { EXTENSIONS_REDUCERS } from '../ExtensionConfig';
import { QUERY_TRANSLATOR_ACTION_PREFIX } from '../../text2cypher/state/QueryTranslatorActions';
import { queryTranslatorReducer } from '../../text2cypher/state/QueryTranslatorReducer';
import { QUERY_TRANSLATOR_EXTENSION_NAME } from '../../text2cypher/state/QueryTranslatorSelector';
import { SET_EXTENSION_REDUCER_ENABLED } from './ExtensionActions';

export const INITIAL_EXTENSIONS_STATE = {
  active: true,
  activeReducers: [],
};

export const extensionsReducer = (state = INITIAL_EXTENSIONS_STATE, action: { type: any; payload: any }) => {
  const { type, payload } = action;

  if (!action.type.startsWith('DASHBOARD/EXTENSIONS')) {
    return state;
  }

  // Build with AI is part of the app, not an extension, so its state (questions and examples) is always
  // kept. It stays under the dashboard's extensions, where dashboards saved earlier have it.
  if (type.startsWith(QUERY_TRANSLATOR_ACTION_PREFIX)) {
    return {
      ...state,
      [QUERY_TRANSLATOR_EXTENSION_NAME]: queryTranslatorReducer(state[QUERY_TRANSLATOR_EXTENSION_NAME], action),
    };
  }

  // Checking if we are receiving an action from an enabled extension
  if (state.activeReducers && state.activeReducers.some((prefix) => type.startsWith(prefix))) {
    let currentPrefix = state.activeReducers.find((prefix) => type.startsWith(prefix));
    let { name, reducer } = EXTENSIONS_REDUCERS[currentPrefix];
    let newState = {
      ...state,
    };
    newState[name] = reducer(state[name], action);
    return newState;
  }

  switch (type) {
    case SET_EXTENSION_REDUCER_ENABLED: {
      const { name, enabled } = payload;
      const newState = {
        ...state,
      };
      if (enabled) {
        newState.activeReducers.push(name);
      } else {
        const index = newState.activeReducers.indexOf(name);
        if (index > -1) {
          // only splice array when item is found
          newState.activeReducers.splice(index, 1); // 2nd parameter means remove one item only
        }
      }
      return newState;
    }
    default: {
      return state;
    }
  }
};
