import { BaseTextAdapter } from '@tanstack/ai/adapters'

import { createOllamaClient, generateId, getOllamaHostFromEnv } from '../utils'

import type {
  OLLAMA_TEXT_MODELS,
  OllamaChatModelOptionsByName,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  AbortableAsyncIterator,
  ChatRequest,
  ChatResponse,
  Message,
  Ollama,
  Tool as OllamaTool,
  ToolCall,
} from 'ollama'
import type { StreamChunk, TextOptions, Tool } from '@tanstack/ai'

export type OllamaTextModel =
  | (typeof OLLAMA_TEXT_MODELS)[number]
  | (string & {})

/**
 * Resolve model options for a specific model.
 * If the model has explicit options in the map, use those; otherwise use base options.
 */
type ResolveModelOptions<TModel extends string> =
  TModel extends keyof OllamaChatModelOptionsByName
    ? OllamaChatModelOptionsByName[TModel]
    : ChatRequest

/**
 * Ollama-specific provider options
 */
export interface OllamaTextProviderOptions {
  /** Number of tokens to keep from the prompt */
  num_keep?: number
  /** Number of tokens from context to consider for next token prediction */
  top_k?: number
  /** Minimum probability for nucleus sampling */
  min_p?: number
  /** Tail-free sampling parameter */
  tfs_z?: number
  /** Typical probability sampling parameter */
  typical_p?: number
  /** Number of previous tokens to consider for repetition penalty */
  repeat_last_n?: number
  /** Penalty for repeating tokens */
  repeat_penalty?: number
  /** Enable Mirostat sampling (0=disabled, 1=Mirostat, 2=Mirostat 2.0) */
  mirostat?: number
  /** Target entropy for Mirostat */
  mirostat_tau?: number
  /** Learning rate for Mirostat */
  mirostat_eta?: number
  /** Enable penalize_newline */
  penalize_newline?: boolean
  /** Enable NUMA support */
  numa?: boolean
  /** Context window size */
  num_ctx?: number
  /** Batch size for prompt processing */
  num_batch?: number
  /** Number of GQA groups (for some models) */
  num_gqa?: number
  /** Number of GPU layers to use */
  num_gpu?: number
  /** GPU to use for inference */
  main_gpu?: number
  /** Use memory-mapped model */
  use_mmap?: boolean
  /** Use memory-locked model */
  use_mlock?: boolean
  /** Number of threads to use */
  num_thread?: number
}

export interface OllamaTextAdapterOptions {
  model?: OllamaTextModel
  host?: string
}

/**
 * Default input modalities for Ollama models
 */
type OllamaInputModalities = readonly ['text', 'image']

/**
 * Default message metadata for Ollama
 */
type OllamaMessageMetadataByModality = {
  text: unknown
  image: unknown
  audio: unknown
  video: unknown
  document: unknown
}

/**
 * Ollama Text/Chat Adapter
 * A tree-shakeable chat adapter for Ollama
 *
 * Note: Ollama supports any model name as a string since models are loaded dynamically.
 * The predefined OllamaTextModels are common models but any string is accepted.
 */
export class OllamaTextAdapter<TModel extends string> extends BaseTextAdapter<
  TModel,
  ResolveModelOptions<TModel>,
  OllamaInputModalities,
  OllamaMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'ollama' as const

  private client: Ollama

  constructor(hostOrClient: string | Ollama | undefined, model: TModel) {
    super({}, model)
    if (typeof hostOrClient === 'string' || hostOrClient === undefined) {
      this.client = createOllamaClient({ host: hostOrClient })
    } else {
      this.client = hostOrClient
    }
  }

  async *chatStream(options: TextOptions): AsyncIterable<StreamChunk> {
    const mappedOptions = this.mapCommonOptionsToOllama(options)
    const response = await this.client.chat({
      ...mappedOptions,
      stream: true,
    })
    yield* this.processOllamaStreamChunks(response)
  }

  /**
   * Generate structured output using Ollama's JSON format option.
   * Uses format: 'json' with the schema to ensure structured output.
   * The outputSchema is already JSON Schema (converted in the ai layer).
   */
  async structuredOutput(
    options: StructuredOutputOptions<ResolveModelOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options

    const mappedOptions = this.mapCommonOptionsToOllama(chatOptions)

    try {
      // Make non-streaming request with JSON format
      const response = await this.client.chat({
        ...mappedOptions,
        stream: false,
        format: outputSchema,
      })

      const rawText = response.message.content

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

  private async *processOllamaStreamChunks(
    stream: AbortableAsyncIterator<ChatResponse>,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    const timestamp = Date.now()
    let accumulatedReasoning = ''
    const toolCallsEmitted = new Set<string>()

    // AG-UI lifecycle tracking
    const runId = generateId('run')
    const messageId = generateId('msg')
    let stepId: string | null = null
    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false
    let hasEmittedStepStarted = false

    for await (const chunk of stream) {
      // Emit RUN_STARTED on first chunk
      if (!hasEmittedRunStarted) {
        hasEmittedRunStarted = true
        yield {
          type: 'RUN_STARTED',
          runId,
          model: chunk.model,
          timestamp,
        }
      }

      const handleToolCall = (toolCall: ToolCall): Array<StreamChunk> => {
        const actualToolCall = toolCall as ToolCall & {
          id: string
          function: { index: number }
        }
        const toolCallId =
          actualToolCall.id || `${actualToolCall.function.name}_${Date.now()}`
        const events: Array<StreamChunk> = []

        // Emit TOOL_CALL_START if not already emitted for this tool call
        if (!toolCallsEmitted.has(toolCallId)) {
          toolCallsEmitted.add(toolCallId)
          events.push({
            type: 'TOOL_CALL_START',
            toolCallId,
            toolName: actualToolCall.function.name || '',
            model: chunk.model,
            timestamp,
            index: actualToolCall.function.index,
          })
        }

        // Parse input
        let parsedInput: unknown = {}
        const argsStr =
          typeof actualToolCall.function.arguments === 'string'
            ? actualToolCall.function.arguments
            : JSON.stringify(actualToolCall.function.arguments)
        try {
          parsedInput = JSON.parse(argsStr)
        } catch {
          parsedInput = actualToolCall.function.arguments
        }

        // Emit TOOL_CALL_END
        events.push({
          type: 'TOOL_CALL_END',
          toolCallId,
          toolName: actualToolCall.function.name || '',
          model: chunk.model,
          timestamp,
          input: parsedInput,
        })

        return events
      }

      if (chunk.done) {
        if (chunk.message.tool_calls && chunk.message.tool_calls.length > 0) {
          for (const toolCall of chunk.message.tool_calls) {
            const events = handleToolCall(toolCall)
            for (const event of events) {
              yield event
            }
          }
        }

        // Emit TEXT_MESSAGE_END if we had text content
        if (hasEmittedTextMessageStart) {
          yield {
            type: 'TEXT_MESSAGE_END',
            messageId,
            model: chunk.model,
            timestamp,
          }
        }

        yield {
          type: 'RUN_FINISHED',
          runId,
          model: chunk.model,
          timestamp,
          finishReason: toolCallsEmitted.size > 0 ? 'tool_calls' : 'stop',
        }
        continue
      }

      if (chunk.message.content) {
        // Emit TEXT_MESSAGE_START on first text content
        if (!hasEmittedTextMessageStart) {
          hasEmittedTextMessageStart = true
          yield {
            type: 'TEXT_MESSAGE_START',
            messageId,
            model: chunk.model,
            timestamp,
            role: 'assistant',
          }
        }

        accumulatedContent += chunk.message.content
        yield {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId,
          model: chunk.model,
          timestamp,
          delta: chunk.message.content,
          content: accumulatedContent,
        }
      }

      if (chunk.message.tool_calls && chunk.message.tool_calls.length > 0) {
        for (const toolCall of chunk.message.tool_calls) {
          const events = handleToolCall(toolCall)
          for (const event of events) {
            yield event
          }
        }
      }

      if (chunk.message.thinking) {
        // Emit STEP_STARTED on first thinking content
        if (!hasEmittedStepStarted) {
          hasEmittedStepStarted = true
          stepId = generateId('step')
          yield {
            type: 'STEP_STARTED',
            stepId,
            model: chunk.model,
            timestamp,
            stepType: 'thinking',
          }
        }

        accumulatedReasoning += chunk.message.thinking
        yield {
          type: 'STEP_FINISHED',
          stepId: stepId || generateId('step'),
          model: chunk.model,
          timestamp,
          delta: chunk.message.thinking,
          content: accumulatedReasoning,
        }
      }
    }
  }

  private convertToolsToOllamaFormat(
    tools?: Array<Tool>,
  ): Array<OllamaTool> | undefined {
    if (!tools || tools.length === 0) {
      return undefined
    }

    // Tool schemas are already converted to JSON Schema in the ai layer.
    // We use a type assertion because our JSONSchema type is more flexible
    // than ollama's expected schema type (e.g., type can be string | string[]).
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: (tool.inputSchema ?? {
          type: 'object',
          properties: {},
          required: [],
        }) as OllamaTool['function']['parameters'],
      },
    }))
  }

  private formatMessages(messages: TextOptions['messages']): Array<Message> {
    return messages.map((msg) => {
      let textContent = ''
      const images: Array<string> = []

      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            textContent += part.content
          } else if (part.type === 'image') {
            if (part.source.type === 'data') {
              images.push(part.source.value)
            } else {
              images.push(part.source.value)
            }
          }
        }
      } else {
        textContent = msg.content || ''
      }

      const hasToolCallId = msg.role === 'tool' && msg.toolCallId
      return {
        role: hasToolCallId ? 'tool' : msg.role,
        content: hasToolCallId
          ? typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content)
          : textContent,
        ...(images.length > 0 ? { images } : {}),
        ...(msg.role === 'assistant' &&
        msg.toolCalls &&
        msg.toolCalls.length > 0
          ? {
              tool_calls: msg.toolCalls.map((toolCall) => {
                let parsedArguments: Record<string, unknown> = {}
                if (typeof toolCall.function.arguments === 'string') {
                  try {
                    parsedArguments = JSON.parse(
                      toolCall.function.arguments,
                    ) as Record<string, unknown>
                  } catch {
                    parsedArguments = {}
                  }
                } else {
                  parsedArguments = toolCall.function
                    .arguments as unknown as Record<string, unknown>
                }

                return {
                  id: toolCall.id,
                  type: toolCall.type,
                  function: {
                    name: toolCall.function.name,
                    arguments: parsedArguments,
                  },
                }
              }),
            }
          : {}),
      }
    })
  }

  private mapCommonOptionsToOllama(options: TextOptions): ChatRequest {
    const model = options.model
    const modelOptions = options.modelOptions as
      | OllamaTextProviderOptions
      | undefined

    const ollamaOptions = {
      temperature: options.temperature,
      top_p: options.topP,
      num_predict: options.maxTokens,
      ...modelOptions,
    }

    return {
      model,
      options: ollamaOptions,
      messages: this.formatMessages(options.messages),
      tools: this.convertToolsToOllamaFormat(options.tools),
    }
  }
}

/**
 * Creates an Ollama chat adapter with explicit host.
 * Type resolution happens here at the call site.
 */
export function createOllamaChat<TModel extends string>(
  model: TModel,
  host?: string,
): OllamaTextAdapter<TModel> {
  return new OllamaTextAdapter(host, model)
}

/**
 * Creates an Ollama text adapter with host from environment.
 * Type resolution happens here at the call site.
 */
export function ollamaText<TModel extends string>(
  model: TModel,
): OllamaTextAdapter<TModel> {
  const host = getOllamaHostFromEnv()
  return new OllamaTextAdapter(host, model)
}
