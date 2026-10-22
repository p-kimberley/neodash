/**
 * Reducers define changes to the application state when a given action
 */

import { UPDATE_LAST_MESSAGE, UPDATE_EXAMPLE, DELETE_EXAMPLE, ADD_EXAMPLE } from './QueryTranslatorActions';

// The language model is configured on the server; dashboards keep only the questions and examples.
// (Dashboards saved before may still hold a model provider and settings, which are ignored.)
export const INITIAL_EXTENSION_STATE = {
  lastMessages: {},
  examples: [], // User can pass down to the model different examples of QAs
};

const update = (state, mutations) => Object.assign({}, state, mutations);

export const queryTranslatorReducer = (state = INITIAL_EXTENSION_STATE, action: { type: any; payload: any }) => {
  const { type, payload } = action;

  switch (type) {
    case UPDATE_LAST_MESSAGE: {
      const { message, pagenumber, cardId } = payload;
      let newLastMessages = { ...state.lastMessages };
      if (newLastMessages && !newLastMessages[pagenumber]) {
        newLastMessages[pagenumber] = {};
        newLastMessages[pagenumber][cardId] = message;
      } else {
        newLastMessages[pagenumber][cardId] = message;
      }
      state = update(state, { lastMessages: newLastMessages });
      return state;
    }
    case ADD_EXAMPLE: {
      const { question, answer } = payload;
      let currentExamples = state.examples ? state.examples : [];
      let newExamples: object[] = [...currentExamples];
      newExamples.push({ question: question, answer: answer });
      state = update(state, { examples: newExamples });
      return state;
    }
    case UPDATE_EXAMPLE: {
      const { index, question, answer } = payload;
      let newExamples: object[] = [...state.examples];
      newExamples[index] = { question: question, answer: answer };
      state = update(state, { examples: newExamples });
      return state;
    }
    case DELETE_EXAMPLE: {
      const { index } = payload;
      let newExamples: object[] = [...state.examples];
      // Removing the element at the specified index
      newExamples.splice(index, 1);
      state = update(state, { examples: newExamples });
      return state;
    }
    default: {
      return state;
    }
  }
};
