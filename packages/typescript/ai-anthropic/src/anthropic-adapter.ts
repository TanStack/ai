import Anthropic_SDK from '@anthropic-ai/sdk'
import { BaseAdapter } from '@tanstack/ai'
import { ANTHROPIC_MODELS } from './model-meta'
import { convertToolsToProviderFormat } from './tools/tool-converter'
import { validateTextProviderOptions } from './text/text-provider-options'
import type {
  AnthropicImageMetadata,
  AnthropicMessageMetadataByModality,
} from './message-types'
import type {
  ChatOptions,
  ContentPart,
  EmbeddingOptions,
  EmbeddingResult,
  ModelMessage,
  StreamChunk,
  SummarizationOptions,
  SummarizationResult,
} from '@tanstack/ai'
import type {
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
} from './model-meta'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from './text/text-provider-options'
import type {
  Base64ImageSource,
  Base64PDFSource,
  DocumentBlockParam,
  ImageBlockParam,
  MessageParam,
  TextBlockParam,
  URLImageSource,
  URLPDFSource,
} from '@anthropic-ai/sdk/resources/messages'

export interface AnthropicConfig {
  apiKey: string
}

/**
 * Anthropic-specific provider options
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/anthropic
 */
export type AnthropicProviderOptions = ExternalTextProviderOptions

type AnthropicContentBlocks =
  Extract<MessageParam['content'], Array<unknown>> extends Array<infer Block>
    ? Array<Block>
    : never
type AnthropicContentBlock =
  AnthropicContentBlocks extends Array<infer Block> ? Block : never

export class Anthropic extends BaseAdapter<
  typeof ANTHROPIC_MODELS,
  [],
  AnthropicProviderOptions,
  Record<string, any>,
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
  AnthropicMessageMetadataByModality
> {
  name = 'anthropic' as const
  models = ANTHROPIC_MODELS

  declare _modelProviderOptionsByName: AnthropicChatModelProviderOptionsByName
  declare _modelInputModalitiesByName: AnthropicModelInputModalitiesByName
  declare _messageMetadataByModality: AnthropicMessageMetadataByModality

  private client: Anthropic_SDK

  constructor(config: AnthropicConfig) {
    super({})
    this.client = new Anthropic_SDK({
      apiKey: config.apiKey,
    })
  }

  async *chatStream(
    options: ChatOptions<string, AnthropicProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    try {
      // Map common options to Anthropic format using the centralized mapping function
      const requestParams = this.mapCommonOptionsToAnthropic(options)

      const stream = await this.client.beta.messages.create(
        { ...requestParams, stream: true },
        {
          signal: options.request?.signal,
          headers: options.request?.headers,
        },
      )

      yield* this.processAnthropicStream(stream, options.model, () =>
        this.generateId(),
      )
    } catch (error: any) {
      console.error('[Anthropic Adapter] Error in chatStream:', {
        message: error?.message,
        status: error?.status,
        statusText: error?.statusText,
        code: error?.code,
        type: error?.type,
        error: error,
        stack: error?.stack,
      })

      // Emit an error chunk
      yield {
        type: 'error',
        id: this.generateId(),
        model: options.model,
        timestamp: Date.now(),
        error: {
          message: error?.message || 'Unknown error occurred',
          code: error?.code || error?.status,
        },
      }
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options)

    const response = await this.client.messages.create({
      model: options.model,
      messages: [{ role: 'user', content: options.text }],
      system: systemPrompt,
      max_tokens: options.maxLength || 500,
      temperature: 0.3,
      stream: false,
    })

    const content = response.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('')

    return {
      id: response.id,
      model: response.model,
      summary: content,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    }
  }

  createEmbeddings(_options: EmbeddingOptions): Promise<EmbeddingResult> {
    // Note: Anthropic doesn't have a native embeddings API
    // You would need to use a different service or implement a workaround
    throw new Error(
      'Embeddings are not natively supported by Anthropic. Consider using OpenAI or another provider for embeddings.',
    )
  }

  private buildSummarizationPrompt(options: SummarizationOptions): string {
    let prompt = 'You are a professional summarizer. '

    switch (options.style) {
      case 'bullet-points':
        prompt += 'Provide a summary in bullet point format. '
        break
      case 'paragraph':
        prompt += 'Provide a summary in paragraph format. '
        break
      case 'concise':
        prompt += 'Provide a very concise summary in 1-2 sentences. '
        break
      default:
        prompt += 'Provide a clear and concise summary. '
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on the following aspects: ${options.focus.join(', ')}. `
    }

    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} tokens. `
    }

    return prompt
  }

  /**
   * Maps common options to Anthropic-specific format
   * Handles translation of normalized options to Anthropic's API format
   */
  private mapCommonOptionsToAnthropic(
    options: ChatOptions<string, AnthropicProviderOptions>,
  ) {
    const providerOptions = options.providerOptions as
      | InternalTextProviderOptions
      | undefined

    const formattedMessages = this.formatMessages(options.messages)
    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    // Filter out invalid fields from providerOptions (like 'store' which is OpenAI-specific)
    const validProviderOptions: Partial<InternalTextProviderOptions> = {}
    if (providerOptions) {
      const validKeys: Array<keyof InternalTextProviderOptions> = [
        'container',
        'context_management',
        'mcp_servers',
        'service_tier',
        'stop_sequences',
        'system',
        'thinking',
        'tool_choice',
        'top_k',
      ]
      for (const key of validKeys) {
        if (key in providerOptions) {
          const value = providerOptions[key]
          // Anthropic expects tool_choice to be an object, not a string
          if (key === 'tool_choice' && typeof value === 'string') {
            ;(validProviderOptions as any)[key] = { type: value }
          } else {
            ;(validProviderOptions as any)[key] = value
          }
        }
      }
    }

    // Ensure max_tokens is greater than thinking.budget_tokens if thinking is enabled
    const thinkingBudget =
      validProviderOptions.thinking?.type === 'enabled'
        ? validProviderOptions.thinking.budget_tokens
        : undefined
    const defaultMaxTokens = options.options?.maxTokens || 1024
    const maxTokens =
      thinkingBudget && thinkingBudget >= defaultMaxTokens
        ? thinkingBudget + 1 // Ensure max_tokens is greater than budget_tokens
        : defaultMaxTokens

    const requestParams: InternalTextProviderOptions = {
      model: options.model,
      max_tokens: maxTokens,
      temperature: options.options?.temperature,
      top_p: options.options?.topP,
      messages: formattedMessages,
      system: options.systemPrompts?.join('\n'),
      tools: tools,
      ...validProviderOptions,
    }
    validateTextProviderOptions(requestParams)
    return requestParams
  }

  private convertContentPartToAnthropic(
    part: ContentPart,
  ): TextBlockParam | ImageBlockParam | DocumentBlockParam {
    switch (part.type) {
      case 'text':
        return {
          type: 'text',
          text: part.content,
        }
      case 'image': {
        const metadata = part.metadata as any as
          | AnthropicImageMetadata
          | undefined
        const imageSource: Base64ImageSource | URLImageSource =
          part.source.type === 'data'
            ? {
                type: 'base64',
                data: part.source.value,
                media_type: metadata?.mediaType ?? 'image/jpeg',
              }
            : {
                type: 'url',
                url: part.source.value,
              }
        return {
          type: 'image',
          source: imageSource,
        }
      }
      case 'document': {
        const docSource: Base64PDFSource | URLPDFSource =
          part.source.type === 'data'
            ? {
                type: 'base64',
                data: part.source.value,
                media_type: 'application/pdf',
              }
            : {
                type: 'url',
                url: part.source.value,
              }
        return {
          type: 'document',
          source: docSource,
        }
      }
      case 'audio':
      case 'video':
        // Anthropic doesn't support audio/video directly, treat as text with a note
        throw new Error(
          `Anthropic does not support ${part.type} content directly`,
        )
      default: {
        // Exhaustive check - this should never happen with known types
        const _exhaustiveCheck: never = part
        throw new Error(
          `Unsupported content part type: ${(_exhaustiveCheck as ContentPart).type}`,
        )
      }
    }
  }

  private formatMessages(
    messages: Array<ModelMessage>,
  ): InternalTextProviderOptions['messages'] {
    const formattedMessages: InternalTextProviderOptions['messages'] = []

    for (const message of messages) {
      const role = message.role

      if (role === 'tool' && message.toolCallId) {
        formattedMessages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: message.toolCallId,
              content:
                typeof message.content === 'string' ? message.content : '',
            },
          ],
        })
        continue
      }

      if (role === 'assistant' && message.toolCalls?.length) {
        const contentBlocks: AnthropicContentBlocks = []

        if (message.content) {
          const content =
            typeof message.content === 'string' ? message.content : ''
          const textBlock: AnthropicContentBlock = {
            type: 'text',
            text: content,
          }
          contentBlocks.push(textBlock)
        }

        for (const toolCall of message.toolCalls) {
          let parsedInput: unknown = {}
          try {
            parsedInput = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {}
          } catch {
            parsedInput = toolCall.function.arguments
          }

          const toolUseBlock: AnthropicContentBlock = {
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.function.name,
            input: parsedInput,
          }
          contentBlocks.push(toolUseBlock)
        }

        formattedMessages.push({
          role: 'assistant',
          content: contentBlocks,
        })

        continue
      }

      // Handle user messages with multimodal content
      if (role === 'user' && Array.isArray(message.content)) {
        const contentBlocks = message.content.map((part) =>
          this.convertContentPartToAnthropic(part),
        )
        formattedMessages.push({
          role: 'user',
          content: contentBlocks,
        })
        continue
      }

      formattedMessages.push({
        role: role === 'assistant' ? 'assistant' : 'user',
        content:
          typeof message.content === 'string'
            ? message.content
            : message.content
              ? message.content.map((c) =>
                  this.convertContentPartToAnthropic(c),
                )
              : '',
      })
    }

    return formattedMessages
  }

  private async *processAnthropicStream(
    stream: AsyncIterable<Anthropic_SDK.Beta.BetaRawMessageStreamEvent>,
    model: string,
    generateId: () => string,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedThinking = ''
    const timestamp = Date.now()
    const toolCallsMap = new Map<
      number,
      { id: string; name: string; input: string }
    >()
    let currentToolIndex = -1

    try {
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolIndex++
            toolCallsMap.set(currentToolIndex, {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            })
          } else if (event.content_block.type === 'thinking') {
            // Reset thinking content when a new thinking block starts
            accumulatedThinking = ''
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const delta = event.delta.text
            accumulatedContent += delta
            yield {
              type: 'content',
              id: generateId(),
              model: model,
              timestamp,
              delta,
              content: accumulatedContent,
              role: 'assistant',
            }
          } else if (event.delta.type === 'thinking_delta') {
            // Handle thinking content
            const delta = event.delta.thinking
            accumulatedThinking += delta
            yield {
              type: 'thinking',
              id: generateId(),
              model: model,
              timestamp,
              delta,
              content: accumulatedThinking,
            }
          } else if (event.delta.type === 'input_json_delta') {
            // Tool input is being streamed
            const existing = toolCallsMap.get(currentToolIndex)
            if (existing) {
              // Accumulate the input for final processing
              existing.input += event.delta.partial_json

              // Yield the DELTA (partial_json), not the full accumulated input
              // The stream processor will concatenate these deltas
              yield {
                type: 'tool_call',
                id: generateId(),
                model: model,
                timestamp,
                toolCall: {
                  id: existing.id,
                  type: 'function',
                  function: {
                    name: existing.name,
                    arguments: event.delta.partial_json,
                  },
                },
                index: currentToolIndex,
              }
            }
          }
        } else if (event.type === 'content_block_stop') {
          // If this is a tool call and we haven't received any input deltas,
          // emit a tool_call chunk with empty arguments
          const existing = toolCallsMap.get(currentToolIndex)
          if (existing && existing.input === '') {
            // No input_json_delta events received, emit empty arguments
            yield {
              type: 'tool_call',
              id: generateId(),
              model: model,
              timestamp,
              toolCall: {
                id: existing.id,
                type: 'function',
                function: {
                  name: existing.name,
                  arguments: '{}',
                },
              },
              index: currentToolIndex,
            }
          }
        } else if (event.type === 'message_stop') {
          yield {
            type: 'done',
            id: generateId(),
            model: model,
            timestamp,
            finishReason: 'stop',
          }
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason) {
            switch (event.delta.stop_reason) {
              case 'tool_use': {
                yield {
                  type: 'done',
                  id: generateId(),
                  model: model,
                  timestamp,
                  finishReason: 'tool_calls',

                  usage: {
                    promptTokens: event.usage.input_tokens || 0,
                    completionTokens: event.usage.output_tokens || 0,
                    totalTokens:
                      (event.usage.input_tokens || 0) +
                      (event.usage.output_tokens || 0),
                  },
                }
                break
              }
              case 'max_tokens': {
                yield {
                  type: 'error',
                  id: generateId(),
                  model: model,
                  timestamp,
                  error: {
                    message:
                      'The response was cut off because the maximum token limit was reached.',
                    code: 'max_tokens',
                  },
                }
                break
              }
              case 'model_context_window_exceeded': {
                yield {
                  type: 'error',
                  id: generateId(),
                  model: model,
                  timestamp,
                  error: {
                    message:
                      "The response was cut off because the model's context window was exceeded.",
                    code: 'context_window_exceeded',
                  },
                }
                break
              }
              case 'refusal': {
                yield {
                  type: 'error',
                  id: generateId(),
                  model: model,
                  timestamp,
                  error: {
                    message: 'The model refused to complete the request.',
                    code: 'refusal',
                  },
                }
                break
              }
              default: {
                yield {
                  type: 'done',
                  id: generateId(),
                  model: model,
                  timestamp,
                  finishReason: 'stop',
                  usage: {
                    promptTokens: event.usage.input_tokens || 0,
                    completionTokens: event.usage.output_tokens || 0,
                    totalTokens:
                      (event.usage.input_tokens || 0) +
                      (event.usage.output_tokens || 0),
                  },
                }
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[Anthropic Adapter] Error in processAnthropicStream:', {
        message: error?.message,
        status: error?.status,
        statusText: error?.statusText,
        code: error?.code,
        type: error?.type,
        error: error,
        stack: error?.stack,
      })

      yield {
        type: 'error',
        id: generateId(),
        model: model,
        timestamp,
        error: {
          message: error?.message || 'Unknown error occurred',
          code: error?.code || error?.status,
        },
      }
    }
  }
}
/**
 * Creates an Anthropic adapter with simplified configuration
 * @param apiKey - Your Anthropic API key
 * @returns A fully configured Anthropic adapter instance
 *
 * @example
 * ```typescript
 * const anthropic = createAnthropic("sk-ant-...");
 *
 * const ai = new AI({
 *   adapters: {
 *     anthropic,
 *   }
 * });
 * ```
 */
export function createAnthropic(
  apiKey: string,
  config?: Omit<AnthropicConfig, 'apiKey'>,
): Anthropic {
  return new Anthropic({ apiKey, ...config })
}

/**
 * Create an Anthropic adapter with automatic API key detection from environment variables.
 *
 * Looks for `ANTHROPIC_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Anthropic adapter instance
 * @throws Error if ANTHROPIC_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses ANTHROPIC_API_KEY from environment
 * const aiInstance = ai(anthropic());
 * ```
 */
export function anthropic(config?: Omit<AnthropicConfig, 'apiKey'>): Anthropic {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  const key = env?.ANTHROPIC_API_KEY

  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY is required. Please set it in your environment variables or use createAnthropic(apiKey, config) instead.',
    )
  }

  return createAnthropic(key, config)
}
