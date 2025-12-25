import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  createNebiusClient,
  generateId,
  getNebiusApiKeyFromEnv,
} from '../utils'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type OpenAI_SDK from 'openai'
import type { StreamChunk, TextOptions, Tool } from '@tanstack/ai'
import type {
  NebiusImageMetadata,
  NebiusMessageMetadataByModality,
} from '../message-types'

/**
 * Nebius Token Factory text models
 * Note: Nebius models are dynamically available, this is a common subset
 */
export const NebiusTextModels = [
  // DeepSeek models
  'deepseek-ai/DeepSeek-R1-0528',
  'deepseek-ai/DeepSeek-V3-0324',
  // Llama models
  'meta-llama/Meta-Llama-3.1-70B-Instruct',
  'meta-llama/Meta-Llama-3.1-8B-Instruct',
  'meta-llama/Meta-Llama-3.1-405B-Instruct',
  // Qwen models
  'Qwen/Qwen2.5-72B-Instruct',
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2.5-32B-Instruct',
] as const

export type NebiusTextModel = (typeof NebiusTextModels)[number] | (string & {})

/**
 * Nebius-specific provider options
 * Compatible with OpenAI chat completions API options
 */
export interface NebiusTextProviderOptions {
  /** Temperature for sampling (0-2) */
  temperature?: number
  /** Top-p sampling (0-1) */
  top_p?: number
  /** Maximum tokens to generate */
  max_tokens?: number
  /** Stop sequences */
  stop?: string | Array<string>
  /** Presence penalty (-2.0 to 2.0) */
  presence_penalty?: number
  /** Frequency penalty (-2.0 to 2.0) */
  frequency_penalty?: number
  /** Logit bias */
  logit_bias?: Record<string, number>
  /** User identifier */
  user?: string
}

export interface NebiusTextAdapterOptions {
  apiKey?: string
  baseURL?: string
}

/**
 * Default input modalities for Nebius models
 */
type NebiusInputModalities = readonly ['text', 'image']

/**
 * Nebius Text/Chat Adapter
 * A tree-shakeable chat adapter for Nebius Token Factory
 *
 * Note: Nebius supports any model name as a string since models are dynamically available.
 * The predefined NebiusTextModels are common models but any string is accepted.
 */
export class NebiusTextAdapter<TModel extends string> extends BaseTextAdapter<
  TModel,
  NebiusTextProviderOptions,
  NebiusInputModalities,
  NebiusMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'nebius' as const

  private client: OpenAI_SDK

  constructor(config: NebiusTextAdapterOptions | undefined, model: TModel) {
    super({}, model)
    const apiKey = config?.apiKey || getNebiusApiKeyFromEnv()
    this.client = createNebiusClient({
      apiKey,
      baseURL: config?.baseURL,
    })
  }

  async *chatStream(options: TextOptions): AsyncIterable<StreamChunk> {
    const requestParams = this.mapTextOptionsToNebius(options)

    try {
      const stream = await this.client.chat.completions.create({
        ...requestParams,
        stream: true,
      })

      yield* this.processNebiusStreamChunks(stream, options)
    } catch (error: unknown) {
      const err = error as Error
      console.error('>>> chatStream: Fatal error during response creation <<<')
      console.error('>>> Error message:', err.message)
      console.error('>>> Error stack:', err.stack)
      throw error
    }
  }

  /**
   * Generate structured output using Nebius's JSON mode.
   * Uses response_format: { type: 'json_object' } for basic JSON mode.
   * Note: For stricter schema validation, include the schema in the system prompt.
   */
  async structuredOutput(
    options: StructuredOutputOptions<NebiusTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options

    const requestParams = this.mapTextOptionsToNebius(chatOptions)

    try {
      // Add schema to system prompt for better adherence
      const systemPromptWithSchema = `You must respond with valid JSON matching this schema: ${JSON.stringify(outputSchema, null, 2)}`

      // Prepend system message with schema
      const messagesWithSchema: Array<OpenAI_SDK.Chat.Completions.ChatCompletionMessageParam> =
        [
          { role: 'system', content: systemPromptWithSchema },
          ...(Array.isArray(requestParams.messages)
            ? requestParams.messages
            : []),
        ]

      // Make non-streaming request with JSON format
      const response = await this.client.chat.completions.create({
        ...requestParams,
        messages: messagesWithSchema,
        stream: false,
        response_format: {
          type: 'json_object',
        },
      })

      const rawText = response.choices[0]!.message.content || ''

      // Parse the JSON response
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
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

  private async *processNebiusStreamChunks(
    stream: AsyncIterable<OpenAI_SDK.Chat.Completions.ChatCompletionChunk>,
    options: TextOptions,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    const timestamp = Date.now()
    const responseId = generateId('msg')
    let model = options.model
    let hasEmittedToolCalls = false
    const toolCallMetadata = new Map<
      string,
      { index: number; name: string; arguments: string }
    >()

    try {
      for await (const chunk of stream) {
        // Update model from chunk if available
        if (chunk.model) {
          model = chunk.model
        }

        // Handle content deltas
        const delta = chunk.choices[0]?.delta
        if (delta?.content) {
          accumulatedContent += delta.content
          yield {
            type: 'content',
            id: responseId,
            model,
            timestamp,
            delta: delta.content,
            content: accumulatedContent,
            role: 'assistant',
          }
        }

        // Handle tool call deltas
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const toolCallId = toolCallDelta.id
            if (!toolCallId) continue

            if (!toolCallMetadata.has(toolCallId)) {
              toolCallMetadata.set(toolCallId, {
                index: toolCallDelta.index || 0,
                name: toolCallDelta.function?.name || '',
                arguments: toolCallDelta.function?.arguments || '',
              })
            } else {
              const metadata = toolCallMetadata.get(toolCallId)!
              if (toolCallDelta.function?.arguments) {
                metadata.arguments += toolCallDelta.function.arguments
              }
            }
          }
        }

        // Handle finish reason
        const finishReason = chunk.choices[0]?.finish_reason
        if (finishReason) {
          // Emit any pending tool calls
          if (toolCallMetadata.size > 0) {
            for (const [toolCallId, metadata] of toolCallMetadata.entries()) {
              yield {
                type: 'tool_call',
                id: responseId,
                model,
                timestamp,
                index: metadata.index,
                toolCall: {
                  id: toolCallId,
                  type: 'function',
                  function: {
                    name: metadata.name,
                    arguments: metadata.arguments,
                  },
                },
              }
              hasEmittedToolCalls = true
            }
          }

          yield {
            type: 'done',
            id: responseId,
            model,
            timestamp,
            finishReason:
              finishReason === 'tool_calls' || hasEmittedToolCalls
                ? 'tool_calls'
                : finishReason === 'length'
                  ? 'length'
                  : 'stop',
            usage: chunk.usage
              ? {
                  promptTokens: chunk.usage.prompt_tokens || 0,
                  completionTokens: chunk.usage.completion_tokens || 0,
                  totalTokens: chunk.usage.total_tokens || 0,
                }
              : undefined,
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error
      yield {
        type: 'error',
        id: responseId,
        model,
        timestamp,
        error: {
          message: err.message || 'Unknown error occurred',
        },
      }
    }
  }

  private convertToolsToNebiusFormat(
    tools?: Array<Tool>,
  ): Array<OpenAI_SDK.Chat.Completions.ChatCompletionTool> | undefined {
    if (!tools || tools.length === 0) {
      return undefined
    }

    return tools.map(
      (tool) =>
        ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: (tool.inputSchema ?? {
              type: 'object',
              properties: {},
              required: [],
            }) as OpenAI_SDK.FunctionParameters,
          },
        }) satisfies OpenAI_SDK.Chat.Completions.ChatCompletionTool,
    )
  }

  private formatMessages(
    messages: TextOptions['messages'],
  ): Array<OpenAI_SDK.Chat.Completions.ChatCompletionMessageParam> {
    return messages.map((msg) => {
      switch (msg.role) {
        case 'tool':
          return {
            role: 'tool',
            tool_call_id: msg.toolCallId || '',
            content:
              typeof msg.content === 'string'
                ? msg.content
                : JSON.stringify(msg.content),
          }

        case 'assistant': {
          const assistantContent: string | null =
            typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content
                    .filter((p) => p.type === 'text')
                    .map((p) => p.content)
                    .join('')
                : null

          const result: OpenAI_SDK.Chat.Completions.ChatCompletionAssistantMessageParam =
            {
              role: 'assistant',
              content: assistantContent || '',
            }

          // Add tool calls if present
          if (msg.toolCalls && msg.toolCalls.length > 0) {
            result.tool_calls = msg.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.function.name,
                arguments:
                  typeof toolCall.function.arguments === 'string'
                    ? toolCall.function.arguments
                    : JSON.stringify(toolCall.function.arguments),
              },
            }))
          }

          return result
        }

        case 'user':
        default: {
          const contentParts: Array<
            | OpenAI_SDK.Chat.Completions.ChatCompletionContentPartText
            | OpenAI_SDK.Chat.Completions.ChatCompletionContentPartImage
          > = []

          if (typeof msg.content === 'string') {
            contentParts.push({
              type: 'text',
              text: msg.content,
            })
          } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === 'text') {
                contentParts.push({
                  type: 'text',
                  text: part.content,
                })
              } else if (part.type === 'image') {
                const imageMetadata = part.metadata as
                  | NebiusImageMetadata
                  | undefined
                contentParts.push({
                  type: 'image_url',
                  image_url: {
                    url: part.source.value,
                    detail: imageMetadata?.detail || 'auto',
                  },
                })
              }
            }
          }

          // If single text part, use string; otherwise use array
          const firstPart = contentParts[0]
          const useSimpleString =
            contentParts.length === 1 &&
            firstPart !== undefined &&
            firstPart.type === 'text'

          return {
            role: 'user',
            content: useSimpleString ? firstPart.text : contentParts,
          }
        }
      }
    })
  }

  private mapTextOptionsToNebius(
    options: TextOptions,
  ): OpenAI_SDK.Chat.Completions.ChatCompletionCreateParams {
    const modelOptions = options.modelOptions as
      | NebiusTextProviderOptions
      | undefined

    // Build messages array
    const formattedMessages = this.formatMessages(options.messages)
    const messages: Array<OpenAI_SDK.Chat.Completions.ChatCompletionMessageParam> =
      options.systemPrompts && options.systemPrompts.length > 0
        ? [
            {
              role: 'system',
              content: options.systemPrompts.join('\n'),
            },
            ...formattedMessages,
          ]
        : formattedMessages

    return {
      model: options.model,
      messages,
      temperature: options.temperature ?? modelOptions?.temperature,
      top_p: options.topP ?? modelOptions?.top_p,
      max_tokens: options.maxTokens ?? modelOptions?.max_tokens,
      stop: modelOptions?.stop,
      presence_penalty: modelOptions?.presence_penalty,
      frequency_penalty: modelOptions?.frequency_penalty,
      logit_bias: modelOptions?.logit_bias,
      user: modelOptions?.user,
      tools: this.convertToolsToNebiusFormat(options.tools),
    }
  }
}

/**
 * Creates a Nebius chat adapter with explicit API key.
 * Type resolution happens here at the call site.
 */
export function createNebiusChat<TModel extends string>(
  model: TModel,
  apiKey: string,
  config?: Omit<NebiusTextAdapterOptions, 'apiKey'>,
): NebiusTextAdapter<TModel> {
  return new NebiusTextAdapter({ apiKey, ...config }, model)
}

/**
 * Creates a Nebius text adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `NEBIUS_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'deepseek-ai/DeepSeek-R1-0528', 'meta-llama/Meta-Llama-3.1-70B-Instruct')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Nebius text adapter instance with resolved types
 * @throws Error if NEBIUS_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses NEBIUS_API_KEY from environment
 * const adapter = nebiusText('deepseek-ai/DeepSeek-R1-0528');
 *
 * const stream = chat({
 *   adapter,
 *   messages: [{ role: "user", content: "Hello!" }]
 * });
 * ```
 */
export function nebiusText<TModel extends string>(
  model: TModel,
  config?: Omit<NebiusTextAdapterOptions, 'apiKey'>,
): NebiusTextAdapter<TModel> {
  return new NebiusTextAdapter(config, model)
}
