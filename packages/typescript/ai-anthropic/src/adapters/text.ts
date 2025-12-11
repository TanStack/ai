import { BaseChatAdapter } from '@tanstack/ai/adapters'
import { ANTHROPIC_MODELS } from '../model-meta'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import { validateTextProviderOptions } from '../text/text-provider-options'
import {
  createAnthropicClient,
  generateId,
  getAnthropicApiKeyFromEnv,
} from '../utils'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
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
import type Anthropic_SDK from '@anthropic-ai/sdk'
import type {
  ChatOptions,
  ContentPart,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type {
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
} from '../model-meta'
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from '../text/text-provider-options'
import type {
  AnthropicDocumentMetadata,
  AnthropicImageMetadata,
  AnthropicMessageMetadataByModality,
  AnthropicTextMetadata,
} from '../message-types'
import type { AnthropicClientConfig } from '../utils'

/**
 * Configuration for Anthropic text adapter
 */
export interface AnthropicTextConfig extends AnthropicClientConfig { }

/**
 * Anthropic-specific provider options for text/chat
 */
export type AnthropicTextProviderOptions = ExternalTextProviderOptions

type AnthropicContentBlocks =
  Extract<MessageParam['content'], Array<unknown>> extends Array<infer Block>
  ? Array<Block>
  : never
type AnthropicContentBlock =
  AnthropicContentBlocks extends Array<infer Block> ? Block : never

/**
 * Anthropic Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Anthropic chat/text completion functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class AnthropicTextAdapter extends BaseChatAdapter<
  typeof ANTHROPIC_MODELS,
  AnthropicTextProviderOptions,
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
  AnthropicMessageMetadataByModality
> {
  readonly kind = 'chat' as const
  readonly name = 'anthropic' as const
  readonly models = ANTHROPIC_MODELS

  declare _modelProviderOptionsByName: AnthropicChatModelProviderOptionsByName
  declare _modelInputModalitiesByName: AnthropicModelInputModalitiesByName
  declare _messageMetadataByModality: AnthropicMessageMetadataByModality

  private client: Anthropic_SDK

  constructor(config: AnthropicTextConfig) {
    super({})
    this.client = createAnthropicClient(config)
  }

  async *chatStream(
    options: ChatOptions<string, AnthropicTextProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    try {
      const requestParams = this.mapCommonOptionsToAnthropic(options)

      const stream = await this.client.beta.messages.create(
        { ...requestParams, stream: true },
        {
          signal: options.request?.signal,
          headers: options.request?.headers,
        },
      )

      yield* this.processAnthropicStream(stream, options.model, () =>
        generateId(this.name),
      )
    } catch (error: unknown) {
      const err = error as Error & { status?: number; code?: string }
      yield {
        type: 'error',
        id: generateId(this.name),
        model: options.model,
        timestamp: Date.now(),
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code || String(err.status),
        },
      }
    }
  }

  /**
   * Generate structured output using Anthropic's tool use pattern.
   * Anthropic doesn't have native JSON schema support, so we use a tool with the schema
   * and extract the arguments as the structured output.
   */
  async structuredOutput(
    options: StructuredOutputOptions<AnthropicTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, jsonSchema } = options

    const requestParams = this.mapCommonOptionsToAnthropic(chatOptions)

    try {
      // Make non-streaming request with tool_choice forced to our structured output tool
      const response = await this.client.beta.messages.create(
        {
          ...requestParams,
          stream: false,
          output_config: {
            effort: 'high',
          },
          output_format: {
            schema: jsonSchema,
            type: 'json_schema',
          },
        },
        {
          signal: chatOptions.request?.signal,
          headers: chatOptions.request?.headers,
        },
      )
      const text = response.content
        .map((b) => {
          if (b.type === 'text') {
            return b.text
          }
          return ''
        })
        .join('')
      let parsed: unknown = null
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
      return {
        data: parsed,
        rawText: text,
      }
    } catch (error: unknown) {
      const err = error as Error
      throw new Error(
        `Structured output generation failed: ${err.message || 'Unknown error occurred'}`,
      )
    }
  }

  private mapCommonOptionsToAnthropic(
    options: ChatOptions<string, AnthropicTextProviderOptions>,
  ) {
    const providerOptions = options.providerOptions as
      | InternalTextProviderOptions
      | undefined

    const formattedMessages = this.formatMessages(options.messages)
    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

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
          if (key === 'tool_choice' && typeof value === 'string') {
            ; (validProviderOptions as Record<string, unknown>)[key] = {
              type: value,
            }
          } else {
            ; (validProviderOptions as Record<string, unknown>)[key] = value
          }
        }
      }
    }

    const thinkingBudget =
      validProviderOptions.thinking?.type === 'enabled'
        ? validProviderOptions.thinking.budget_tokens
        : undefined
    const defaultMaxTokens = options.options?.maxTokens || 1024
    const maxTokens =
      thinkingBudget && thinkingBudget >= defaultMaxTokens
        ? thinkingBudget + 1
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
      case 'text': {
        const metadata = part.metadata as AnthropicTextMetadata | undefined
        return {
          type: 'text',
          text: part.content,
          ...metadata,
        }
      }

      case 'image': {
        const metadata = part.metadata as AnthropicImageMetadata | undefined
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
        const { mediaType: _mediaType, ...meta } = metadata || {}
        return {
          type: 'image',
          source: imageSource,
          ...meta,
        }
      }
      case 'document': {
        const metadata = part.metadata as AnthropicDocumentMetadata | undefined
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
          ...metadata,
        }
      }
      case 'audio':
      case 'video':
        throw new Error(
          `Anthropic does not support ${part.type} content directly`,
        )
      default: {
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
    genId: () => string,
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
            accumulatedThinking = ''
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const delta = event.delta.text
            accumulatedContent += delta
            yield {
              type: 'content',
              id: genId(),
              model: model,
              timestamp,
              delta,
              content: accumulatedContent,
              role: 'assistant',
            }
          } else if (event.delta.type === 'thinking_delta') {
            const delta = event.delta.thinking
            accumulatedThinking += delta
            yield {
              type: 'thinking',
              id: genId(),
              model: model,
              timestamp,
              delta,
              content: accumulatedThinking,
            }
          } else if (event.delta.type === 'input_json_delta') {
            const existing = toolCallsMap.get(currentToolIndex)
            if (existing) {
              existing.input += event.delta.partial_json

              yield {
                type: 'tool_call',
                id: genId(),
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
          const existing = toolCallsMap.get(currentToolIndex)
          if (existing && existing.input === '') {
            yield {
              type: 'tool_call',
              id: genId(),
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
            id: genId(),
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
                  id: genId(),
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
                  id: genId(),
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
              default: {
                yield {
                  type: 'done',
                  id: genId(),
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
    } catch (error: unknown) {
      const err = error as Error & { status?: number; code?: string }

      yield {
        type: 'error',
        id: genId(),
        model: model,
        timestamp,
        error: {
          message: err.message || 'Unknown error occurred',
          code: err.code || String(err.status),
        },
      }
    }
  }
}

/**
 * Creates an Anthropic text adapter with explicit API key
 */
export function createAnthropicText(
  apiKey: string,
  config?: Omit<AnthropicTextConfig, 'apiKey'>,
): AnthropicTextAdapter {
  return new AnthropicTextAdapter({ apiKey, ...config })
}

/**
 * Creates an Anthropic text adapter with automatic API key detection
 */
export function anthropicText(
  config?: Omit<AnthropicTextConfig, 'apiKey'>,
): AnthropicTextAdapter {
  const apiKey = getAnthropicApiKeyFromEnv()
  return createAnthropicText(apiKey, config)
}
