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

// The Interactions API takes `input` as a list of *Steps* (not a list of
// content blocks, and not a list of `Turn`s — the SDK's type union is
// misleading on both counts). The live API enforces the Step envelope —
// raw content arrays produce `invalid_request` / "value at top-level
// must be a list". The wire discriminator is snake_case
// (`user_input` / `function_result`); see
// https://ai.google.dev/api/interactions-api for the full Step union.
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

// Concrete wire shape we send to `client.interactions.create`. The SDK's
// own param union types `input` as `string | Content[] | Turn[] | ...`
// which is wrong for the live API (see the InteractionsRequestInput
// comment above), so we type `input` ourselves and cast just once at the
// SDK boundary instead of casting every field through.
type GeminiInteractionsRequestBody = Omit<
  Interactions.CreateModelInteractionParamsStreaming,
  'input' | 'stream'
> & {
  input: InteractionsRequestInput
  stream?: boolean
}

// ===========================
// Type Resolution Helpers
// ===========================

/**
 * Resolve provider options for a specific model. The Interactions API's
 * request shape is the same across all chat-capable Gemini models — the
 * SDK doesn't expose a per-model param union — so this currently falls
 * through to the flat `GeminiTextInteractionsProviderOptions` for every
 * model. The alias exists for parity with `GeminiTextAdapter`, so a
 * per-model map can be slotted in later without changing the adapter
 * signature.
 */
type ResolveProviderOptions = GeminiTextInteractionsProviderOptions

/**
 * Resolve input modalities for a specific model. Reuses the chat-model
 * modality map from `model-meta.ts`: passing a `document` content block
 * to a model that doesn't support it is a compile error, matching the
 * sibling `GeminiTextAdapter`.
 */
type ResolveInputModalities<TModel extends string> =
  TModel extends keyof GeminiModelInputModalitiesByName
    ? GeminiModelInputModalitiesByName[TModel]
    : readonly ['text', 'image', 'audio', 'video', 'document']

/**
 * Resolve tool capabilities for a specific model. Reuses the chat-model
 * capability map: `google_maps` / `google_search_retrieval` are rejected at
 * runtime by `convertToolsToInteractionsFormat`, but per-model gating happens
 * here at compile time.
 */
type ResolveToolCapabilities<TModel extends string> =
  TModel extends keyof GeminiChatModelToolCapabilitiesByName
    ? NonNullable<GeminiChatModelToolCapabilitiesByName[TModel]>
    : readonly []

/**
 * Tree-shakeable adapter for Gemini's stateful Interactions API. Routes
 * through `client.interactions.create` and surfaces the server-assigned
 * `interactionId` via an AG-UI `CUSTOM` event with
 * `name: 'gemini.interactionId'` emitted just before `RUN_FINISHED`; pass
 * that id back on the next turn via `modelOptions.previous_interaction_id`
 * to continue the conversation without resending history.
 *
 * The Interactions API does NOT support stateless multi-turn replay —
 * passing more than one message in `messages` without a
 * `previous_interaction_id` throws. For a chat UI that maintains local
 * history (e.g. `useChat`), see the "Wiring with `useChat`" section of
 * `docs/adapters/gemini.md` for the canonical client/server pattern.
 *
 * Supports user-defined function tools and the built-in tools
 * `google_search`, `code_execution`, `url_context`, `file_search`, and
 * `computer_use`. Built-in tool *activity* for the four search/exec
 * variants is surfaced via `CUSTOM` events
 * (`gemini.googleSearchCall` / `gemini.googleSearchResult` and the
 * corresponding per-tool variants) carrying the raw Interactions delta;
 * see {@link GeminiInteractionsCustomEvent}. `computer_use` is accepted
 * in the request but the Interactions API does not currently stream
 * per-delta CUSTOM events for it. The `google_search_retrieval` and
 * `google_maps` provider-tool factories are not supported on this adapter and
 * throw a targeted error. There is no Gemini `mcp_server` factory, so a tool
 * merely *named* `mcp_server` is an ordinary function and is sent as a function
 * declaration like any other.
 *
 * @experimental Interactions API is in Beta per Google; shapes may change.
 * @see https://ai.google.dev/gemini-api/docs/interactions
 */
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
  // Tracks the most recent server-assigned interaction id per threadId
  // so the adapter can chain follow-up calls on the same thread without
  // the caller having to thread the id manually. Two callers rely on
  // this:
  //   1. The agent loop's tool-call iterations (each iteration is a new
  //      `chatStream` call with accumulated tool messages).
  //   2. The agentic-structured composition: a `chatStream` run followed
  //      by `structuredOutput` on the accumulated messages.
  // Cross-request chaining is the caller's job via
  // `modelOptions.previous_interaction_id`. To keep stale ids from
  // chaining a brand-new turn, `chatStream` evicts at the START when
  // the caller signals fresh-turn intent (no caller-provided id AND a
  // single user message — anything else is a follow-up). Errors evict
  // immediately so a failed turn never chains into the next one.
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
    // Fresh-turn intent: caller didn't thread an id AND only a single
    // user message is queued. Drop any stale captured id so we don't
    // silently chain off a prior turn the caller doesn't know about.
    // Multi-message inputs are follow-ups (agent-loop iteration or
    // structuredOutput composition) and keep the Map entry.
    if (isFreshTurn) {
      interactionIdByThread.delete(threadId)
    }

    // Resolve `previous_interaction_id`. Caller-provided wins; otherwise
    // fall back to the id we captured during a prior iteration of this
    // same agent-loop run (matched by threadId).
    const effectivePreviousInteractionId =
      options.modelOptions?.previous_interaction_id ??
      interactionIdByThread.get(threadId)

    let sawTerminalEvent = false
    // Sentinel for the `.return()` abandonment path. Set to `true` only at
    // the bottom of the `try` block — so a consumer-initiated close (via
    // upstream `break` or abort) leaves it `false`, distinguishing
    // abandonment from normal completion. This is the only signal that
    // catches abandonment AFTER a `RUN_FINISHED(tool_calls)`, where
    // `sawTerminalEvent` is `true` but the in-loop deliberately kept the
    // map entry for an agent-loop iteration that will now never run.
    let completedTryBlock = false

    const captureInteractionId = (chunk: AdapterYieldChunk) => {
      if (
        chunk.type !== EventType.CUSTOM ||
        chunk.name !== 'gemini.interactionId'
      ) {
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

      for await (const chunk of translateInteractionEvents(
        stream,
        options.model,
        runId,
        threadId,
        options.parentRunId,
        timestamp,
        this.name,
        logger,
      )) {
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

    // Mirror the chatStream fallback: the agentic-structured flow runs
    // the chat loop first and then calls structuredOutput with the
    // accumulated `messages`. If any tool ran during the loop, the
    // messages include assistant/tool turns; without a chained
    // previous_interaction_id those would throw "cannot send prior
    // conversation history on a fresh interaction".
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

    // SDK 2.x: `response_mime_type` has been removed and `response_format`
    // is now polymorphic — each entry has a `type` discriminator and the
    // mime type lives inside the entry. See:
    // https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026
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

// Google's Interactions API takes `input` as `Array<Step>`. Each Step
// is `{type: 'user_input' | 'function_result' | ..., ...}` — content
// blocks (text/image/etc.) live nested inside a Step's `content` array,
// they are NOT valid at the top level. Sending raw `Array<Content>`
// produces `invalid_request` / "value at top-level must be a list",
// because the API is looking for a Step list at the top level and
// gets content objects instead. The SDK's type union
// (`string | Array<Content> | Array<Turn> | ...`) is misleading; see
// https://ai.google.dev/api/interactions-api for the real Step union.
//
// When `hasPreviousInteraction` is true the server holds the transcript
// up through the last assistant turn, so we only send the steps that
// come after it (a new `user_input`, one or more `function_result`s
// continuing a tool call, etc.). Otherwise the conversation is fresh
// and only the latest user turn is supported — multi-turn replay
// without `previous_interaction_id` is not part of the API contract.
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

  if (hasPreviousInteraction && source.length === 0) {
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

  // Chained path: each post-assistant message becomes one Step. A user
  // reply maps to `user_input`; a tool reply maps to `function_result`.
  // Assistant turns shouldn't appear here (sliced off above) — if one
  // somehow does we skip it rather than letting it shape the wire.
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

// The Interactions API's `function_result.result` field is a string. We
// fail loudly on non-string tool content rather than silently coercing
// to `''` — silent coercion meant the model lost the entire tool
// output for callers that returned content as an array (e.g. image +
// text) or `null`. If you need to send structured tool output, encode
// it yourself before passing.
function serializeToolResultContent(
  content: ModelMessage['content'] | undefined,
): string {
  if (typeof content === 'string') return content
  if (content === null || content === undefined) {
    throw new Error(
      'Gemini Interactions adapter: tool message has no content. The Interactions API requires a string `result` on function_result steps — return a string from your tool implementation (encode JSON/multimodal output yourself).',
    )
  }
  throw new Error(
    'Gemini Interactions adapter: tool message content must be a string (got an array of content parts). The Interactions API requires a string `result` on function_result steps — stringify multimodal tool output before returning it from your tool.',
  )
}

// Extracts the content blocks (text / image / audio / video / document)
// from a single message. Tool calls and tool results live one level up
// as Steps, not as content, so they are NOT emitted here.
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

// `satisfies` pins these arrays to the SDK's narrow mime-type unions: if
// Google removes a format the build breaks, and if they add one ours keeps
// working (we just won't accept the new one until added here).
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
  if (!tools || tools.length === 0) return undefined
  assertUniqueToolNames(tools)

  const result: Array<InteractionsTool> = []
  for (const tool of tools) {
    const converted = convertOneTool(tool)
    if (converted) result.push(converted)
  }
  return result
}

function extractTextFromInteraction(interaction: Interaction): string {
  // SDK 2.x: the response carries a `steps` array; `output_text` is a
  // convenience the SDK derives from the last model output. Prefer the
  // SDK sugar when it's populated, then fall back to walking
  // model_output steps for adapters / responses that don't get the
  // sugar (e.g. older SDK builds).
  if (typeof interaction.output_text === 'string' && interaction.output_text) {
    return interaction.output_text
  }
  let text = ''
  for (const step of interaction.steps ?? []) {
    if (step.type !== 'model_output' || !step.content) continue
    for (const part of step.content) {
      if (part.type === 'text') {
        text += part.text
      }
    }
  }
  return text
}

// The live Interactions API rejects tool parameter schemas that contain
// an empty `required: []` array with the misleading top-level error
// `"value at top-level must be a list"`. Empty `properties: {}` and
// `parameters: {}` are both fine — only the empty `required` array is
// poison. The Zod -> JSON Schema converter (and many hand-written
// schemas) emit `required: []` whenever a tool has zero required
// parameters, so we strip those instances recursively before sending.
// Non-empty `required` arrays are passed through unchanged.
function sanitizeToolParameters(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return schema
  if (Array.isArray(schema)) return schema.map(sanitizeToolParameters)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'required' && Array.isArray(value) && value.length === 0) {
      continue
    }
    out[key] = sanitizeToolParameters(value)
  }
  return out
}

// Re-export the stream type so consumers can import it alongside the
// adapter from a single path: `import type { GeminiInteractionsStream }
// from '@tanstack/ai-gemini/experimental'`.
export type { GeminiInteractionsStream }
