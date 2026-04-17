import { OpenRouter } from '@openrouter/sdk'
import { RequestAbortedError } from '@openrouter/sdk/models/errors'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools'
import {
  getOpenRouterApiKeyFromEnv,
  generateId as utilGenerateId,
} from '../utils'
import type { SDKOptions } from '@openrouter/sdk'
import type {
  OPENROUTER_CHAT_MODELS,
  OpenRouterModelInputModalitiesByName,
  OpenRouterModelOptionsByName,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type {
  ContentPart,
  ModelMessage,
  StreamChunk,
  TextOptions,
} from '@tanstack/ai'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'
import type {
  OpenRouterImageMetadata,
  OpenRouterMessageMetadataByModality,
} from '../message-types'
import type {
  ChatContentItems,
  ChatMessages,
  ChatRequest,
  ChatStreamChoice,
  ChatUsage,
} from '@openrouter/sdk/models'

export interface OpenRouterConfig extends SDKOptions {}
export type OpenRouterTextModels = (typeof OPENROUTER_CHAT_MODELS)[number]

export type OpenRouterTextModelOptions = ExternalTextProviderOptions

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof OpenRouterModelOptionsByName
    ? OpenRouterModelOptionsByName[TModel]
    : OpenRouterTextModelOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof OpenRouterModelInputModalitiesByName
    ? OpenRouterModelInputModalitiesByName[TModel]
    : readonly ['text', 'image']

// Internal buffer for accumulating streamed tool calls
interface ToolCallBuffer {
  id: string
  name: string
  arguments: string
  started: boolean // Track if TOOL_CALL_START has been emitted
}

// AG-UI lifecycle state tracking
interface AGUIState {
  runId: string
  messageId: string
  stepId: string | null
  hasEmittedRunStarted: boolean
  hasEmittedTextMessageStart: boolean
  hasEmittedStepStarted: boolean
}

export class OpenRouterTextAdapter<
  TModel extends OpenRouterTextModels,
> extends BaseTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  OpenRouterMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'openrouter' as const

  private client: OpenRouter

  constructor(config: OpenRouterConfig, model: TModel) {
    super({}, model)
    this.client = new OpenRouter(config)
  }

  async *chatStream(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): AsyncIterable<StreamChunk> {
    const timestamp = Date.now()
    const toolCallBuffers = new Map<number, ToolCallBuffer>()
    let accumulatedReasoning = ''
    let accumulatedContent = ''
    let responseId: string | null = null
    let currentModel = options.model
    // AG-UI lifecycle tracking
    const aguiState: AGUIState = {
      runId: this.generateId(),
      messageId: this.generateId(),
      stepId: null,
      hasEmittedRunStarted: false,
      hasEmittedTextMessageStart: false,
      hasEmittedStepStarted: false,
    }

    try {
      const requestParams = this.mapTextOptionsToSDK(options)
      const stream = await this.client.chat.send(
        { chatRequest: { ...requestParams, stream: true } },
        { signal: options.request?.signal },
      )

      for await (const chunk of stream) {
        if (chunk.id) responseId = chunk.id
        if (chunk.model) currentModel = chunk.model

        // Emit RUN_STARTED on first chunk
        if (!aguiState.hasEmittedRunStarted) {
          aguiState.hasEmittedRunStarted = true
          yield {
            type: 'RUN_STARTED',
            runId: aguiState.runId,
            model: currentModel || options.model,
            timestamp,
          }
        }

        if (chunk.error) {
          // Emit AG-UI RUN_ERROR
          yield {
            type: 'RUN_ERROR',
            runId: aguiState.runId,
            model: currentModel || options.model,
            timestamp,
            error: {
              message: chunk.error.message || 'Unknown error',
              code: String(chunk.error.code),
            },
          }
          continue
        }

        for (const choice of chunk.choices) {
          yield* this.processChoice(
            choice,
            toolCallBuffers,
            {
              id: responseId || this.generateId(),
              model: currentModel,
              timestamp,
            },
            { reasoning: accumulatedReasoning, content: accumulatedContent },
            (r, c) => {
              accumulatedReasoning = r
              accumulatedContent = c
            },
            chunk.usage,
            aguiState,
          )
        }
      }
    } catch (error) {
      // Emit RUN_STARTED if not yet emitted (error on first call)
      if (!aguiState.hasEmittedRunStarted) {
        aguiState.hasEmittedRunStarted = true
        yield {
          type: 'RUN_STARTED',
          runId: aguiState.runId,
          model: options.model,
          timestamp,
        }
      }

      if (error instanceof RequestAbortedError) {
        // Emit AG-UI RUN_ERROR
        yield {
          type: 'RUN_ERROR',
          runId: aguiState.runId,
          model: options.model,
          timestamp,
          error: {
            message: 'Request aborted',
            code: 'aborted',
          },
        }
        return
      }

      // Emit AG-UI RUN_ERROR
      yield {
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: options.model,
        timestamp,
        error: {
          message: (error as Error).message || 'Unknown error',
        },
      }
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<ResolveProviderOptions<TModel>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options

    const requestParams = this.mapTextOptionsToSDK(chatOptions)

    // OpenRouter uses OpenAI-style strict JSON schema. Upstream providers
    // (OpenAI especially) reject schemas that aren't strict-compatible — all
    // properties required, additionalProperties: false, optional fields
    // nullable. Apply that transformation before sending.
    const strictSchema = convertSchemaToJsonSchema(outputSchema, {
      forStructuredOutput: true,
    })

    try {
      const result = await this.client.chat.send(
        {
          chatRequest: {
            ...requestParams,
            stream: false,
            responseFormat: {
              type: 'json_schema',
              jsonSchema: {
                name: 'structured_output',
                schema: strictSchema,
                strict: true,
              },
            },
          },
        },
        { signal: chatOptions.request?.signal },
      )
      const content = result.choices[0]?.message.content
      const rawText = typeof content === 'string' ? content : ''
      if (!rawText) {
        throw new Error('Structured output response contained no content')
      }
      const parsed = JSON.parse(rawText)
      return { data: parsed, rawText }
    } catch (error: unknown) {
      if (error instanceof RequestAbortedError) {
        throw new Error('Structured output generation aborted')
      }
      if (error instanceof SyntaxError) {
        throw new Error(
          `Failed to parse structured output as JSON: ${error.message}`,
        )
      }
      const err = error as Error
      throw new Error(
        `Structured output generation failed: ${err.message || 'Unknown error occurred'}`,
      )
    }
  }

  protected override generateId(): string {
    return utilGenerateId(this.name)
  }

  private *processChoice(
    choice: ChatStreamChoice,
    toolCallBuffers: Map<number, ToolCallBuffer>,
    meta: { id: string; model: string; timestamp: number },
    accumulated: { reasoning: string; content: string },
    updateAccumulated: (reasoning: string, content: string) => void,
    usage: ChatUsage | undefined,
    aguiState: AGUIState,
  ): Iterable<StreamChunk> {
    const delta = choice.delta
    const finishReason = choice.finishReason

    if (delta.content) {
      // Emit TEXT_MESSAGE_START on first text content
      if (!aguiState.hasEmittedTextMessageStart) {
        aguiState.hasEmittedTextMessageStart = true
        yield {
          type: 'TEXT_MESSAGE_START',
          messageId: aguiState.messageId,
          model: meta.model,
          timestamp: meta.timestamp,
          role: 'assistant',
        }
      }

      accumulated.content += delta.content
      updateAccumulated(accumulated.reasoning, accumulated.content)

      // Emit AG-UI TEXT_MESSAGE_CONTENT
      yield {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: aguiState.messageId,
        model: meta.model,
        timestamp: meta.timestamp,
        delta: delta.content,
        content: accumulated.content,
      }
    }

    if (delta.reasoningDetails) {
      for (const detail of delta.reasoningDetails) {
        if (detail.type === 'reasoning.text') {
          const text = detail.text || ''

          // Emit STEP_STARTED on first reasoning content
          if (!aguiState.hasEmittedStepStarted) {
            aguiState.hasEmittedStepStarted = true
            aguiState.stepId = this.generateId()
            yield {
              type: 'STEP_STARTED',
              stepId: aguiState.stepId,
              model: meta.model,
              timestamp: meta.timestamp,
              stepType: 'thinking',
            }
          }

          accumulated.reasoning += text
          updateAccumulated(accumulated.reasoning, accumulated.content)

          // Emit AG-UI STEP_FINISHED for reasoning delta
          yield {
            type: 'STEP_FINISHED',
            stepId: aguiState.stepId!,
            model: meta.model,
            timestamp: meta.timestamp,
            delta: text,
            content: accumulated.reasoning,
          }
          continue
        }
        if (detail.type === 'reasoning.summary') {
          const text = detail.summary || ''

          // Emit STEP_STARTED on first reasoning content
          if (!aguiState.hasEmittedStepStarted) {
            aguiState.hasEmittedStepStarted = true
            aguiState.stepId = this.generateId()
            yield {
              type: 'STEP_STARTED',
              stepId: aguiState.stepId,
              model: meta.model,
              timestamp: meta.timestamp,
              stepType: 'thinking',
            }
          }

          accumulated.reasoning += text
          updateAccumulated(accumulated.reasoning, accumulated.content)

          // Emit AG-UI STEP_FINISHED for reasoning delta
          yield {
            type: 'STEP_FINISHED',
            stepId: aguiState.stepId!,
            model: meta.model,
            timestamp: meta.timestamp,
            delta: text,
            content: accumulated.reasoning,
          }
          continue
        }
      }
    }

    if (delta.toolCalls) {
      for (const tc of delta.toolCalls) {
        const existing = toolCallBuffers.get(tc.index)
        if (!existing) {
          if (!tc.id) {
            continue
          }
          toolCallBuffers.set(tc.index, {
            id: tc.id,
            name: tc.function?.name ?? '',
            arguments: tc.function?.arguments ?? '',
            started: false,
          })
        } else {
          if (tc.function?.name) existing.name = tc.function.name
          if (tc.function?.arguments)
            existing.arguments += tc.function.arguments
        }

        // Get the current buffer (existing or newly created)
        const buffer = toolCallBuffers.get(tc.index)!

        // Emit TOOL_CALL_START when we have id and name
        if (buffer.id && buffer.name && !buffer.started) {
          buffer.started = true
          yield {
            type: 'TOOL_CALL_START',
            toolCallId: buffer.id,
            toolName: buffer.name,
            model: meta.model,
            timestamp: meta.timestamp,
            index: tc.index,
          }
        }

        // Emit TOOL_CALL_ARGS for argument deltas
        if (tc.function?.arguments && buffer.started) {
          yield {
            type: 'TOOL_CALL_ARGS',
            toolCallId: buffer.id,
            model: meta.model,
            timestamp: meta.timestamp,
            delta: tc.function.arguments,
          }
        }
      }
    }

    if (delta.refusal) {
      // Emit AG-UI RUN_ERROR for refusal
      yield {
        type: 'RUN_ERROR',
        runId: aguiState.runId,
        model: meta.model,
        timestamp: meta.timestamp,
        error: { message: delta.refusal, code: 'refusal' },
      }
    }

    if (finishReason) {
      // Emit all completed tool calls when finish reason indicates tool usage
      if (finishReason === 'tool_calls' || toolCallBuffers.size > 0) {
        for (const [, tc] of toolCallBuffers.entries()) {
          // Parse arguments for TOOL_CALL_END
          let parsedInput: unknown = {}
          try {
            parsedInput = tc.arguments ? JSON.parse(tc.arguments) : {}
          } catch {
            parsedInput = {}
          }

          // Emit AG-UI TOOL_CALL_END
          yield {
            type: 'TOOL_CALL_END',
            toolCallId: tc.id,
            toolName: tc.name,
            model: meta.model,
            timestamp: meta.timestamp,
            input: parsedInput,
          }
        }

        toolCallBuffers.clear()
      }

      const computedFinishReason =
        finishReason === 'tool_calls'
          ? 'tool_calls'
          : finishReason === 'length'
            ? 'length'
            : 'stop'

      // Emit TEXT_MESSAGE_END if we had text content
      if (aguiState.hasEmittedTextMessageStart) {
        yield {
          type: 'TEXT_MESSAGE_END',
          messageId: aguiState.messageId,
          model: meta.model,
          timestamp: meta.timestamp,
        }
      }

      // Emit AG-UI RUN_FINISHED
      yield {
        type: 'RUN_FINISHED',
        runId: aguiState.runId,
        model: meta.model,
        timestamp: meta.timestamp,
        usage: usage
          ? {
              promptTokens: usage.promptTokens || 0,
              completionTokens: usage.completionTokens || 0,
              totalTokens: usage.totalTokens || 0,
            }
          : undefined,
        finishReason: computedFinishReason,
      }
    }
  }

  private mapTextOptionsToSDK(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): ChatRequest {
    const modelOptions = options.modelOptions

    const messages = this.convertMessages(options.messages)

    if (options.systemPrompts?.length) {
      messages.unshift({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    // Spread modelOptions first, then conditionally override with explicit
    // top-level options so undefined values don't clobber modelOptions. Fixes
    // #310, where the reverse order silently dropped user-set values.
    const request: ChatRequest = {
      ...modelOptions,
      model:
        options.model +
        (modelOptions?.variant ? `:${modelOptions.variant}` : ''),
      messages,
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
      ...(options.maxTokens !== undefined && {
        maxCompletionTokens: options.maxTokens,
      }),
      ...(options.topP !== undefined && { topP: options.topP }),
      tools: options.tools
        ? convertToolsToProviderFormat(options.tools)
        : undefined,
    }

    return request
  }

  private convertMessages(messages: Array<ModelMessage>): Array<ChatMessages> {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content:
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content),
          toolCallId: msg.toolCallId || '',
        }
      }

      if (msg.role === 'user') {
        const content = this.convertContentParts(msg.content)
        return {
          role: 'user' as const,
          content:
            content.length === 1 && content[0]?.type === 'text'
              ? (content[0] as { type: 'text'; text: string }).text
              : content,
        }
      }

      // assistant role
      return {
        role: 'assistant' as const,
        content:
          typeof msg.content === 'string'
            ? msg.content
            : msg.content
              ? JSON.stringify(msg.content)
              : undefined,
        toolCalls: msg.toolCalls,
      }
    })
  }

  private convertContentParts(
    content: string | null | Array<ContentPart>,
  ): Array<ChatContentItems> {
    if (!content) return [{ type: 'text', text: '' }]
    if (typeof content === 'string') return [{ type: 'text', text: content }]

    const parts: Array<ChatContentItems> = []
    for (const part of content) {
      switch (part.type) {
        case 'text':
          parts.push({ type: 'text', text: part.content })
          break
        case 'image': {
          const meta = part.metadata as OpenRouterImageMetadata | undefined
          // For base64 data, construct a data URI using the mimeType from source
          const imageValue = part.source.value
          const imageUrl =
            part.source.type === 'data' && !imageValue.startsWith('data:')
              ? `data:${part.source.mimeType};base64,${imageValue}`
              : imageValue
          parts.push({
            type: 'image_url',
            imageUrl: {
              url: imageUrl,
              detail: meta?.detail || 'auto',
            },
          })
          break
        }
        case 'audio':
          parts.push({
            type: 'input_audio',
            inputAudio: {
              data: part.source.value,
              format: 'mp3',
            },
          })
          break
        case 'video':
          parts.push({
            type: 'video_url',
            videoUrl: { url: part.source.value },
          })
          break
        case 'document':
          // SDK doesn't have document_url type, pass as custom
          parts.push({
            type: 'text',
            text: `[Document: ${part.source.value}]`,
          })
          break
      }
    }
    return parts.length ? parts : [{ type: 'text', text: '' }]
  }
}

export function createOpenRouterText<TModel extends OpenRouterTextModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterTextAdapter<TModel> {
  return new OpenRouterTextAdapter({ apiKey, ...config }, model)
}

export function openRouterText<TModel extends OpenRouterTextModels>(
  model: TModel,
  config?: Omit<SDKOptions, 'apiKey'>,
): OpenRouterTextAdapter<TModel> {
  const apiKey = getOpenRouterApiKeyFromEnv()
  return createOpenRouterText(model, apiKey, config)
}
