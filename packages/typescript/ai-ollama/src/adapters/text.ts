import { EventType } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'

import { createOllamaClient, generateId, getOllamaHostFromEnv } from '../utils'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import type { OllamaClientConfig } from '../utils/client'

import type {
  OLLAMA_TEXT_MODELS,
  OllamaChatModelOptionsByName,
} from '../model-meta'
import type {
  NonStreamingChatResult,
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
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

  constructor(
    hostOrClientOrConfig: string | Ollama | OllamaClientConfig | undefined,
    model: TModel,
  ) {
    super({}, model)
    if (
      typeof hostOrClientOrConfig === 'string' ||
      hostOrClientOrConfig === undefined
    ) {
      this.client = createOllamaClient({ host: hostOrClientOrConfig })
    } else if ('chat' in hostOrClientOrConfig) {
      // Ollama client instance (has a chat method)
      this.client = hostOrClientOrConfig
    } else {
      // OllamaClientConfig object
      this.client = createOllamaClient(hostOrClientOrConfig)
    }
  }

  async *chatStream(options: TextOptions): AsyncIterable<StreamChunk> {
    const mappedOptions = this.mapCommonOptionsToOllama(options)
    const { logger } = options
    try {
      logger.request(
        `activity=chat provider=ollama model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: 'ollama', model: this.model },
      )
      const response = await this.client.chat({
        ...mappedOptions,
        stream: true,
      })
      yield* this.processOllamaStreamChunks(response, options, logger)
    } catch (error: unknown) {
      logger.errors('ollama.chatStream fatal', {
        error,
        source: 'ollama.chatStream',
      })
      throw error
    }
  }

  /**
   * Wire-level non-streaming chat — sends `stream: false` to Ollama
   * (issue #557). Mirrors `chatStream` for option mapping and tool/format
   * conversion, then maps Ollama's `ChatResponse` shape to NonStreamingChatResult.
   */
  async chatNonStreaming(
    options: TextOptions<ResolveModelOptions<TModel>>,
  ): Promise<NonStreamingChatResult> {
    const { logger } = options
    const mappedOptions = this.mapCommonOptionsToOllama(options)

    try {
      logger.request(
        `activity=chat provider=ollama model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=false`,
        { provider: 'ollama', model: this.model },
      )

      const response = await this.client.chat({
        ...mappedOptions,
        stream: false,
      })

      const message = response.message
      const content = message.content
      const reasoning = (message as { thinking?: string }).thinking

      const toolCalls = message.tool_calls?.map((tc, idx) => ({
        // Ollama tool calls don't carry IDs — synthesise one matching the
        // streaming side's convention so subsequent turns can correlate
        // tool results back to calls.
        id: `${this.name}-tool-${Date.now()}-${idx}`,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          // Ollama returns parsed argument objects; normalise to a JSON
          // string to match TOOL_CALL_END / OpenAI conventions so the
          // dispatch layer's tool executor can JSON.parse them uniformly.
          arguments: JSON.stringify(tc.function.arguments),
        },
      }))

      const finishReason: NonStreamingChatResult['finishReason'] =
        toolCalls && toolCalls.length > 0
          ? 'tool_calls'
          : response.done_reason === 'length'
            ? 'length'
            : 'stop'

      const usage = {
        promptTokens: response.prompt_eval_count,
        completionTokens: response.eval_count,
        totalTokens: response.prompt_eval_count + response.eval_count,
      }

      return {
        content,
        ...(reasoning ? { reasoning } : {}),
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
        finishReason,
        usage,
      }
    } catch (error: unknown) {
      logger.errors('ollama.chatNonStreaming fatal', {
        error,
        source: 'ollama.chatNonStreaming',
      })
      throw error
    }
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
    const { logger } = chatOptions

    const mappedOptions = this.mapCommonOptionsToOllama(chatOptions)

    try {
      logger.request(
        `activity=chat provider=ollama model=${this.model} messages=${chatOptions.messages.length} tools=${chatOptions.tools?.length ?? 0} stream=false`,
        { provider: 'ollama', model: this.model },
      )
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
      logger.errors('ollama.structuredOutput fatal', {
        error,
        source: 'ollama.structuredOutput',
      })
      throw new Error(
        `Structured output generation failed: ${err.message || 'Unknown error occurred'}`,
      )
    }
  }

  private async *processOllamaStreamChunks(
    stream: AbortableAsyncIterator<ChatResponse>,
    options: TextOptions,
    logger: InternalLogger,
  ): AsyncIterable<StreamChunk> {
    let accumulatedContent = ''
    let accumulatedReasoning = ''
    const toolCallsEmitted = new Set<string>()

    // AG-UI lifecycle tracking
    const runId = options.runId ?? generateId('run')
    const threadId = options.threadId ?? generateId('thread')
    const messageId = generateId('msg')
    let stepId: string | null = null
    let reasoningMessageId: string | null = null
    let hasClosedReasoning = false
    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false
    let hasEmittedStepStarted = false

    for await (const chunk of stream) {
      logger.provider(`provider=ollama`, { chunk })
      // Emit RUN_STARTED on first chunk
      if (!hasEmittedRunStarted) {
        hasEmittedRunStarted = true
        yield {
          type: EventType.RUN_STARTED,
          runId,
          threadId,
          model: chunk.model,
          timestamp: Date.now(),
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
            type: EventType.TOOL_CALL_START,
            toolCallId,
            toolCallName: actualToolCall.function.name || '',
            toolName: actualToolCall.function.name || '',
            model: chunk.model,
            timestamp: Date.now(),
            index: actualToolCall.function.index,
          })
        }

        // Serialize arguments to a string for the TOOL_CALL_ARGS event
        let parsedInput: unknown = {}
        const argsStr =
          typeof actualToolCall.function.arguments === 'string'
            ? actualToolCall.function.arguments
            : JSON.stringify(actualToolCall.function.arguments)
        try {
          const parsed = JSON.parse(argsStr)
          parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
        } catch {
          parsedInput = actualToolCall.function.arguments
        }

        // Emit TOOL_CALL_ARGS with full args (Ollama doesn't stream args incrementally)
        events.push({
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          model: chunk.model,
          timestamp: Date.now(),
          delta: argsStr,
          args: argsStr,
        })

        // Emit TOOL_CALL_END
        events.push({
          type: EventType.TOOL_CALL_END,
          toolCallId,
          toolCallName: actualToolCall.function.name || '',
          toolName: actualToolCall.function.name || '',
          model: chunk.model,
          timestamp: Date.now(),
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

        // Close reasoning events if still open
        if (reasoningMessageId && !hasClosedReasoning) {
          hasClosedReasoning = true
          yield {
            type: EventType.REASONING_MESSAGE_END,
            messageId: reasoningMessageId,
            model: chunk.model,
            timestamp: Date.now(),
          }
          yield {
            type: EventType.REASONING_END,
            messageId: reasoningMessageId,
            model: chunk.model,
            timestamp: Date.now(),
          }
        }

        // Emit TEXT_MESSAGE_END if we had text content
        if (hasEmittedTextMessageStart) {
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId,
            model: chunk.model,
            timestamp: Date.now(),
          }
        }

        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          model: chunk.model,
          timestamp: Date.now(),
          finishReason: toolCallsEmitted.size > 0 ? 'tool_calls' : 'stop',
          usage: {
            promptTokens: chunk.prompt_eval_count || 0,
            completionTokens: chunk.eval_count || 0,
            totalTokens:
              (chunk.prompt_eval_count || 0) + (chunk.eval_count || 0),
          },
        }
        continue
      }

      if (chunk.message.content) {
        // Close reasoning before text starts
        if (reasoningMessageId && !hasClosedReasoning) {
          hasClosedReasoning = true
          yield {
            type: EventType.REASONING_MESSAGE_END,
            messageId: reasoningMessageId,
            model: chunk.model,
            timestamp: Date.now(),
          }
          yield {
            type: EventType.REASONING_END,
            messageId: reasoningMessageId,
            model: chunk.model,
            timestamp: Date.now(),
          }
        }

        // Emit TEXT_MESSAGE_START on first text content
        if (!hasEmittedTextMessageStart) {
          hasEmittedTextMessageStart = true
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId,
            model: chunk.model,
            timestamp: Date.now(),
            role: 'assistant',
          }
        }

        accumulatedContent += chunk.message.content
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          model: chunk.model,
          timestamp: Date.now(),
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
        // Emit STEP_STARTED and REASONING events on first thinking content
        if (!hasEmittedStepStarted) {
          hasEmittedStepStarted = true
          stepId = generateId('step')
          reasoningMessageId = generateId('msg')

          // Spec REASONING events
          yield {
            type: EventType.REASONING_START,
            messageId: reasoningMessageId,
            model: chunk.model,
            timestamp: Date.now(),
          }
          yield {
            type: EventType.REASONING_MESSAGE_START,
            messageId: reasoningMessageId,
            role: 'reasoning' as const,
            model: chunk.model,
            timestamp: Date.now(),
          }

          // Legacy STEP events (kept during transition)
          yield {
            type: EventType.STEP_STARTED,
            stepName: stepId,
            stepId,
            model: chunk.model,
            timestamp: Date.now(),
            stepType: 'thinking',
          }
        }

        accumulatedReasoning += chunk.message.thinking

        // Spec REASONING content event
        yield {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId: reasoningMessageId!,
          delta: chunk.message.thinking,
          model: chunk.model,
          timestamp: Date.now(),
        }

        // Legacy STEP event
        yield {
          type: EventType.STEP_FINISHED,
          stepName: stepId || generateId('step'),
          stepId: stepId || generateId('step'),
          model: chunk.model,
          timestamp: Date.now(),
          delta: chunk.message.thinking,
          content: accumulatedReasoning,
        }
      }
    }
  }

  private convertToolsToOllamaFormat(
    tools?: Array<Tool>,
  ): Array<OllamaTool> | undefined {
    return convertToolsToProviderFormat(tools)
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
      ...(options.systemPrompts?.length
        ? { system: options.systemPrompts.join('\n') }
        : {}),
    }
  }
}

/**
 * Creates an Ollama chat adapter with explicit host and optional config.
 * Type resolution happens here at the call site.
 */
export function createOllamaChat<TModel extends string>(
  model: TModel,
  hostOrConfig?: string | OllamaClientConfig,
): OllamaTextAdapter<TModel> {
  return new OllamaTextAdapter(hostOrConfig, model)
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
