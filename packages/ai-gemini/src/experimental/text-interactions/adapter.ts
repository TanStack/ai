import { EventType, assertOwnFileSource, isFileSource } from '@tanstack/ai'
import { BaseTextAdapter } from '@tanstack/ai/adapters'
import { parse as parsePartialJSON } from 'partial-json'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../../utils/client'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
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
  StreamChunk,
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

type ToolCallState = {
  name: string
  // Accumulated args as a parsed object. Kept here in object form so a
  // garbled delta can't corrupt previously-merged fragments (the prior
  // string-then-reparse pipeline replaced the whole accumulator on any
  // parse failure). Stringified only when emitting AG-UI events.
  args: Record<string, unknown>
  index: number
  started: boolean
  ended: boolean
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
 * capability map: `google_maps` / `google_search_retrieval` /
 * `mcp_server` are rejected at runtime by `convertToolsToInteractionsFormat`,
 * but per-model gating happens here at compile time.
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
 * per-delta CUSTOM events for it. `google_search_retrieval`,
 * `google_maps`, and `mcp_server` are not supported on this adapter.
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
  ): AsyncIterable<StreamChunk> {
    const runId = options.runId ?? generateId(this.name)
    const threadId = options.threadId ?? generateId(this.name)
    const timestamp = Date.now()
    const { logger } = options

    // Fresh-turn intent: caller didn't thread an id AND only a single
    // user message is queued. Drop any stale captured id so we don't
    // silently chain off a prior turn the caller doesn't know about.
    // Multi-message inputs are follow-ups (agent-loop iteration or
    // structuredOutput composition) and keep the Map entry.
    if (
      !options.modelOptions?.previous_interaction_id &&
      options.messages.length === 1 &&
      options.messages[0]?.role === 'user'
    ) {
      this.interactionIdByThread.delete(threadId)
    }

    // Resolve `previous_interaction_id`. Caller-provided wins; otherwise
    // fall back to the id we captured during a prior iteration of this
    // same agent-loop run (matched by threadId).
    const effectivePreviousInteractionId =
      options.modelOptions?.previous_interaction_id ??
      this.interactionIdByThread.get(threadId)

    let sawTerminalEvent = false
    // Sentinel for the `.return()` abandonment path. Set to `true` only at
    // the bottom of the `try` block — so a consumer-initiated close (via
    // upstream `break` or abort) leaves it `false`, distinguishing
    // abandonment from normal completion. This is the only signal that
    // catches abandonment AFTER a `RUN_FINISHED(tool_calls)`, where
    // `sawTerminalEvent` is `true` but the in-loop deliberately kept the
    // map entry for an agent-loop iteration that will now never run.
    let completedTryBlock = false
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
        // Capture the server-assigned id so the next agent-loop
        // iteration on this thread can chain off it. The CUSTOM event
        // is also yielded downstream as usual — callers consume it via
        // `onCustomEvent` for cross-request chaining.
        //
        // The yield type can't be narrowed to GeminiInteractionsStream
        // here without fighting zod-passthrough variance (StreamChunk's
        // CustomEvent variant carries `[k: string]: unknown`), so we
        // narrow via the literal `name` and trust the typed
        // construction inside `translateInteractionEvents`.
        if (
          chunk.type === EventType.CUSTOM &&
          chunk.name === 'gemini.interactionId'
        ) {
          const value =
            chunk.value as GeminiInteractionsCustomEventValue<'gemini.interactionId'>
          this.interactionIdByThread.set(threadId, value.interactionId)
        }
        if (chunk.type === EventType.RUN_FINISHED) {
          sawTerminalEvent = true
          // Keep the captured id for follow-ups (next agent-loop
          // iteration OR a structuredOutput call composing this turn).
          // The next *fresh* chatStream call evicts at the top via the
          // fresh-turn guard.
        } else if (chunk.type === EventType.RUN_ERROR) {
          sawTerminalEvent = true
          this.interactionIdByThread.delete(threadId)
        }
        yield chunk
      }

      if (!sawTerminalEvent) {
        // SDK stream ended without either `interaction.complete` or
        // `error` — surface the truncation rather than silently leaving
        // downstream consumers waiting on a `RUN_FINISHED` that will
        // never come.
        this.interactionIdByThread.delete(threadId)
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
      completedTryBlock = true
    } catch (error) {
      this.interactionIdByThread.delete(threadId)
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
    } finally {
      // Abandonment cleanup — consumer `.return()` (upstream `break` /
      // abort) bypasses both the truncation guard and the catch handler.
      // `completedTryBlock` is the sentinel that distinguishes natural
      // completion from abandonment; on abandonment we evict so a stale
      // id from a half-finished turn can't chain into a follow-up. The
      // catch handler also lands here with the flag false; its explicit
      // delete is harmless to repeat.
      if (!completedTryBlock) {
        this.interactionIdByThread.delete(threadId)
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

// Leniently parse the *accumulated* streamed tool-call argument buffer.
// Streamed `arguments_delta` fragments are individually incomplete JSON, so
// a strict `JSON.parse` would throw (and log noise) on every fragment until
// the final one. `partial-json` recovers a best-effort object from a
// truncated buffer instead. Returns `undefined` when nothing usable could be
// parsed, so callers can keep the last good value rather than clobber
// previously-merged args with `{}`.
function parsePartialToolArguments(
  raw: string,
): Record<string, unknown> | undefined {
  if (!raw) return undefined
  try {
    const parsed = parsePartialJSON(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
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
  // A file handle from another provider is a bug; a Gemini handle maps to the
  // `uri` field (isData stays false), same as a public URL.
  if (isFileSource(part.source)) {
    assertOwnFileSource(part.source, 'gemini')
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

// Built-in Gemini tools use snake_case field names in the Interactions API
// that differ from the camelCase fields used on `client.models.generateContent`
// (e.g. `fileSearchStoreNames` vs `file_search_store_names`). Translate
// explicitly so callers keep using the same tool factories across adapters.
function convertToolsToInteractionsFormat<TTool extends Tool>(
  tools: Array<TTool> | undefined,
): Array<InteractionsTool> | undefined {
  if (!tools || tools.length === 0) return undefined

  const result: Array<InteractionsTool> = []

  for (const tool of tools) {
    switch (tool.name) {
      case 'google_search': {
        const metadata = (tool.metadata ?? {}) as {
          search_types?: Array<'web_search' | 'image_search'>
        }
        result.push({
          type: 'google_search',
          ...(metadata.search_types
            ? { search_types: metadata.search_types }
            : {}),
        })
        break
      }
      case 'code_execution': {
        result.push({ type: 'code_execution' })
        break
      }
      case 'url_context': {
        result.push({ type: 'url_context' })
        break
      }
      case 'file_search': {
        const metadata = (tool.metadata ?? {}) as {
          fileSearchStoreNames?: Array<string>
          topK?: number
          metadataFilter?: string
        }
        result.push({
          type: 'file_search',
          ...(metadata.fileSearchStoreNames
            ? { file_search_store_names: metadata.fileSearchStoreNames }
            : {}),
          ...(metadata.topK !== undefined ? { top_k: metadata.topK } : {}),
          ...(metadata.metadataFilter !== undefined
            ? { metadata_filter: metadata.metadataFilter }
            : {}),
        })
        break
      }
      case 'computer_use': {
        const metadata = (tool.metadata ?? {}) as {
          environment?: string
          excludedPredefinedFunctions?: Array<string>
        }
        if (metadata.environment && metadata.environment !== 'browser') {
          throw new Error(
            `computer_use environment "${metadata.environment}" is not supported on the Gemini Interactions API. Only "browser" is accepted.`,
          )
        }
        result.push({
          type: 'computer_use',
          ...(metadata.environment
            ? { environment: metadata.environment as 'browser' }
            : {}),
          ...(metadata.excludedPredefinedFunctions
            ? {
                excludedPredefinedFunctions:
                  metadata.excludedPredefinedFunctions,
              }
            : {}),
        })
        break
      }
      case 'google_search_retrieval':
        throw new Error(
          '`google_search_retrieval` is not supported on the Gemini Interactions API. Use `googleSearchTool()` (`google_search`) with `geminiTextInteractions()`, or call `geminiText()` for the legacy retrieval tool.',
        )
      case 'google_maps':
        throw new Error(
          '`google_maps` is not yet supported on the Gemini Interactions API. Use `geminiText()` for Google Maps grounding.',
        )
      case 'mcp_server':
        throw new Error(
          '`mcp_server` is not yet supported on the `geminiTextInteractions()` adapter.',
        )
      default: {
        if (!tool.description) {
          throw new Error(
            `Tool ${tool.name} requires a description for the Gemini Interactions adapter`,
          )
        }
        result.push({
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: sanitizeToolParameters(
            tool.inputSchema ?? { type: 'object', properties: {} },
          ),
        })
      }
    }
  }

  return result
}

// Map of API-level status values onto the AG-UI `finishReason` field.
// `requires_action` is the Interactions API's signal that the model
// produced one or more function calls and is waiting for results — we
// always map that to 'tool_calls' regardless of whether deltas were
// observed (a function_call may have arrived in a single delta with no
// other content). `incomplete` is the truncation signal (max_tokens
// exceeded etc.) — map to 'length'. `completed` is normal stop.
function statusToFinishReason(
  status: Interaction['status'] | undefined,
  sawFunctionCall: boolean,
): 'stop' | 'length' | 'tool_calls' | null {
  if (status === 'requires_action') return 'tool_calls'
  if (status === 'incomplete') return 'length'
  if (sawFunctionCall) return 'tool_calls'
  return 'stop'
}

// Statuses that mean the interaction did not produce a usable result.
// `failed`/`cancelled` map to RUN_ERROR. `incomplete` is the model
// hitting a stop condition (max_tokens etc.) and is reported via
// `finishReason: 'length'` on RUN_FINISHED so callers can decide how to
// react without it looking like a hard error.
function statusIsError(
  status: Interaction['status'] | undefined,
): status is 'failed' | 'cancelled' {
  return status === 'failed' || status === 'cancelled'
}

async function* translateInteractionEvents(
  stream: AsyncIterable<InteractionSSEEvent>,
  model: string,
  runId: string,
  threadId: string,
  parentRunId: string | undefined,
  timestamp: number,
  adapterName: string,
  logger: InternalLogger,
): AsyncIterable<StreamChunk> {
  const messageId = generateId(adapterName)
  let hasEmittedRunStarted = false
  let hasEmittedTextMessageStart = false
  let textAccumulated = ''
  let interactionId: string | undefined
  let sawFunctionCall = false
  const toolCalls = new Map<string, ToolCallState>()
  let nextToolIndex = 0
  let thinkingStepId: string | null = null
  let thinkingAccumulated = ''
  let reasoningMessageId: string | null = null
  let hasClosedReasoning = false
  // SDK 2.x routes events by step `index`, not by content id. We need to
  // map the index of an in-flight `function_call` step back to the tool
  // call id so subsequent `step.delta` (arguments_delta) and `step.stop`
  // events can update / close the right TOOL_CALL_*.
  const indexToToolCallId = new Map<number, string>()
  // Function-call arguments now stream as partial JSON fragments
  // (`StepDelta.ArgumentsDelta.arguments`) rather than as pre-parsed
  // object deltas. Buffer the raw strings per tool call so we can
  // attempt one JSON parse per delta and recover gracefully if the
  // fragment isn't yet syntactically complete.
  const argStringByToolCallId = new Map<string, string>()

  const closeReasoningIfNeeded = function* (): Generator<StreamChunk> {
    if (reasoningMessageId && !hasClosedReasoning) {
      hasClosedReasoning = true
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId: reasoningMessageId,
        model,
        timestamp,
      }
      yield {
        type: EventType.REASONING_END,
        messageId: reasoningMessageId,
        model,
        timestamp,
      }
      // Reset so that a later `thought_summary` delta (the API
      // interleaves text → thought → text on some models) opens a
      // fresh reasoning block instead of re-using an already-ended
      // messageId, which would violate AG-UI ordering.
      thinkingStepId = null
      reasoningMessageId = null
      hasClosedReasoning = false
    }
  }

  // Seals any in-flight messages and tool calls. Called both on the
  // normal terminal path (`interaction.complete`) and on the error path
  // (`error` SSE event + premature EOF) so the StreamProcessor never
  // sees orphan TEXT_MESSAGE_START / TOOL_CALL_START / REASONING_*
  // events on RUN_ERROR.
  const closeOpenState = function* (): Generator<StreamChunk> {
    yield* closeReasoningIfNeeded()
    for (const [toolCallId, state] of toolCalls) {
      if (state.ended) continue
      state.ended = true
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        toolName: state.name,
        model,
        timestamp,
        input: state.args,
      }
    }
    if (hasEmittedTextMessageStart) {
      hasEmittedTextMessageStart = false
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        model,
        timestamp,
      }
    }
  }

  const emitRunStartedIfNeeded = function* (): Generator<StreamChunk> {
    if (!hasEmittedRunStarted) {
      hasEmittedRunStarted = true
      yield {
        type: EventType.RUN_STARTED,
        runId,
        threadId,
        model,
        timestamp,
        parentRunId,
      }
    }
  }

  for await (const event of stream) {
    logger.provider(`provider=gemini-text-interactions`, { event })
    switch (event.event_type) {
      case 'interaction.created': {
        interactionId = event.interaction.id
        yield* emitRunStartedIfNeeded()
        break
      }

      case 'step.start': {
        yield* emitRunStartedIfNeeded()
        const step = event.step
        const index = event.index
        switch (step.type) {
          case 'function_call': {
            yield* closeReasoningIfNeeded()
            sawFunctionCall = true
            const toolCallId = step.id
            indexToToolCallId.set(index, toolCallId)
            // `step.arguments` is required on FunctionCallStep but may
            // be an empty `{}` placeholder when streaming, where the
            // real args arrive as `arguments_delta` events. Treat both
            // uniformly: stash whatever we got, stringify once.
            const initialArgs = step.arguments
            const state: ToolCallState = {
              name: step.name,
              args: { ...initialArgs },
              index: nextToolIndex++,
              started: true,
              ended: false,
            }
            toolCalls.set(toolCallId, state)
            argStringByToolCallId.set(
              toolCallId,
              Object.keys(initialArgs).length > 0
                ? JSON.stringify(initialArgs)
                : '',
            )
            yield {
              type: EventType.TOOL_CALL_START,
              toolCallId,
              toolCallName: state.name,
              toolName: state.name,
              // Bind the tool call to the same assistant message id the
              // eventual TEXT_MESSAGE_START uses so the message id stays
              // stable when a function_call arrives before any text (#477).
              parentMessageId: messageId,
              model,
              timestamp,
              index: state.index,
            }
            if (Object.keys(initialArgs).length > 0) {
              const argsJson = JSON.stringify(initialArgs)
              yield {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId,
                model,
                timestamp,
                delta: argsJson,
                args: argsJson,
              }
            }
            break
          }
          case 'thought': {
            // Open the reasoning block lazily — content lands here via
            // `step.delta { thought_summary }` events. If the server
            // ships a non-empty `summary` array up-front (rare, unary
            // responses), surface it immediately.
            if (thinkingStepId === null || reasoningMessageId === null) {
              thinkingStepId = generateId(adapterName)
              reasoningMessageId = generateId(adapterName)
              yield {
                type: EventType.REASONING_START,
                messageId: reasoningMessageId,
                model,
                timestamp,
              }
              yield {
                type: EventType.REASONING_MESSAGE_START,
                messageId: reasoningMessageId,
                role: 'reasoning',
                model,
                timestamp,
              }
              yield {
                type: EventType.STEP_STARTED,
                stepName: thinkingStepId,
                stepId: thinkingStepId,
                model,
                timestamp,
                stepType: 'thinking',
              }
            }
            for (const part of step.summary ?? []) {
              if (part.type !== 'text' || !part.text) continue
              thinkingAccumulated += part.text
              yield {
                type: EventType.REASONING_MESSAGE_CONTENT,
                messageId: reasoningMessageId,
                delta: part.text,
                model,
                timestamp,
              }
              yield {
                type: EventType.STEP_FINISHED,
                stepName: thinkingStepId,
                stepId: thinkingStepId,
                model,
                timestamp,
                delta: part.text,
                content: thinkingAccumulated,
              }
            }
            break
          }
          case 'model_output': {
            yield* closeReasoningIfNeeded()
            // Some servers ship an initial `content` array on
            // `step.start` (notably non-streaming and ahead-of-stream
            // unary completions). Treat any prefilled text content the
            // same way a `text` step.delta would.
            for (const part of step.content ?? []) {
              if (part.type !== 'text' || !part.text) continue
              if (!hasEmittedTextMessageStart) {
                hasEmittedTextMessageStart = true
                yield {
                  type: EventType.TEXT_MESSAGE_START,
                  messageId,
                  model,
                  timestamp,
                  role: 'assistant',
                }
              }
              textAccumulated += part.text
              yield {
                type: EventType.TEXT_MESSAGE_CONTENT,
                messageId,
                model,
                timestamp,
                delta: part.text,
                content: textAccumulated,
              }
            }
            break
          }
          case 'google_search_call': {
            yield* closeReasoningIfNeeded()
            yield {
              type: EventType.CUSTOM,
              name: 'gemini.googleSearchCall',
              value: step,
              model,
              timestamp,
            }
            break
          }
          case 'google_search_result': {
            yield* closeReasoningIfNeeded()
            yield {
              type: EventType.CUSTOM,
              name: 'gemini.googleSearchResult',
              value: step,
              model,
              timestamp,
            }
            break
          }
          case 'code_execution_call': {
            yield* closeReasoningIfNeeded()
            yield {
              type: EventType.CUSTOM,
              name: 'gemini.codeExecutionCall',
              value: step,
              model,
              timestamp,
            }
            break
          }
          case 'code_execution_result': {
            yield* closeReasoningIfNeeded()
            yield {
              type: EventType.CUSTOM,
              name: 'gemini.codeExecutionResult',
              value: step,
              model,
              timestamp,
            }
            break
          }
          case 'url_context_call': {
            yield* closeReasoningIfNeeded()
            yield {
              type: EventType.CUSTOM,
              name: 'gemini.urlContextCall',
              value: step,
              model,
              timestamp,
            }
            break
          }
          case 'url_context_result': {
            yield* closeReasoningIfNeeded()
            yield {
              type: EventType.CUSTOM,
              name: 'gemini.urlContextResult',
              value: step,
              model,
              timestamp,
            }
            break
          }
          case 'file_search_call': {
            yield* closeReasoningIfNeeded()
            yield {
              type: EventType.CUSTOM,
              name: 'gemini.fileSearchCall',
              value: step,
              model,
              timestamp,
            }
            break
          }
          case 'file_search_result': {
            yield* closeReasoningIfNeeded()
            yield {
              type: EventType.CUSTOM,
              name: 'gemini.fileSearchResult',
              value: step,
              model,
              timestamp,
            }
            break
          }
          // Unhandled step types (user_input on GET timelines,
          // mcp_server_*, google_maps_*, function_result) fall through
          // to the observability default so SDK drift is visible.
          case 'user_input':
          case 'mcp_server_tool_call':
          case 'mcp_server_tool_result':
          case 'google_maps_call':
          case 'google_maps_result':
          case 'function_result':
          default:
            logger.provider(`gemini-text-interactions unhandled step.start`, {
              step,
            })
            break
        }
        break
      }

      case 'step.delta': {
        yield* emitRunStartedIfNeeded()
        const delta = event.delta
        const index = event.index
        switch (delta.type) {
          case 'text': {
            yield* closeReasoningIfNeeded()
            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield {
                type: EventType.TEXT_MESSAGE_START,
                messageId,
                model,
                timestamp,
                role: 'assistant',
              }
            }
            textAccumulated += delta.text
            yield {
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId,
              model,
              timestamp,
              delta: delta.text,
              content: textAccumulated,
            }
            break
          }
          case 'arguments_delta': {
            // Streamed function-call arguments. Identity (id, name) was
            // delivered on the matching `step.start` and recorded in
            // indexToToolCallId.
            const toolCallId = indexToToolCallId.get(index)
            if (!toolCallId) {
              logger.provider(
                `gemini-text-interactions arguments_delta for unknown step index`,
                { index, delta },
              )
              break
            }
            const state = toolCalls.get(toolCallId)
            if (!state) break
            const fragment = delta.arguments ?? ''
            const buffer =
              (argStringByToolCallId.get(toolCallId) ?? '') + fragment
            argStringByToolCallId.set(toolCallId, buffer)
            // Parse the accumulated buffer leniently: streamed arg fragments
            // are individually incomplete JSON, so use a partial-JSON parser
            // that tolerates truncation rather than logging a parse error per
            // fragment. Only overwrite `state.args` when we actually recovered
            // an object, so a momentarily-unparseable fragment can't reset
            // previously-merged args back to `{}`.
            const parsed = parsePartialToolArguments(buffer)
            if (parsed) state.args = parsed
            yield {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId,
              model,
              timestamp,
              delta: fragment,
              args: buffer,
            }
            break
          }
          case 'thought_summary': {
            const thoughtText =
              delta.content && 'text' in delta.content ? delta.content.text : ''
            if (!thoughtText) break
            if (thinkingStepId === null || reasoningMessageId === null) {
              thinkingStepId = generateId(adapterName)
              reasoningMessageId = generateId(adapterName)
              yield {
                type: EventType.REASONING_START,
                messageId: reasoningMessageId,
                model,
                timestamp,
              }
              yield {
                type: EventType.REASONING_MESSAGE_START,
                messageId: reasoningMessageId,
                role: 'reasoning',
                model,
                timestamp,
              }
              yield {
                type: EventType.STEP_STARTED,
                stepName: thinkingStepId,
                stepId: thinkingStepId,
                model,
                timestamp,
                stepType: 'thinking',
              }
            }
            thinkingAccumulated += thoughtText
            yield {
              type: EventType.REASONING_MESSAGE_CONTENT,
              messageId: reasoningMessageId,
              delta: thoughtText,
              model,
              timestamp,
            }
            yield {
              type: EventType.STEP_FINISHED,
              stepName: thinkingStepId,
              stepId: thinkingStepId,
              model,
              timestamp,
              delta: thoughtText,
              content: thinkingAccumulated,
            }
            break
          }
          // The remaining StepDelta variants (image/audio/video/document
          // for output modalities a text adapter shouldn't see, tool
          // call/result deltas which are surfaced via step.start in this
          // adapter, thought_signature, annotation deltas, mcp/google
          // maps variants) fall through to the observability default.
          case 'image':
          case 'audio':
          case 'video':
          case 'document':
          case 'thought_signature':
          case 'text_annotation_delta':
          case 'code_execution_call':
          case 'code_execution_result':
          case 'url_context_call':
          case 'url_context_result':
          case 'google_search_call':
          case 'google_search_result':
          case 'file_search_call':
          case 'file_search_result':
          case 'mcp_server_tool_call':
          case 'mcp_server_tool_result':
          case 'google_maps_call':
          case 'google_maps_result':
          case 'function_result':
          default:
            logger.provider(
              `gemini-text-interactions unhandled step.delta type`,
              { delta },
            )
            break
        }
        break
      }

      case 'step.stop': {
        // Close any open function_call so downstream consumers get the
        // matching TOOL_CALL_END once the arguments are complete. Other
        // step types don't carry adapter-level open state.
        const toolCallId = indexToToolCallId.get(event.index)
        if (toolCallId) {
          const state = toolCalls.get(toolCallId)
          if (state && !state.ended) {
            state.ended = true
            yield {
              type: EventType.TOOL_CALL_END,
              toolCallId,
              toolName: state.name,
              model,
              timestamp,
              input: state.args,
            }
          }
          indexToToolCallId.delete(event.index)
        }
        break
      }

      case 'interaction.status_update': {
        break
      }

      case 'interaction.completed': {
        if (event.interaction.id) {
          interactionId = event.interaction.id
        }

        yield* closeOpenState()

        const status = event.interaction.status
        if (statusIsError(status)) {
          const message = `Gemini Interactions ${status}: the interaction ended without a usable response.`
          logger.errors(
            'gemini-text-interactions.translateInteractionEvents non-success status',
            {
              source: 'gemini-text-interactions.chatStream',
              status,
              interactionId,
            },
          )
          yield {
            type: EventType.RUN_ERROR,
            runId,
            model,
            timestamp,
            message,
            code: status,
            error: { message, code: status },
          }
          return
        }

        const usage = event.interaction.usage
        const finishReason = statusToFinishReason(status, sawFunctionCall)

        if (interactionId) {
          yield {
            type: EventType.CUSTOM,
            name: 'gemini.interactionId',
            value: { interactionId },
            model,
            timestamp,
          }
        }

        yield {
          type: EventType.RUN_FINISHED,
          runId,
          threadId,
          model,
          timestamp,
          finishReason,
          usage: usage
            ? {
                promptTokens: usage.total_input_tokens ?? 0,
                completionTokens: usage.total_output_tokens ?? 0,
                totalTokens: usage.total_tokens ?? 0,
              }
            : undefined,
        }
        return
      }

      case 'error': {
        // Close any in-flight TEXT_MESSAGE_START / TOOL_CALL_START /
        // REASONING_* so downstream consumers don't see orphan open
        // state after RUN_ERROR.
        yield* closeOpenState()
        const rawMessage = event.error?.message
        const message =
          typeof rawMessage === 'string' && rawMessage.length > 0
            ? rawMessage
            : `Gemini Interactions error (no message): ${JSON.stringify(event.error ?? {})}`
        const rawCode = event.error?.code
        const code =
          typeof rawCode === 'string' || typeof rawCode === 'number'
            ? String(rawCode)
            : undefined
        yield {
          type: EventType.RUN_ERROR,
          runId,
          model,
          timestamp,
          message,
          code,
          error: { message, code },
        }
        return
      }

      default:
        logger.provider(`gemini-text-interactions unhandled event_type`, {
          event,
        })
        break
    }
  }

  // Stream ended without `interaction.complete` or `error` (both `return`
  // out of the loop). Seal any in-flight TEXT/TOOL/REASONING blocks here
  // so the truncation-fallback RUN_ERROR yielded by `chatStream` doesn't
  // leave orphan `*_START` events open downstream.
  yield* closeOpenState()
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
