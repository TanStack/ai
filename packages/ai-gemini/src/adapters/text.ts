import { FinishReason } from '@google/genai'
import { EventType, normalizeSystemPrompts } from '@tanstack/ai'
import { toRunErrorRawEvent } from '@tanstack/ai/adapter-internals'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { convertToolsToProviderFormat } from '../tools/tool-converter'
import { buildGeminiUsage } from '../usage'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import { GEMINI_COMBINED_TOOLS_AND_SCHEMA_MODELS } from '../model-meta'
import type {
  GEMINI_MODELS,
  GeminiChatModelProviderOptionsByName,
  GeminiChatModelToolCapabilitiesByName,
  GeminiModelInputModalitiesByName,
} from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  Content,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
  Part,
  ThinkingLevel,
} from '@google/genai'
import type {
  ContentPart,
  Modality,
  ModelMessage,
  AdapterYieldChunk,
  TextOptions,
} from '@tanstack/ai'
import type { ExternalTextProviderOptions } from '../text/text-provider-options'
import type {
  GeminiMessageMetadataByModality,
  GeminiToolCallMetadata,
} from '../message-types'
import type { GeminiClientConfig } from '../utils/client'

export interface GeminiTextConfig extends GeminiClientConfig {}

export type GeminiTextProviderOptions = ExternalTextProviderOptions

type ResolveProviderOptions<TModel extends string> =
  TModel extends keyof GeminiChatModelProviderOptionsByName
    ? GeminiChatModelProviderOptionsByName[TModel]
    : GeminiTextProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof GeminiModelInputModalitiesByName
    ? GeminiModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio', 'video', 'document']

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof GeminiChatModelToolCapabilitiesByName
    ? NonNullable<GeminiChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export class GeminiTextAdapter<
  TModel extends (typeof GEMINI_MODELS)[number],
  TProviderOptions extends Record<string, any> = ResolveProviderOptions<TModel>,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  GeminiMessageMetadataByModality,
  TToolCapabilities,
  GeminiToolCallMetadata
> {
  override readonly kind = 'text' as const
  readonly name = 'gemini' as const

  private readonly client: GoogleGenAI

  constructor(config: GeminiTextConfig, model: TModel) {
    super({}, model)
    this.client = createGeminiClient(config)
  }

  async *chatStream(
    options: TextOptions<GeminiTextProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const mappedOptions = this.mapCommonOptionsToGemini(options)
    const { logger } = options

    try {
      logger.request(
        `activity=chat provider=gemini model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        { provider: 'gemini', model: this.model },
      )
      const result =
        await this.client.models.generateContentStream(mappedOptions)

      yield* this.processStreamChunks(result, options, logger)
    } catch (error) {
      const rawEvent = toRunErrorRawEvent(error)
      logger.errors('gemini.chatStream fatal', {
        error,
        source: 'gemini.chatStream',
      })
      yield {
        type: EventType.RUN_ERROR,
        model: options.model,
        timestamp: Date.now(),
        message:
          error instanceof Error
            ? error.message
            : 'An unknown error occurred during the chat stream.',
        // Forward the provider's structured error body when present (see
        // toRunErrorRawEvent); omitted otherwise.
        ...(rawEvent !== undefined && { rawEvent }),
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred during the chat stream.',
        },
      }
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<GeminiTextProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions

    const mappedOptions = this.mapCommonOptionsToGemini(chatOptions)

    try {
      logger.request(
        `activity=chat provider=gemini model=${this.model} messages=${chatOptions.messages.length} tools=${chatOptions.tools?.length ?? 0} stream=false`,
        { provider: 'gemini', model: this.model },
      )
      // Add structured output configuration
      const result = await this.client.models.generateContent({
        ...mappedOptions,
        config: {
          ...mappedOptions.config,
          responseMimeType: 'application/json',
          responseSchema: outputSchema,
        },
      })

      // Extract text content from the response
      const rawText = this.extractTextFromResponse(result)

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
        usage: result.usageMetadata
          ? buildGeminiUsage(result.usageMetadata)
          : undefined,
      }
    } catch (error) {
      logger.errors('gemini.structuredOutput fatal', {
        error,
        source: 'gemini.structuredOutput',
      })
      throw new Error(
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during structured output generation.',
      )
    }
  }

  private extractTextFromResponse(response: GenerateContentResponse): string {
    let textContent = ''

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          textContent += part.text
        }
      }
    }

    return textContent
  }

  private async *processStreamChunks(
    result: AsyncGenerator<GenerateContentResponse, unknown, unknown>,
    options: TextOptions<GeminiTextProviderOptions>,
    logger: InternalLogger,
  ): AsyncIterable<AdapterYieldChunk> {
    const model = options.model
    const adapterName = this.name
    let accumulatedContent = ''
    let accumulatedThinking = ''
    const toolCallMap = new Map<
      string,
      {
        name: string
        args: string
        index: number
        started: boolean
        thoughtSignature?: string
      }
    >()
    let nextToolIndex = 0

    const runId = options.runId ?? generateId(adapterName)
    const threadId = options.threadId ?? generateId(adapterName)
    const messageId = generateId(adapterName)
    let stepId: string | null = null
    let reasoningMessageId: string | null = null
    let hasClosedReasoning = false
    let hasEmittedRunStarted = false
    let hasEmittedTextMessageStart = false
    let hasEmittedStepStarted = false

    const now = () => Date.now()

    function* emitRunStartedIfNeeded(): Generator<AdapterYieldChunk> {
      if (hasEmittedRunStarted) return
      hasEmittedRunStarted = true
      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model,
        timestamp: now(),
        parentRunId: options.parentRunId,
      }
    }

    function* closeReasoningIfNeeded(): Generator<AdapterYieldChunk> {
      if (!reasoningMessageId) return
      if (hasClosedReasoning) return
      hasClosedReasoning = true
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: reasoningMessageId,
        model,
        timestamp: now(),
      }
      yield {
        type: EventType.REASONING_END,
        messageId: reasoningMessageId,
        model,
        timestamp: now(),
      }
    }

    function* processThoughtPart(part: Part): Generator<AdapterYieldChunk> {
      if (!part.text) return
      if (!hasEmittedStepStarted) {
        hasEmittedStepStarted = true
        stepId = generateId(adapterName)
        reasoningMessageId = generateId(adapterName)
        yield {
          type: EventType.REASONING_START,
          messageId: reasoningMessageId,
          model,
          timestamp: now(),
        }
        yield {
          type: EventType.REASONING_MESSAGE_START,
          messageId: reasoningMessageId,
          role: 'reasoning' as const,
          model,
          timestamp: now(),
        }
        yield {
          type: EventType.STEP_STARTED,
          stepName: stepId,
          stepId,
          model,
          timestamp: now(),
          stepType: 'thinking',
        }
      }

      accumulatedThinking += part.text
      if (!reasoningMessageId) return
      yield {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: reasoningMessageId,
        delta: part.text,
        model,
        timestamp: now(),
      }
      yield {
        type: EventType.STEP_FINISHED,
        stepName: stepId || generateId(adapterName),
        stepId: stepId || generateId(adapterName),
        model,
        timestamp: now(),
        delta: part.text,
        content: accumulatedThinking,
      }
    }

    function* processTextPart(text: string): Generator<AdapterYieldChunk> {
      yield* closeReasoningIfNeeded()
      if (!hasEmittedTextMessageStart) {
        hasEmittedTextMessageStart = true
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          model,
          timestamp: now(),
          role: 'assistant',
        }
      }
      accumulatedContent += text
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        model,
        timestamp: now(),
        delta: text,
        content: accumulatedContent,
      }
    }

    function stringifyFunctionArgs(functionArgs: unknown): string {
      return typeof functionArgs === 'string'
        ? functionArgs
        : JSON.stringify(functionArgs)
    }

    function mergeFunctionArgs(
      existing: string,
      functionArgs: unknown,
    ): string {
      try {
        const existingArgs = JSON.parse(existing)
        const newArgs =
          typeof functionArgs === 'string'
            ? JSON.parse(functionArgs)
            : functionArgs
        return JSON.stringify({ ...existingArgs, ...newArgs })
      } catch {
        return stringifyFunctionArgs(functionArgs)
      }
    }

    function* processFunctionCallPart(
      part: Part,
    ): Generator<AdapterYieldChunk> {
      const functionCall = part.functionCall
      if (!functionCall) return
      const toolCallId =
        functionCall.id || `${functionCall.name}_${Date.now()}_${nextToolIndex}`
      const functionArgs = functionCall.args || {}
      const partThoughtSignature = part.thoughtSignature || undefined

      let toolCallData = toolCallMap.get(toolCallId)
      if (!toolCallData) {
        toolCallData = {
          name: functionCall.name || '',
          args: stringifyFunctionArgs(functionArgs),
          index: nextToolIndex++,
          started: false,
          ...(partThoughtSignature !== undefined && {
            thoughtSignature: partThoughtSignature,
          }),
        }
        toolCallMap.set(toolCallId, toolCallData)
      } else {
        if (!toolCallData.thoughtSignature && partThoughtSignature) {
          toolCallData.thoughtSignature = partThoughtSignature
        }
        toolCallData.args = mergeFunctionArgs(toolCallData.args, functionArgs)
      }

      if (!toolCallData.started) {
        toolCallData.started = true
        yield {
          type: EventType.TOOL_CALL_START,
          toolCallId,
          toolCallName: toolCallData.name,
          toolName: toolCallData.name,
          parentMessageId: messageId,
          model,
          timestamp: now(),
          index: toolCallData.index,
          ...(toolCallData.thoughtSignature && {
            metadata: {
              thoughtSignature: toolCallData.thoughtSignature,
            } satisfies GeminiToolCallMetadata,
          }),
        }
      }

      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        model,
        timestamp: now(),
        delta: toolCallData.args,
        args: toolCallData.args,
      }
    }

    function* processCandidateParts(
      parts: Array<Part>,
    ): Generator<AdapterYieldChunk> {
      for (const part of parts) {
        if (part.text) {
          if (part.thought) {
            yield* processThoughtPart(part)
          } else if (part.text.trim()) {
            yield* processTextPart(part.text)
          }
        }
        if (part.functionCall) {
          yield* processFunctionCallPart(part)
        }
      }
    }

    function* processDataFallback(data: string): Generator<AdapterYieldChunk> {
      yield* processTextPart(data)
    }

    function* processFinish(
      chunk: GenerateContentResponse,
    ): Generator<AdapterYieldChunk> {
      const finishReason = chunk.candidates?.[0]?.finishReason
      if (!finishReason) return

      const toolCalls = toolCallMap.entries()
      for (const [toolCallId, toolCallData] of toolCalls) {
        let parsedInput: unknown = {}
        try {
          const parsed = JSON.parse(toolCallData.args)
          parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
        } catch {
          parsedInput = {}
        }

        yield {
          type: EventType.TOOL_CALL_END,
          toolCallId,
          toolCallName: toolCallData.name,
          toolName: toolCallData.name,
          model,
          timestamp: now(),
          input: parsedInput,
        }
      }

      if (toolCallMap.size > 0) {
        hasEmittedTextMessageStart = false
      }

      if (finishReason === FinishReason.MAX_TOKENS) {
        yield {
          type: EventType.RUN_ERROR,
          runId,
          model,
          timestamp: now(),
          message:
            'The response was cut off because the maximum token limit was reached.',
          code: 'max_tokens',
          error: {
            message:
              'The response was cut off because the maximum token limit was reached.',
            code: 'max_tokens',
          },
        }
      }

      yield* closeReasoningIfNeeded()

      if (hasEmittedTextMessageStart) {
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId,
          model,
          timestamp: now(),
        }
      }

      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model,
        timestamp: now(),
        finishReason: toolCallMap.size > 0 ? 'tool_calls' : 'stop',
        ...(chunk.usageMetadata && {
          usage: buildGeminiUsage(chunk.usageMetadata),
        }),
      }
    }

    function* processChunkContent(
      chunk: GenerateContentResponse,
    ): Generator<AdapterYieldChunk> {
      const parts = chunk.candidates?.[0]?.content?.parts
      if (parts) {
        yield* processCandidateParts(parts)
        return
      }
      if (chunk.data && chunk.data.trim()) {
        yield* processDataFallback(chunk.data)
      }
    }

    for await (const chunk of result) {
      logger.provider(`provider=gemini`, { chunk })
      yield* emitRunStartedIfNeeded()
      yield* processChunkContent(chunk)
      yield* processFinish(chunk)
    }
  }

  private convertContentPartToGemini(part: ContentPart): Part {
    switch (part.type) {
      case 'text':
        return { text: part.content }
      case 'image':
      case 'audio':
      case 'video':
      case 'document': {
        if (part.source.type === 'data') {
          return {
            inlineData: {
              data: part.source.value,
              mimeType: part.source.mimeType,
            },
          }
        } else {
          // For URL sources, use provided mimeType or fall back to reasonable defaults
          const defaultMimeType = {
            image: 'image/jpeg',
            audio: 'audio/mp3',
            video: 'video/mp4',
            document: 'application/pdf',
          }[part.type]

          return {
            fileData: {
              fileUri: part.source.value,
              mimeType: part.source.mimeType ?? defaultMimeType,
            },
          }
        }
      }
      default: {
        const _exhaustiveCheck: never = part
        throw new Error(
          `Unsupported content part type: ${(_exhaustiveCheck as ContentPart).type}`,
        )
      }
    }
  }

  private appendAssistantToolCallParts(
    toolCalls: NonNullable<ModelMessage['toolCalls']>,
    parts: Array<Part>,
  ): void {
    for (const toolCall of toolCalls) {
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = toolCall.function.arguments
          ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
          : {}
      } catch {
        parsedArgs = {}
      }

      const thoughtSignature = (
        toolCall.metadata as GeminiToolCallMetadata | undefined
      )?.thoughtSignature
      const part: Part = {
        functionCall: {
          id: toolCall.id,
          name: toolCall.function.name,
          args: parsedArgs,
        },
      }
      if (thoughtSignature) {
        part.thoughtSignature = thoughtSignature
      }
      parts.push(part)
    }
  }

  private appendToolResultParts(
    msg: ModelMessage,
    parts: Array<Part>,
    toolCallIdToName: Map<string, string>,
  ): void {
    if (!msg.toolCallId) return
    const functionName = toolCallIdToName.get(msg.toolCallId) || msg.toolCallId
    const toolContent = msg.content
    if (Array.isArray(toolContent)) {
      const textChunks: Array<string> = []
      const mediaParts: Array<Part> = []
      for (const part of toolContent) {
        if (part.type === 'text') {
          textChunks.push(part.content)
        } else if (part.source.type === 'data') {
          mediaParts.push({
            inlineData: {
              data: part.source.value,
              mimeType: part.source.mimeType,
            },
          })
        } else {
          const defaultMimeType = {
            image: 'image/jpeg',
            audio: 'audio/mp3',
            video: 'video/mp4',
            document: 'application/pdf',
          }[part.type]
          mediaParts.push({
            fileData: {
              fileUri: part.source.value,
              mimeType: part.source.mimeType ?? defaultMimeType,
            },
          })
        }
      }
      parts.push({
        functionResponse: {
          id: msg.toolCallId,
          name: functionName,
          response: { content: textChunks.join('\n') },
          ...(mediaParts.length > 0 && { parts: mediaParts }),
        },
      })
      return
    }
    parts.push({
      functionResponse: {
        id: msg.toolCallId,
        name: functionName,
        response: { content: toolContent || '' },
      },
    })
  }

  private formatOneMessage(
    msg: ModelMessage,
    toolCallIdToName: Map<string, string>,
  ): Content {
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user'
    const parts: Array<Part> = []

    if (Array.isArray(msg.content)) {
      for (const contentPart of msg.content) {
        parts.push(this.convertContentPartToGemini(contentPart))
      }
    } else if (msg.content && msg.role !== 'tool') {
      parts.push({ text: msg.content })
    }

    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      this.appendAssistantToolCallParts(msg.toolCalls, parts)
    }

    if (msg.role === 'tool' && msg.toolCallId) {
      this.appendToolResultParts(msg, parts, toolCallIdToName)
    }

    return {
      role,
      parts: parts.length > 0 ? parts : [{ text: '' }],
    }
  }

  private formatMessages(
    messages: Array<ModelMessage>,
  ): GenerateContentParameters['contents'] {
    const toolCallIdToName = new Map<string, string>()
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          toolCallIdToName.set(tc.id, tc.function.name)
        }
      }
    }

    const formatted = messages.map((msg) =>
      this.formatOneMessage(msg, toolCallIdToName),
    )

    return this.mergeConsecutiveSameRoleMessages(formatted)
  }

  private mergeConsecutiveSameRoleMessages(
    messages: Array<Content>,
  ): Array<Content> {
    const merged: Array<Content> = []

    for (const msg of messages) {
      const parts = msg.parts || []

      // Skip empty model messages (no parts or only empty text)
      if (msg.role === 'model') {
        const hasContent =
          parts.length > 0 &&
          !parts.every(
            (p) => 'text' in p && (p as { text: string }).text === '',
          )
        if (!hasContent) {
          continue
        }
      }

      const prev = merged[merged.length - 1]
      if (prev && prev.role === msg.role) {
        // Merge parts arrays
        prev.parts = [...(prev.parts || []), ...parts]
      } else {
        merged.push({ ...msg, parts: [...parts] })
      }
    }

    // Deduplicate functionResponse parts with the same name (tool call ID)
    for (const msg of merged) {
      if (!msg.parts) continue
      const seenFunctionResponseNames = new Set<string>()
      msg.parts = msg.parts.filter((part) => {
        if ('functionResponse' in part && part.functionResponse?.name) {
          if (seenFunctionResponseNames.has(part.functionResponse.name)) {
            return false
          }
          seenFunctionResponseNames.add(part.functionResponse.name)
        }
        return true
      })
    }

    return merged
  }

  private mapCommonOptionsToGemini(
    options: TextOptions<GeminiTextProviderOptions>,
  ) {
    const { thinkingConfig, ...modelOpts } = options.modelOptions ?? {}
    const mappedThinkingConfig = thinkingConfig
      ? {
          ...(thinkingConfig.includeThoughts !== undefined && {
            includeThoughts: thinkingConfig.includeThoughts,
          }),
          ...(thinkingConfig.thinkingBudget !== undefined && {
            thinkingBudget: thinkingConfig.thinkingBudget,
          }),
          ...(thinkingConfig.thinkingLevel
            ? {
                thinkingLevel: thinkingConfig.thinkingLevel as ThinkingLevel,
              }
            : {}),
        }
      : undefined

    const normalizedPrompts = normalizeSystemPrompts(options.systemPrompts)
    const systemInstruction =
      normalizedPrompts.length > 0
        ? normalizedPrompts.map((p) => p.content).join('\n')
        : undefined

    const combinedSchema = options.outputSchema as
      | Record<string, unknown>
      | undefined
    const combinedSchemaConfig = combinedSchema
      ? {
          responseMimeType: 'application/json' as const,
          responseSchema: combinedSchema,
        }
      : undefined

    const requestOptions: GenerateContentParameters = {
      model: options.model,
      contents: this.formatMessages(options.messages),
      config: {
        ...modelOpts,
        ...(mappedThinkingConfig !== undefined && {
          thinkingConfig: mappedThinkingConfig,
        }),
        ...(systemInstruction !== undefined && { systemInstruction }),
        tools: convertToolsToProviderFormat(options.tools),
        ...(combinedSchemaConfig ?? {}),
      },
    }

    return requestOptions
  }

  supportsCombinedToolsAndSchema(): boolean {
    return GEMINI_COMBINED_TOOLS_AND_SCHEMA_MODELS.has(this.model)
  }
}

export function createGeminiChat<TModel extends (typeof GEMINI_MODELS)[number]>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiTextConfig, 'apiKey'>,
): GeminiTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  ResolveToolCapabilities<TModel>
> {
  return new GeminiTextAdapter({ apiKey, ...config }, model)
}

export function geminiText<TModel extends (typeof GEMINI_MODELS)[number]>(
  model: TModel,
  config?: Omit<GeminiTextConfig, 'apiKey'>,
): GeminiTextAdapter<
  TModel,
  ResolveProviderOptions<TModel>,
  ResolveInputModalities<TModel>,
  ResolveToolCapabilities<TModel>
> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiChat(model, apiKey, config)
}
