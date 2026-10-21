import { OpenAiClient } from '../OpenAi/OpenAiClient';

// Azure OpenAI REST API version for chat completions (the @azure/openai beta SDK used before was retired).
const AZURE_API_VERSION = '2024-10-21';

const consoleLogAsync = async (message: string, other?: any) => {
  await new Promise((resolve) => setTimeout(resolve, 0)).then(() => console.info(message, other));
};

export class AzureOpenAiClient extends OpenAiClient {
  modelType: string | undefined;

  createSystemMessage: any;

  // Azure calls are made directly with fetch (see chatCompletion and getListModels).
  modelClient!: any;

  driver: any;

  constructor(settings) {
    super(settings);
  }

  /**
   * Function used to create the OpenAiApi object.
   * */
  setModelClient() {
    if (typeof this.endpoint === 'string') {
      this.modelClient = { endpoint: this.endpoint };
    }
  }

  async getListModels() {
    let res;
    try {
      if (!this.modelClient) {
        throw new Error('no client defined');
      }

      const response = await fetch(
        `${this.endpoint + (this.endpoint?.endsWith('/') ? '' : '/')}openai/deployments?api-version=2023-03-15-preview`,
        {
          method: 'GET',
          mode: 'cors',
          headers: {
            'Api-Key': this.apiKey,
          },
        }
      );
      const req = await response.json();
      res = req.data.filter((x) => x.model.startsWith('gpt-')).map((x) => x.id);
    } catch (e) {
      consoleLogAsync('Error while loading the model list: ', e);
      res = [];
    }
    this.setListAvailableModels(res);
    return res;
  }

  async chatCompletion(history) {
    if (typeof this.modelType !== 'string' || typeof this.endpoint !== 'string') {
      throw Error('No deployment selected');
    }
    const base = this.endpoint + (this.endpoint.endsWith('/') ? '' : '/');
    const response = await fetch(
      `${base}openai/deployments/${encodeURIComponent(this.modelType)}/chat/completions?api-version=${AZURE_API_VERSION}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': this.apiKey },
        body: JSON.stringify({ messages: history }),
      }
    );
    const completion = await response.json().catch(() => ({}));
    if (response.ok && completion?.choices?.[0]?.message) {
      return completion.choices[0].message;
    }
    throw Error(completion?.error?.message || `Request returned with status: ${response.status}`);
  }
}
