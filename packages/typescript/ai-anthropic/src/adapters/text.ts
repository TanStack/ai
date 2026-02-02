import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import { validateTextProviderOptions } from '../text/text-provider-options'
import {
  createAnthropicClient,
  generateId,
  getAnthropicApiKeyFromEnv,
} from '../utils'
import type {
  ANTHROPIC_MODELS,
  AnthropicChatModelProviderOptionsByName,
  AnthropicModelInputModalitiesByName,
} from '../model-meta'
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
  ContentPart,
  Modality,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
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
export interface AnthropicTextConfig extends AnthropicClientConfig {}

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

// ===========================
// Type Resolution Helpers
// ===========================

/**
 * Resolve provider options for a specific model.
 * If the model has explicit options in the map, use those; otherwise use base options.
 */
type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof AnthropicChatModelProviderOptionsByName
    ? AnthropicChatModelProviderOptionsByName[TModel]
    : AnthropicTextProviderOptions

/**
 * Resolve input modalities for a specific model.
 * If the model has explicit modalities in the map, use those; otherwise use default.
 */
type ResolveInputModalities<TModel extends string> =
  TModel extends keyof AnthropicModelInputModalitiesByName
    ? AnthropicModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'document']

// ===========================
// Adapter Implementation
// ===========================

/**
 * Anthropic Text (Chat) Adapter
 *
 * Tree-shakeable adapter for Anthropic chat/text completion functionality.
 * Import only what you need for smaller bundle sizes.
 */
export class AnthropicTextAdapter<
  TModel extends (typeof ANTHROPIC_MODELS)[number],
  TProviderOptions extends object = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  AnthropicMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'anthropic' as const

  private client: Anthropic_SDK

  constructor(config: AnthropicTextConfig, model: TModel) {
    super({}, model)
    this.client = createAnthropicClient(config)
  }

  async *chatStream(
    options: TextOptions<AnthropicTextProviderOptions>,
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
        type: 'RUN_ERROR',
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
   * Generate structured output using Anthropic's tool-based approach.
   * Anthropic doesn't have native structured output, so we use a tool with the schema
   * and force the model to call it.
   * The outputSchema is already JSON Schema (converted in the ai layer).
   */
  async structuredOutput(
    options: StructuredOutputOptions<AnthropicTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options

    const requestParams = this.mapCommonOptionsToAnthropic(chatOptions)

    // Create a tool that will capture the structured output
    // Anthropic's SDK requires input_schema with type: 'object' literal
    const structuredOutputTool = {
      name: 'structured_output',
      description:
        'Use this tool to provide your response in the required structured format.',
      input_schema: {
        type: 'object' as const,
        properties: outputSchema.properties ?? {},
        required: outputSchema.required ?? [],
      },
    }

    try {
      // Make non-streaming request with tool_choice forced to our structured output tool
      const response = await this.client.messages.create(
        {
          ...requestParams,
          stream: false,
          tools: [structuredOutputTool],
          tool_choice: { type: 'tool', name: 'structured_output' },
        },
        {
          signal: chatOptions.request?.signal,
          headers: chatOptions.request?.headers,
        },
      )

      // Extract the tool use content from the response
      let parsed: unknown = null
      let rawText = ''

      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name === 'structured_output') {
          parsed = block.input
          rawText = JSON.stringify(block.input)
          break
        }
      }

      if (parsed === null) {
        // Fallback: try to extract text content and parse as JSON
        rawText = response.content
          .map((b) => {
            if (b.type === 'text') {
              return b.text
            }
            return ''
          })
          .join('')
        try {
          parsed = JSON.parse(rawText)
        } catch {
          throw new Error(
            `Failed to extract structured output from response. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
          )
        }
      }

      return {
        data: parsed,
        rawText,
      }
    } catch (error: unknown) {
      const err = error as Error
      throw new Error(
        `Structured output generation failed: ${err.message || 'Unknown error occurred'}`,
      )
    }
  }

  private mapCommonOptionsToAnthropic(
    options: TextOptions<AnthropicTextProviderOptions>,
  ) {
    const modelOptions = options.modelOptions as
      | InternalTextProviderOptions
      | undefined

    const formattedMessages = this.formatMessages(options.messages)
    const tools = options.tools
      ? convertToolsToProviderFormat(options.tools)
      : undefined

    const validProviderOptions: Partial<InternalTextProviderOptions> = {}
    if (modelOptions) {
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
        if (key in modelOptions) {
          const value = modelOptions[key]
          if (key === 'tool_choice' && typeof value === 'string') {
            ;(validProviderOptions as Record<string, unknown>)[key] = {
              type: value,
            }
          } else {
            ;(validProviderOptions as Record<string, unknown>)[key] = value
          }
        }
      }
    }

    const thinkingBudget =
      validProviderOptions.thinking?.type === 'enabled'
        ? validProviderOptions.thinking.budget_tokens
        : undefined
    const defaultMaxTokens = options.maxTokens || 1024
    const maxTokens =
      thinkingBudget && thinkingBudget >= defaultMaxTokens
        ? thinkingBudget + 1
        : defaultMaxTokens

    const requestParams: InternalTextProviderOptions = {
      model: options.model,
      max_tokens: maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
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
      { id: string; name: string; input: string; started: boolean }
    >()
    let currentToolIndex = -1

    // AG-UI lifecycle tracking
    const runId = genId()
    const messageId = genId()
    let stepId: string | null = null
    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false

    try {
      for await (const event of stream) {
        // Emit RUN_STARTED on first event
        if (!hasEmittedRunStarted) {
          hasEmittedRunStarted = true
          yield {
            type: 'RUN_STARTED',
            runId,
            model,
            timestamp,
          }
        }

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolIndex++
            toolCallsMap.set(currentToolIndex, {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
              started: false,
            })
          } else if (event.content_block.type === 'thinking') {
            accumulatedThinking = ''
            // Emit STEP_STARTED for thinking
            stepId = genId()
            yield {
              type: 'STEP_STARTED',
              stepId,
              model,
              timestamp,
              stepType: 'thinking',
            }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            // Emit TEXT_MESSAGE_START on first text content
            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield {
                type: 'TEXT_MESSAGE_START',
                messageId,
                model,
                timestamp,
                role: 'assistant',
              }
            }

            const delta = event.delta.text
            accumulatedContent += delta
            yield {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              model,
              timestamp,
              delta,
              content: accumulatedContent,
            }
          } else if (event.delta.type === 'thinking_delta') {
            const delta = event.delta.thinking
            accumulatedThinking += delta
            yield {
              type: 'STEP_FINISHED',
              stepId: stepId || genId(),
              model,
              timestamp,
              delta,
              content: accumulatedThinking,
            }
          } else if (event.delta.type === 'input_json_delta') {
            const existing = toolCallsMap.get(currentToolIndex)
            if (existing) {
              // Emit TOOL_CALL_START on first args delta
              if (!existing.started) {
                existing.started = true
                yield {
                  type: 'TOOL_CALL_START',
                  toolCallId: existing.id,
                  toolName: existing.name,
                  model,
                  timestamp,
                  index: currentToolIndex,
                }
              }

              existing.input += event.delta.partial_json

              yield {
                type: 'TOOL_CALL_ARGS',
                toolCallId: existing.id,
                model,
                timestamp,
                delta: event.delta.partial_json,
                args: existing.input,
              }
            }
          }
        } else if (event.type === 'content_block_stop') {
          const existing = toolCallsMap.get(currentToolIndex)
          if (existing) {
            // If tool call wasn't started yet (no args), start it now
            if (!existing.started) {
              existing.started = true
              yield {
                type: 'TOOL_CALL_START',
                toolCallId: existing.id,
                toolName: existing.name,
                model,
                timestamp,
                index: currentToolIndex,
              }
            }

            // Emit TOOL_CALL_END
            let parsedInput: unknown = {}
            try {
              parsedInput = existing.input ? JSON.parse(existing.input) : {}
            } catch {
              parsedInput = {}
            }

            yield {
              type: 'TOOL_CALL_END',
              toolCallId: existing.id,
              toolName: existing.name,
              model,
              timestamp,
              input: parsedInput,
            }
          }

          // Emit TEXT_MESSAGE_END if we had text content
          if (hasEmittedTextMessageStart && accumulatedContent) {
            yield {
              type: 'TEXT_MESSAGE_END',
              messageId,
              model,
              timestamp,
            }
          }
        } else if (event.type === 'message_stop') {
          yield {
            type: 'RUN_FINISHED',
            runId,
            model,
            timestamp,
            finishReason: 'stop',
          }
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason) {
            switch (event.delta.stop_reason) {
              case 'tool_use': {
                yield {
                  type: 'RUN_FINISHED',
                  runId,
                  model,
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
                  type: 'RUN_ERROR',
                  runId,
                  model,
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
                  type: 'RUN_FINISHED',
                  runId,
                  model,
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
        type: 'RUN_ERROR',
        runId,
        model,
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
 * Creates an Anthropic chat adapter with explicit API key.
 * Type resolution happens here at the call site.
 */
export function createAnthropicChat<
  TModel extends (typeof ANTHROPIC_MODELS)[number],
>(
  model: TModel,
  apiKey: string,
  config?: Omit<AnthropicTextConfig, 'apiKey'>,
): AnthropicTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>
> {
  return new AnthropicTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an Anthropic text adapter with automatic API key detection.
 * Type resolution happens here at the call site.
 */
export function anthropicText<TModel extends (typeof ANTHROPIC_MODELS)[number]>(
  model: TModel,
  config?: Omit<AnthropicTextConfig, 'apiKey'>,
): AnthropicTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>
> {
  const apiKey = getAnthropicApiKeyFromEnv()
  return createAnthropicChat(model, apiKey, config)
}
