/**
 * Anthropic adapter using the official @ai-sdk/anthropic package.
 */

import { createAnthropic } from '@ai-sdk/anthropic';

export type AnthropicClientOptions = {
  apiKey?: string;
};

export function createAnthropicClient(opts: AnthropicClientOptions = {}) {
  const apiKey = opts.apiKey;

  const anthropic = createAnthropic({
    apiKey,
  });

  return function anthropicModel(modelId: string) {
    return anthropic(modelId);
  };
}
