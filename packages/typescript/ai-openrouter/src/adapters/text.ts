import { OpenRouter } from '@openrouter/sdk'
import { RequestAbortedError } from '@openrouter/sdk/models/errors'
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
import type {
  ExternalTextProviderOptions,
  InternalTextProviderOptions,
} from '../text/text-provider-options'
import type {
  OpenRouterImageMetadata,
  OpenRouterMessageMetadataByModality,
} from '../message-types'
import type {
  ChatCompletionFinishReason,
  ChatGenerationParams,
  ChatGenerationTokenUsage,
  ChatMessageContentItem,
  ChatStreamingChoice,
  Message,
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
    let lastFinishReason: ChatCompletionFinishReason | undefined

    // AG-UI lifecycle tracking
    const aguiState: AGUIState = {
      runId: this.generateId(),
      messageId: this.generateId(),
      stepId: null,
      hasEmittedRunStarted: false,
      hasEmittedTextMessageStart: false,
      hasEmittedStepStarted: false,
    }

    let chunkCountOuter = 0
    try {
      const requestParams = this.mapTextOptionsToSDK(options)
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openrouter/text.ts:chatStream',message:'chatStream entry - request params',data:{model:requestParams.model,messageCount:requestParams.messages?.length,hasTools:!!requestParams.tools,toolCount:requestParams.tools?.length,keys:Object.keys(requestParams)},timestamp:Date.now(),hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      let stream: AsyncIterable<any>
      try {
        stream = await this.client.chat.send(
          { ...requestParams, stream: true },
          { signal: options.request?.signal },
        )
      } catch (sendError: any) {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openrouter/text.ts:chatStream',message:'chat.send threw error',data:{errorMessage:sendError?.message,errorName:sendError?.name,errorCode:sendError?.code,errorStatus:sendError?.status},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        throw sendError
      }

      let chunkCount = 0
      for await (const chunk of stream) {
        chunkCount++
        chunkCountOuter = chunkCount
        // #region agent log
        if (chunkCount <= 3) { fetch('http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openrouter/text.ts:chatStream',message:'stream chunk received',data:{chunkCount,chunkKeys:Object.keys(chunk||{}),hasData:!!chunk?.data,hasId:!!chunk?.id,hasChoices:!!chunk?.choices,choicesLen:chunk?.choices?.length,hasModel:!!chunk?.model,hasError:!!chunk?.error,hasUsage:!!chunk?.usage,dataKeys:chunk?.data?Object.keys(chunk.data):undefined,rawType:typeof chunk},timestamp:Date.now(),hypothesisId:'A'})}).catch(()=>{}); }
        // #endregion
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

        // #region agent log
        if (chunkCount <= 3 && chunk.choices) { fetch('http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openrouter/text.ts:chatStream',message:'choices detail',data:{chunkCount,choicesLen:chunk.choices?.length,firstChoiceDelta:chunk.choices?.[0]?.delta?{content:!!chunk.choices[0].delta.content,contentLen:chunk.choices[0].delta.content?.length,toolCalls:!!chunk.choices[0].delta.toolCalls,role:chunk.choices[0].delta.role}:null,finishReason:chunk.choices?.[0]?.finishReason,hasUsage:!!chunk.usage},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{}); }
        // #endregion
        for (const choice of chunk.choices) {
          if (chunk.choices[0]?.finishReason) {
            lastFinishReason = chunk.choices[0].finishReason
          }
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
            lastFinishReason,
            chunk.usage,
            aguiState,
          )
        }
      }
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openrouter/text.ts:chatStream',message:'stream loop completed',data:{totalChunks:chunkCount,hasEmittedRunStarted:aguiState.hasEmittedRunStarted,hasEmittedTextMessageStart:aguiState.hasEmittedTextMessageStart,accumulatedContentLen:accumulatedContent.length,lastFinishReason},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
      // #endregion
    } catch (error: any) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/830522ab-8098-40b9-a021-890f9c041588',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'openrouter/text.ts:chatStream',message:'caught error in chatStream',data:{errorMessage:error?.message,errorName:error?.name,errorStack:error?.stack?.slice(0,300),totalChunks:chunkCountOuter},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{});
      // #endregion
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

    const structuredOutputTool = {
      type: 'function' as const,
      function: {
        name: 'structured_output',
        description:
          'Use this tool to provide your response in the required structured format.',
        parameters: outputSchema,
      },
    }

    try {
      const result = await this.client.chat.send(
        {
          ...requestParams,
          stream: false,
          tools: [structuredOutputTool],
          toolChoice: {
            type: 'function',
            function: { name: 'structured_output' },
          },
        },
        { signal: chatOptions.request?.signal },
      )

      const message = result.choices[0]?.message
      const toolCall = message?.toolCalls?.[0]

      if (toolCall && toolCall.function.name === 'structured_output') {
        const parsed = JSON.parse(toolCall.function.arguments || '{}')
        return {
          data: parsed,
          rawText: toolCall.function.arguments || '',
        }
      }

      const content = (message?.content as any) || ''
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`,
        )
      }

      return {
        data: parsed,
        rawText: content,
      }
    } catch (error: unknown) {
      if (error instanceof RequestAbortedError) {
        throw new Error('Structured output generation aborted')
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
    choice: ChatStreamingChoice,
    toolCallBuffers: Map<number, ToolCallBuffer>,
    meta: { id: string; model: string; timestamp: number },
    accumulated: { reasoning: string; content: string },
    updateAccumulated: (reasoning: string, content: string) => void,
    lastFinishReason: ChatCompletionFinishReason | undefined,
    usage: ChatGenerationTokenUsage | undefined,
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
      if (finishReason === 'tool_calls') {
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
    }
    if (usage) {
      const computedFinishReason =
        lastFinishReason === 'tool_calls'
          ? 'tool_calls'
          : lastFinishReason === 'length'
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
        usage: {
          promptTokens: usage.promptTokens || 0,
          completionTokens: usage.completionTokens || 0,
          totalTokens: usage.totalTokens || 0,
        },
        finishReason: computedFinishReason,
      }
    }
  }

  private mapTextOptionsToSDK(
    options: TextOptions<ResolveProviderOptions<TModel>>,
  ): ChatGenerationParams {
    const modelOptions = options.modelOptions as
      | Omit<InternalTextProviderOptions, 'model' | 'messages' | 'tools'>
      | undefined

    const messages = this.convertMessages(options.messages)

    if (options.systemPrompts?.length) {
      messages.unshift({
        role: 'system',
        content: options.systemPrompts.join('\n'),
      })
    }

    const request: ChatGenerationParams = {
      model:
        options.model +
        (modelOptions?.variant ? `:${modelOptions.variant}` : ''),
      messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      topP: options.topP,
      ...modelOptions,
      tools: options.tools
        ? convertToolsToProviderFormat(options.tools)
        : undefined,
    }

    return request
  }

  private convertMessages(messages: Array<ModelMessage>): Array<Message> {
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
  ): Array<ChatMessageContentItem> {
    if (!content) return [{ type: 'text', text: '' }]
    if (typeof content === 'string') return [{ type: 'text', text: content }]

    const parts: Array<ChatMessageContentItem> = []
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
