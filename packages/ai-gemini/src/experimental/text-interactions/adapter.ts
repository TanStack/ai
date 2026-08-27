import { EventType } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../../utils/client'
import { translateInteractionEvents } from './translate-events'
import {
  getGeminiProviderToolKind,
  getGeminiProviderToolMetadata,
} from '../../tools/gemini-provider-tool'
import { assertUniqueToolNames } from '@tanstack/ai/adapter-internals'
import type {
  GeminiChatModelToolCapabilitiesByName,
  GeminiModelInputModalitiesByName,
  GeminiModels,
} from '../../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { GoogleGenAI, Interactions } from '@google/genai'
import type {
  ContentPart,
  Modality,
  ModelMessage,
  AdapterYieldChunk,
  TextOptions,
  Tool,
} from '@tanstack/ai'

import type {
  GeminiInteractionsCustomEvent,
  GeminiInteractionsCustomEventValue,
  GeminiInteractionsStream,
} from './events'
import type { ExternalTextInteractionsProviderOptions } from './provider-options'
import type { GeminiMessageMetadataByModality } from '../../message-types'
import type { GeminiClientConfig } from '../../utils/client'

type Interaction = Interactions.Interaction
type InteractionSSEEvent = Interactions.InteractionSSEEvent

export type GeminiTextInteractionsConfig = GeminiClientConfig

export type GeminiTextInteractionsProviderOptions =
  ExternalTextInteractionsProviderOptions

type InteractionsTool = NonNullable<
  Interactions.CreateModelInteractionParamsStreaming['tools']
>[number]

type ContentBlock = Interactions.Content

type UserInputStep = {
  type: 'user_input'
  content: Array<ContentBlock>
}
type FunctionResultStep = {
  type: 'function_result'
  call_id: string
  name?: string
  result: string
}
type InteractionsStep = UserInputStep | FunctionResultStep
type InteractionsRequestInput = Array<InteractionsStep>

type GeminiInteractionsRequestBody = Omit<
  Interactions.CreateModelInteractionParamsStreaming,
  'input' | 'stream'
> & {
  input: InteractionsRequestInput
  stream?: boolean
}

type ResolveProviderOptions = GeminiTextInteractionsProviderOptions

type ResolveInputModalities<TModel extends string> =
  TModel extends keyof GeminiModelInputModalitiesByName
    ? GeminiModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio', 'video', 'document']

type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof GeminiChatModelToolCapabilitiesByName
    ? NonNullable<GeminiChatModelToolCapabilitiesByName[TModel]>
    : readonly []

export class GeminiTextInteractionsAdapter<
  TModel extends GeminiModels,
  TProviderOptions extends Record<string, any> = ResolveProviderOptions,
  TInputModalities extends ReadonlyArray<Modality> =
    ResolveInputModalities<TModel>,
  TToolCapabilities extends ReadonlyArray<string> =
    ResolveToolCapabilities<TModel>,
> extends BaseTextAdapter<
  TModel,
  TProviderOptions,
  TInputModalities,
  GeminiMessageMetadataByModality,
  TToolCapabilities
> {
  override readonly kind = 'text' as const
  override readonly name = 'gemini-text-interactions' as const

  private readonly client: GoogleGenAI
  private readonly interactionIdByThread = new Map<string, string>()

  constructor(config: GeminiTextInteractionsConfig, model: TModel) {
    super({}, model)
    this.client = createGeminiClient(config)
  }

  async *chatStream(
    options: TextOptions<GeminiTextInteractionsProviderOptions>,
  ): AsyncIterable<AdapterYieldChunk> {
    const runId = options.runId ?? generateId(this.name)
    const threadId = options.threadId ?? generateId(this.name)
    const timestamp = Date.now()
    const { logger } = options
    const interactionIdByThread = this.interactionIdByThread

    const isFreshTurn =
      !options.modelOptions?.previous_interaction_id &&
      options.messages.length === 1 &&
      options.messages[0]?.role === 'user'
    if (isFreshTurn) {
      interactionIdByThread.delete(threadId)
    }

    const effectivePreviousInteractionId =
      options.modelOptions?.previous_interaction_id ??
      interactionIdByThread.get(threadId)

    let sawTerminalEvent = false
    let completedTryBlock = false

    const captureInteractionId = (chunk: AdapterYieldChunk) => {
      const isNotInteractionIdEvent =
        chunk.type !== EventType.CUSTOM || chunk.name !== 'gemini.interactionId'
      if (isNotInteractionIdEvent) {
        return
      }
      const value =
        chunk.value as GeminiInteractionsCustomEventValue<'gemini.interactionId'>
      interactionIdByThread.set(threadId, value.interactionId)
    }

    const recordTerminal = (chunk: AdapterYieldChunk) => {
      if (chunk.type === EventType.RUN_FINISHED) {
        sawTerminalEvent = true
        return
      }
      if (chunk.type === EventType.RUN_ERROR) {
        sawTerminalEvent = true
        interactionIdByThread.delete(threadId)
      }
    }

    const truncationError = function* (): Generator<AdapterYieldChunk> {
      interactionIdByThread.delete(threadId)
      const message =
        'Gemini Interactions stream ended without a terminal event (no interaction.complete or error)'
      logger.errors('gemini-text-interactions.chatStream truncated', {
        source: 'gemini-text-interactions.chatStream',
        runId,
        threadId,
      })
      yield {
        type: EventType.RUN_ERROR,
        runId,
        model: options.model,
        timestamp,
        message,
        error: { message },
      }
    }

    const fatalError = function* (
      error: unknown,
    ): Generator<AdapterYieldChunk> {
      interactionIdByThread.delete(threadId)
      const message =
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during the interactions stream.'
      logger.errors('gemini-text-interactions.chatStream fatal', {
        error,
        source: 'gemini-text-interactions.chatStream',
      })
      yield {
        type: EventType.RUN_ERROR,
        runId,
        model: options.model,
        timestamp,
        message,
        error: { message },
      }
    }

    try {
      const request = buildInteractionsRequest({
        ...options,
        modelOptions: {
          ...options.modelOptions,
          previous_interaction_id: effectivePreviousInteractionId,
        },
      })
      logger.request(
        `activity=chat provider=gemini-text-interactions model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        {
          provider: 'gemini-text-interactions',
          model: this.model,
          request,
        },
      )
      const stream = (await this.client.interactions.create(
        { ...request, stream: true } as GeminiInteractionsRequestBody &
          Parameters<typeof this.client.interactions.create>[0],
        { signal: options.abortController?.signal },
      )) as AsyncIterable<InteractionSSEEvent>

      const translatedEvents = translateInteractionEvents(
        stream,
        options.model,
        runId,
        threadId,
        options.parentRunId,
        timestamp,
        this.name,
        logger,
      )
      for await (const chunk of translatedEvents) {
        captureInteractionId(chunk)
        recordTerminal(chunk)
        yield chunk
      }

      if (!sawTerminalEvent) {
        yield* truncationError()
      }
      completedTryBlock = true
    } catch (error) {
      yield* fatalError(error)
    } finally {
      if (!completedTryBlock) {
        interactionIdByThread.delete(threadId)
      }
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<GeminiTextInteractionsProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions
    const threadId = chatOptions.threadId

    const effectivePreviousInteractionId =
      chatOptions.modelOptions?.previous_interaction_id ??
      (threadId ? this.interactionIdByThread.get(threadId) : undefined)

    const baseRequest = buildInteractionsRequest({
      ...chatOptions,
      modelOptions: {
        ...chatOptions.modelOptions,
        previous_interaction_id: effectivePreviousInteractionId,
      },
    })

    const request: GeminiInteractionsRequestBody = {
      ...baseRequest,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: outputSchema,
      },
    }

    try {
      logger.request(
        `activity=chat provider=gemini-text-interactions model=${this.model} messages=${chatOptions.messages.length} tools=${chatOptions.tools?.length ?? 0} stream=false`,
        {
          provider: 'gemini-text-interactions',
          model: this.model,
          request,
        },
      )
      const result = (await this.client.interactions.create(
        request as Parameters<typeof this.client.interactions.create>[0],
        { signal: chatOptions.abortController?.signal },
      )) as Interaction

      const rawText = extractTextFromInteraction(result)

      if (!rawText) {
        throw new Error(
          `Gemini Interactions returned no text output for structured-output request (status: ${result.status}). The model may have produced only tool calls or non-text content.`,
        )
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `Failed to parse structured output as JSON. Content: ${rawText.slice(0, 200)}${rawText.length > 200 ? '...' : ''}`,
        )
      }

      return { data: parsed, rawText }
    } catch (error) {
      logger.errors('gemini-text-interactions.structuredOutput fatal', {
        error,
        source: 'gemini-text-interactions.structuredOutput',
      })
      // Preserve the original error as `cause` so the stack trace and any
      // SDK-attached status/code/headers survive for Sentry dedup.
      throw new Error(
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during structured output generation.',
        { cause: error },
      )
    }
  }
}

/** @experimental Interactions API is in Beta. */
export function createGeminiTextInteractions<TModel extends GeminiModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiTextInteractionsConfig, 'apiKey'>,
): GeminiTextInteractionsAdapter<
  TModel,
  ResolveProviderOptions,
  ResolveInputModalities<TModel>,
  ResolveToolCapabilities<TModel>
> {
  return new GeminiTextInteractionsAdapter({ apiKey, ...config }, model)
}

/** @experimental Interactions API is in Beta. */
export function geminiTextInteractions<TModel extends GeminiModels>(
  model: TModel,
  config?: Omit<GeminiTextInteractionsConfig, 'apiKey'>,
): GeminiTextInteractionsAdapter<
  TModel,
  ResolveProviderOptions,
  ResolveInputModalities<TModel>,
  ResolveToolCapabilities<TModel>
> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiTextInteractions(model, apiKey, config)
}

function buildInteractionsRequest(
  options: TextOptions<GeminiTextInteractionsProviderOptions>,
): GeminiInteractionsRequestBody {
  const modelOpts = options.modelOptions

  const systemInstruction =
    modelOpts?.system_instruction ?? options.systemPrompts?.join('\n')

  const generationConfig: Interactions.GenerationConfig = {
    ...modelOpts?.generation_config,
  }

  const hasGenerationConfig = Object.keys(generationConfig).length > 0

  const input = convertMessagesToInteractionsInput(
    options.messages,
    modelOpts?.previous_interaction_id !== undefined,
  )

  return {
    model: options.model,
    input,
    previous_interaction_id: modelOpts?.previous_interaction_id,
    system_instruction: systemInstruction,
    tools: convertToolsToInteractionsFormat(options.tools),
    generation_config: hasGenerationConfig ? generationConfig : undefined,
    store: modelOpts?.store,
    background: modelOpts?.background,
    response_modalities: modelOpts?.response_modalities,
    response_format: modelOpts?.response_format,
  }
}

function convertMessagesToInteractionsInput(
  messages: Array<ModelMessage>,
  hasPreviousInteraction: boolean,
): InteractionsRequestInput {
  const toolCallIdToName = new Map<string, string>()
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        toolCallIdToName.set(tc.id, tc.function.name)
      }
    }
  }

  const source = hasPreviousInteraction
    ? messagesAfterLastAssistant(messages)
    : messages

  const isMissingFollowUpMessages =
    hasPreviousInteraction && source.length === 0
  if (isMissingFollowUpMessages) {
    throw new Error(
      'Gemini Interactions adapter: modelOptions.previous_interaction_id was provided but no new messages were found after the last assistant turn. Append at least one user or tool message before chaining.',
    )
  }

  if (!hasPreviousInteraction) {
    const [only, ...rest] = source
    if (!only) {
      throw new Error('Gemini Interactions adapter: no messages to send.')
    }
    if (rest.length > 0) {
      throw new Error(
        'Gemini Interactions adapter: cannot send prior conversation history on a fresh interaction. Either set modelOptions.previous_interaction_id to chain prior turns server-side, or trim the message list to a single new user turn. See docs/adapters/gemini.md ("Wiring with useChat") for the canonical client/server pattern.',
      )
    }
    if (only.role !== 'user') {
      throw new Error(
        `Gemini Interactions adapter: the first message of a fresh interaction must be a user turn (got role="${only.role}"). Set modelOptions.previous_interaction_id to continue an existing interaction.`,
      )
    }
    const content = messageToContentBlocks(only)
    if (content.length === 0) {
      throw new Error(
        'Gemini Interactions adapter: the user message produced no content blocks to send.',
      )
    }
    return [{ type: 'user_input', content }]
  }

  const steps: Array<InteractionsStep> = []
  for (const msg of source) {
    if (msg.role === 'tool' && msg.toolCallId) {
      const result = serializeToolResultContent(msg.content)
      steps.push({
        type: 'function_result',
        call_id: msg.toolCallId,
        name: toolCallIdToName.get(msg.toolCallId),
        result,
      })
    } else if (msg.role === 'user') {
      const content = messageToContentBlocks(msg)
      if (content.length > 0) {
        steps.push({ type: 'user_input', content })
      }
    }
  }
  if (steps.length === 0) {
    throw new Error(
      'Gemini Interactions adapter: messages after the last assistant turn produced no steps to send.',
    )
  }
  return steps
}

function serializeToolResultContent(
  content: ModelMessage['content'] | undefined,
): string {
  if (typeof content === 'string') return content
  const isMissingContent = content === null || content === undefined
  if (isMissingContent) {
    throw new Error(
      'Gemini Interactions adapter: tool message has no content. The Interactions API requires a string `result` on function_result steps — return a string from your tool implementation (encode JSON/multimodal output yourself).',
    )
  }
  throw new Error(
    'Gemini Interactions adapter: tool message content must be a string (got an array of content parts). The Interactions API requires a string `result` on function_result steps — stringify multimodal tool output before returning it from your tool.',
  )
}

function messageToContentBlocks(msg: ModelMessage): Array<ContentBlock> {
  const blocks: Array<ContentBlock> = []

  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      blocks.push(contentPartToBlock(part))
    }
  } else if (
    typeof msg.content === 'string' &&
    msg.content &&
    msg.role !== 'tool'
  ) {
    blocks.push({ type: 'text', text: msg.content })
  }

  return blocks
}

function messagesAfterLastAssistant(
  messages: Array<ModelMessage>,
): Array<ModelMessage> {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      return messages.slice(i + 1)
    }
  }
  return messages
}

const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
] as const satisfies ReadonlyArray<
  NonNullable<Interactions.ImageContent['mime_type']>
>

const AUDIO_MIME_TYPES = [
  'audio/wav',
  'audio/mp3',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
] as const satisfies ReadonlyArray<
  NonNullable<Interactions.AudioContent['mime_type']>
>

const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/mpg',
  'video/mov',
  'video/avi',
  'video/x-flv',
  'video/webm',
  'video/wmv',
  'video/3gpp',
] as const satisfies ReadonlyArray<
  NonNullable<Interactions.VideoContent['mime_type']>
>

const DOCUMENT_MIME_TYPES = [
  'application/pdf',
] as const satisfies ReadonlyArray<
  NonNullable<Interactions.DocumentContent['mime_type']>
>

function validateMime<T extends string>(
  allowed: ReadonlyArray<T>,
  value: string | undefined,
  kind: string,
): T | undefined {
  if (value === undefined) return undefined
  if ((allowed as ReadonlyArray<string>).includes(value)) {
    return value as T
  }
  throw new Error(
    `Unsupported ${kind} mime type "${value}" for the Gemini Interactions API. Allowed: ${allowed.join(', ')}.`,
  )
}

function contentPartToBlock(part: ContentPart): ContentBlock {
  if (part.type === 'text') {
    return { type: 'text', text: part.content }
  }
  const isData = part.source.type === 'data'
  switch (part.type) {
    case 'image': {
      const mime_type = validateMime(
        IMAGE_MIME_TYPES,
        part.source.mimeType,
        'image',
      )
      return isData
        ? { type: 'image', data: part.source.value, mime_type }
        : { type: 'image', uri: part.source.value, mime_type }
    }
    case 'audio': {
      const mime_type = validateMime(
        AUDIO_MIME_TYPES,
        part.source.mimeType,
        'audio',
      )
      return isData
        ? { type: 'audio', data: part.source.value, mime_type }
        : { type: 'audio', uri: part.source.value, mime_type }
    }
    case 'video': {
      const mime_type = validateMime(
        VIDEO_MIME_TYPES,
        part.source.mimeType,
        'video',
      )
      return isData
        ? { type: 'video', data: part.source.value, mime_type }
        : { type: 'video', uri: part.source.value, mime_type }
    }
    case 'document': {
      const mime_type = validateMime(
        DOCUMENT_MIME_TYPES,
        part.source.mimeType,
        'document',
      )
      return isData
        ? { type: 'document', data: part.source.value, mime_type }
        : { type: 'document', uri: part.source.value, mime_type }
    }
  }
}

function convertGoogleSearchTool(tool: Tool): InteractionsTool {
  const metadata = (getGeminiProviderToolMetadata(tool) ?? {}) as {
    searchTypes?: {
      webSearch?: unknown
      imageSearch?: unknown
    }
  }
  const searchTypes: Array<'web_search' | 'image_search'> = []
  if (metadata.searchTypes?.webSearch !== undefined) {
    searchTypes.push('web_search')
  }
  if (metadata.searchTypes?.imageSearch !== undefined) {
    searchTypes.push('image_search')
  }
  return {
    type: 'google_search',
    ...(searchTypes.length > 0 ? { search_types: searchTypes } : {}),
  }
}

function convertFileSearchTool(tool: Tool): InteractionsTool {
  const metadata = (getGeminiProviderToolMetadata(tool) ?? {}) as {
    fileSearchStoreNames?: Array<string>
    topK?: number
    metadataFilter?: string
  }
  return {
    type: 'file_search',
    ...(metadata.fileSearchStoreNames
      ? { file_search_store_names: metadata.fileSearchStoreNames }
      : {}),
    ...(metadata.topK !== undefined ? { top_k: metadata.topK } : {}),
    ...(metadata.metadataFilter !== undefined
      ? { metadata_filter: metadata.metadataFilter }
      : {}),
  }
}

function convertComputerUseTool(tool: Tool): InteractionsTool {
  const metadata = (getGeminiProviderToolMetadata(tool) ?? {}) as {
    environment?: string
    excludedPredefinedFunctions?: Array<string>
  }
  if (metadata.environment && metadata.environment !== 'browser') {
    throw new Error(
      `computer_use environment "${metadata.environment}" is not supported on the Gemini Interactions API. Only "browser" is accepted.`,
    )
  }
  return {
    type: 'computer_use',
    ...(metadata.environment
      ? { environment: metadata.environment as 'browser' }
      : {}),
    ...(metadata.excludedPredefinedFunctions
      ? {
          excludedPredefinedFunctions: metadata.excludedPredefinedFunctions,
        }
      : {}),
  }
}

function convertFunctionTool(tool: Tool): InteractionsTool {
  if (!tool.description) {
    throw new Error(
      `Tool ${tool.name} requires a description for the Gemini Interactions adapter`,
    )
  }
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: sanitizeToolParameters(
      tool.inputSchema ?? { type: 'object', properties: {} },
    ),
  }
}

const TOOL_CONVERTERS = new Map<string, (tool: Tool) => InteractionsTool>([
  ['google_search', convertGoogleSearchTool],
  ['code_execution', () => ({ type: 'code_execution' })],
  ['url_context', () => ({ type: 'url_context' })],
  ['file_search', convertFileSearchTool],
  ['computer_use', convertComputerUseTool],
  [
    'google_search_retrieval',
    () => {
      throw new Error(
        '`google_search_retrieval` is not supported on the Gemini Interactions API. Use `googleSearchTool()` (`google_search`) with `geminiTextInteractions()`, or call `geminiText()` for the legacy retrieval tool.',
      )
    },
  ],
  [
    'google_maps',
    () => {
      throw new Error(
        '`google_maps` is not yet supported on the Gemini Interactions API. Use `geminiText()` for Google Maps grounding.',
      )
    },
  ],
])

function convertOneTool(tool: Tool): InteractionsTool | undefined {
  const kind = getGeminiProviderToolKind(tool)
  if (kind === undefined) return convertFunctionTool(tool)
  const converter = TOOL_CONVERTERS.get(kind)
  if (!converter) return undefined
  return converter(tool)
}

function convertToolsToInteractionsFormat<TTool extends Tool>(
  tools: Array<TTool> | undefined,
): Array<InteractionsTool> | undefined {
  if (!tools) return undefined
  if (tools.length === 0) return undefined
  assertUniqueToolNames(tools)

  const result: Array<InteractionsTool> = []
  for (const tool of tools) {
    const converted = convertOneTool(tool)
    if (converted) result.push(converted)
  }
  return result
}

function extractTextFromInteraction(interaction: Interaction): string {
  if (typeof interaction.output_text === 'string' && interaction.output_text) {
    return interaction.output_text
  }
  let text = ''
  for (const step of interaction.steps ?? []) {
    if (step.type !== 'model_output') continue
    if (!step.content) continue
    for (const part of step.content) {
      if (part.type === 'text') {
        text += part.text
      }
    }
  }
  return text
}

function sanitizeToolParameters(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map(sanitizeToolParameters)
  const out: Record<string, unknown> = {}
  const schemaEntries = Object.entries(schema)
  for (const [key, value] of schemaEntries) {
    const isEmptyRequired =
      key === 'required' && Array.isArray(value) && value.length === 0
    if (isEmptyRequired) {
      continue
    }
    out[key] = sanitizeToolParameters(value)
  }
  return out
}

export type { GeminiInteractionsStream }
