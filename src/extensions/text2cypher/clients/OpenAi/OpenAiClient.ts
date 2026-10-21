// Calls the OpenAI REST API with fetch. (The openai 3 SDK used before is unmaintained and pulled in an
// axios version with security advisories; these two endpoints are all the extension needs.)
import { reportTypesToDesc, reportExampleQueries } from '../const';
import { ModelClient } from '../ModelClient';
import { Status } from '../../util/Status';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Minimal client for the OpenAI REST API (models list and chat completions). */
export class OpenAiRestClient {
  constructor(
    private apiKey: string,
    private baseUrl = 'https://api.openai.com/v1'
  ) {}

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}`, ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error?.message || `Request returned with status: ${response.status}`);
    }
    return body;
  }

  async listModels(): Promise<string[]> {
    const body = await this.request('/models');
    return (body.data || []).map((model) => model.id);
  }

  async chatCompletion(model: string | undefined, messages: ChatMessage[]): Promise<ChatMessage> {
    const body = await this.request('/chat/completions', { method: 'POST', body: JSON.stringify({ model, messages }) });
    const message = body?.choices?.[0]?.message;
    if (!message) {
      throw new Error('The model returned no message');
    }
    return message;
  }
}

const consoleLogAsync = async (message: string, other?: any) => {
  await new Promise((resolve) => setTimeout(resolve, 0)).then(() => console.info(message, other));
};

export class OpenAiClient extends ModelClient {
  modelType: string | undefined;

  createSystemMessage: any;

  modelClient!: OpenAiRestClient;

  driver: any;

  constructor(settings) {
    super(settings);
  }

  async validateQuery(message, database) {
    let query = message.content;
    let isValid = false;
    let errorMessage = '';
    try {
      await this.queryDatabase(`EXPLAIN ${query}`, database);
      isValid = true;
    } catch (e) {
      isValid = false;
      errorMessage = e.message;
    }
    return [isValid, errorMessage];
  }

  /**
   * Function used to create the OpenAiApi object.
   * */
  setModelClient() {
    this.modelClient = new OpenAiRestClient(this.apiKey);
  }

  /**
   *
   * @param setIsAuthenticated If defined, is a function used to set the authentication result (for example, set function of a state variable)
   * @returns True if we client can authenticate, False otherwise
   */
  async authenticate(
    setIsAuthenticated = () => {
      // console.log(boolean);
    }
  ) {
    try {
      let tmp = await this.getListModels();
      // Can be used in async mode without awaiting
      // by passing down a function to set the authentication result
      setIsAuthenticated(tmp.length > 0 ? Status.AUTHENTICATED : Status.ERROR);
      return tmp.length > 0;
    } catch (e) {
      consoleLogAsync('Authentication went wrong: ', e);
      return false;
    }
  }

  /**
   *  Used also to check authentication
   * @returns list of models available for this client
   */
  async getListModels() {
    let res;
    try {
      if (!this.modelClient) {
        throw new Error('no client defined');
      }
      res = (await this.modelClient.listModels()).filter((x) => x.includes('gpt-'));
    } catch (e) {
      consoleLogAsync('Error while loading the model list: ', e);
      res = [];
    }
    this.setListAvailableModels(res);
    return res;
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.modelClient = new OpenAiRestClient(apiKey);
  }

  setDriver(driver) {
    this.driver = driver;
  }

  setListAvailableModels(listModels) {
    this.listAvailableModels = listModels;
  }

  setModelType(modelType) {
    this.modelType = modelType;
  }

  /**
   * Function used to create a message sent from the user to the model.
   * @param content Content of the message (the message wrote from the UI)
   * @param reportType Type of report needed
   * @param plain If True, return content itself, otherwise the message with all the prompting needed.
   * @returns
   */
  addUserMessage(content, reportType, plain = false) {
    let queryExample = reportExampleQueries[reportType];
    let finalMessage = `${content}. Please respect the structure of the result based on this description: ${reportTypesToDesc[reportType]}.
  Here an example of a query: ${queryExample}.
  Remember that every $ prefixed word is a parameter.`;
    return { role: 'user', content: plain ? content : finalMessage };
  }

  addSystemMessage(content) {
    return { role: 'system', content: content };
  }

  addAssistantMessage(content) {
    return { role: 'assistant', content: content };
  }

  addErrorMessage(error) {
    let finalMessage = `Error: ${error}. Please correct the query based on the provided error message. Ensure the query follows the expected format, adheres to the schema, and does not contain any comments, explanations, or unnecessary symbols. Please remove any comments or explanations from the query result.`;
    return { role: 'user', content: finalMessage };
  }

  getMessageContent(message: ChatMessage) {
    return message.content;
  }

  async chatCompletion(history) {
    return this.modelClient.chatCompletion(this.modelType, history);
  }
}
