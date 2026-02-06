import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export type OpenAIClientOptions = {
  apiKey?: string;
  baseUrl: string;
};

export function createOpenAIClient(opts: OpenAIClientOptions) {
  // Force use of chat completions endpoint by using 'openai' as provider name
  // This prevents the SDK from trying to use the newer /v1/responses endpoint
  return createOpenAICompatible({
    name: 'openai',  // Using 'openai' name to use standard chat completions
    baseURL: opts.baseUrl,
    apiKey: opts.apiKey || 'not-needed',
  });
}
