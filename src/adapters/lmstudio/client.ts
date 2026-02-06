/**
 * LM Studio adapter that bypasses AI SDK's specificationVersion check.
 * 
 * The @ai-sdk/openai-compatible package requires models to implement
 * specification version \"v2\", but LM Studio returns \"v3\" which causes
 * AI SDK 5 to reject the model. This adapter wraps the OpenAI SDK
 * directly to avoid that check.
 */

import OpenAI from 'openai';
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2ProviderMetadata,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';

// V2 content types for the response
type LanguageModelV2Text = {
  type: 'text';
  text: string;
  providerMetadata?: LanguageModelV2ProviderMetadata;
};

type LanguageModelV2Reasoning = {
  type: 'reasoning';
  text: string;
  providerMetadata?: LanguageModelV2ProviderMetadata;
};

type LanguageModelV2Content = LanguageModelV2Text | LanguageModelV2Reasoning;

// V2 usage type
type LanguageModelV2Usage = {
  inputTokens: number;
  outputTokens: number;
};

function debugLMStudio(...args: unknown[]): void {
  if (!process.env.DEBUG_LMSTUDIO) return;
  console.error('[DEBUG_LMSTUDIO]', ...args);
}

export type LMStudioClientOptions = {
  baseUrl?: string;
  apiKey?: string;
};

export function createLMStudioClient(opts: LMStudioClientOptions = {}) {
  const baseURL = opts.baseUrl ?? 'http://localhost:1234/v1';
  const apiKey = opts.apiKey ?? 'not-needed';

  const openai = new OpenAI({
    baseURL,
    apiKey,
  });

  return function lmstudioModel(modelId: string): LanguageModelV2 {
    return new LMStudioLanguageModel(openai, modelId);
  };
}

class LMStudioLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2' as const;
  readonly provider = 'lmstudio';
  readonly defaultObjectGenerationMode = 'json' as const;
  readonly supportsImageUrls = false;
  readonly supportsStructuredOutputs = true;

  constructor(
    private readonly openai: OpenAI,
    public readonly modelId: string,
  ) {}

  async doGenerate(
    options: LanguageModelV2CallOptions,
  ): Promise<{
    content: Array<LanguageModelV2Content>;
    finishReason: LanguageModelV2FinishReason;
    usage: LanguageModelV2Usage;
    request?: { body?: unknown };
    response?: {
      id?: string;
      timestamp?: Date;
      modelId?: string;
      headers?: Record<string, string>;
      body?: unknown;
    };
    warnings?: LanguageModelV2CallWarning[];
    providerMetadata?: LanguageModelV2ProviderMetadata;
  }> {
    const messages = this.convertMessages(options);

    debugLMStudio('prompt length:', options.prompt?.length, 'converted messages:', messages.length);
    
    const requestBody: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.modelId,
      messages,
      max_tokens: options.maxOutputTokens ?? 4000,
      temperature: options.temperature ?? 0.7,
      stream: false,
    };

    let response;
    try {
      response = await this.openai.chat.completions.create(requestBody);
    } catch (err) {
      debugLMStudio('OpenAI SDK error:', err);
      throw err;
    }

    const choice = response.choices[0];
    const message = choice?.message;
    const textContent = message?.content ?? '';
    
    // Build the content array (V2 format)
    const content: LanguageModelV2Content[] = [];
    
    // Add reasoning if present (LM Studio reasoning models)
    const reasoning = (message as any)?.reasoning as string | undefined;
    if (reasoning) {
      content.push({
        type: 'reasoning',
        text: reasoning,
      });
    }
    
    // Add the main text content
    if (textContent) {
      content.push({
        type: 'text',
        text: textContent,
      });
    }

    const finishReason = this.mapFinishReason(choice?.finish_reason);
    debugLMStudio(
      'id:', response.id,
      'content:', textContent.length, 'chars',
      'finish:', finishReason,
      'parts:', content.length,
    );

    return {
      content,
      finishReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      request: {
        body: requestBody,
      },
      response: {
        id: response.id,
        timestamp: new Date(response.created * 1000),
        modelId: response.model,
        body: response,
      },
      providerMetadata: {
        lmstudio: {
          usage: response.usage,
          stats: (response as any).stats,
        },
      },
    };
  }

  async doStream(
    options: LanguageModelV2CallOptions,
  ): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    rawCall: { rawPrompt: unknown; rawSettings: Record<string, unknown> };
    rawResponse?: { headers?: Record<string, string> };
    warnings?: LanguageModelV2CallWarning[];
  }> {
    const messages = this.convertMessages(options);
    
    const requestBody: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: this.modelId,
      messages,
      max_tokens: options.maxOutputTokens ?? 4000,
      temperature: options.temperature ?? 0.7,
      stream: true,
    };

    const response = await this.openai.chat.completions.create(requestBody);

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      async start(controller) {
        try {
          let inputTokens = 0;
          let outputTokens = 0;

          for await (const chunk of response) {
            const delta = chunk.choices[0]?.delta;
            
            if (delta?.content) {
              controller.enqueue({
                type: 'text-delta',
                textDelta: delta.content,
              });
            }

            // Check for usage in the final chunk
            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens ?? 0;
              outputTokens = chunk.usage.completion_tokens ?? 0;
            }

            const finishReason = chunk.choices[0]?.finish_reason;
            if (finishReason) {
              controller.enqueue({
                type: 'finish',
                finishReason: finishReason === 'stop' ? 'stop' : 
                              finishReason === 'length' ? 'length' : 
                              finishReason === 'tool_calls' ? 'tool-calls' : 'other',
                usage: {
                  inputTokens,
                  outputTokens,
                },
              });
            }
          }
          
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return {
      stream,
      rawCall: {
        rawPrompt: messages,
        rawSettings: requestBody as unknown as Record<string, unknown>,
      },
    };
  }

  private convertMessages(
    options: LanguageModelV2CallOptions,
  ): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (options.prompt) {
      for (const msg of options.prompt) {
        if (msg.role === 'system') {
          // System content is always a string
          messages.push({
            role: 'system',
            content: msg.content,
          });
        } else if (msg.role === 'user') {
          // User content can be string or array of parts
          const content = this.extractTextContent(msg.content);
          messages.push({
            role: 'user',
            content,
          });
        } else if (msg.role === 'assistant') {
          // Assistant content can be string or array of parts
          const content = this.extractTextContent(msg.content);
          messages.push({
            role: 'assistant',
            content,
          });
        }
      }
    }

    return messages;
  }

  private extractTextContent(
    content: string | Array<{ type: string; text?: string; [key: string]: unknown }>,
  ): string {
    // If content is already a string, return it directly
    if (typeof content === 'string') {
      return content;
    }

    // If content is an array, extract text parts
    if (Array.isArray(content)) {
      return content
        .filter((part): part is { type: 'text'; text: string } => 
          part.type === 'text' && typeof part.text === 'string'
        )
        .map((part) => part.text)
        .join('\
');
    }

    // Fallback: stringify unknown content
    return String(content ?? '');
  }

  private mapFinishReason(
    reason: string | null | undefined,
  ): LanguageModelV2FinishReason {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool-calls';
      case 'content_filter':
        return 'content-filter';
      default:
        return 'other';
    }
  }
}