import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { GeminiModels } from '../model-meta'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '@tanstack/ai/adapters'
import type { GoogleGenAI, Interactions } from '@google/genai'
import type {
  ContentPart,
  ModelMessage,
  StreamChunk,
  TextOptions,
  Tool,
} from '@tanstack/ai'

import type { ExternalTextInteractionsProviderOptions } from '../text-interactions/text-interactions-provider-options'
import type { GeminiMessageMetadataByModality } from '../message-types'
import type { GeminiClientConfig } from '../utils'

type Interaction = Interactions.Interaction
type InteractionSSEEvent = Interactions.InteractionSSEEvent

/** Cast an event object to StreamChunk. Adapters construct events with string
 *  literal types which are structurally compatible with the EventType enum. */
const asChunk = (chunk: Record<string, unknown>) =>
  chunk as unknown as StreamChunk

export interface GeminiTextInteractionsConfig extends GeminiClientConfig {}

export type GeminiTextInteractionsProviderOptions =
  ExternalTextInteractionsProviderOptions

type InteractionsInput = NonNullable<Interactions.InteractionCreateParams>

type InteractionsTool = NonNullable<
  Extract<InteractionsInput, { tools?: any }>['tools']
>[number]

type TurnInput = Interactions.Turn
type ContentBlock = Interactions.Content

type ToolCallState = {
  name: string
  args: string
  index: number
  started: boolean
  ended: boolean
}

/**
 * Tree-shakeable adapter for Gemini's stateful Interactions API. Routes
 * through `client.interactions.create` and surfaces the server-assigned
 * `interactionId` via an AG-UI `CUSTOM` event with
 * `name: 'gemini.interactionId'` emitted just before `RUN_FINISHED`; pass
 * that id back on the next turn via `modelOptions.previous_interaction_id`
 * to continue the conversation without resending history.
 *
 * Supports user-defined function tools and the built-in tools
 * `google_search`, `code_execution`, `url_context`, `file_search`, and
 * `computer_use`. Built-in tool activity is surfaced via `CUSTOM` events
 * named `gemini.googleSearchCall`/`gemini.googleSearchResult` (and the
 * corresponding per-tool variants) carrying the raw Interactions delta.
 * `google_search_retrieval`, `google_maps`, and `mcp_server` are not
 * supported on this adapter.
 *
 * @experimental Interactions API is in Beta per Google; shapes may change.
 * @see https://ai.google.dev/gemini-api/docs/interactions
 */
export class GeminiTextInteractionsAdapter<
  TModel extends GeminiModels,
> extends BaseTextAdapter<
  TModel,
  GeminiTextInteractionsProviderOptions,
  readonly ['text', 'image', 'audio', 'video', 'document'],
  GeminiMessageMetadataByModality
> {
  readonly kind = 'text' as const
  readonly name = 'gemini-text-interactions' as const

  private client: GoogleGenAI

  constructor(config: GeminiTextInteractionsConfig, model: TModel) {
    super({}, model)
    this.client = createGeminiClient(config)
  }

  async *chatStream(
    options: TextOptions<GeminiTextInteractionsProviderOptions>,
  ): AsyncIterable<StreamChunk> {
    const runId = generateId(this.name)
    const timestamp = Date.now()
    const { logger } = options

    try {
      const request = buildInteractionsRequest(options)
      logger.request(
        `activity=chat provider=gemini-text-interactions model=${this.model} messages=${options.messages.length} tools=${options.tools?.length ?? 0} stream=true`,
        {
          provider: 'gemini-text-interactions',
          model: this.model,
          request,
        },
      )
      const stream = await this.client.interactions.create({
        ...request,
        stream: true,
      })

      yield* translateInteractionEvents(
        stream as AsyncIterable<InteractionSSEEvent>,
        options.model,
        runId,
        timestamp,
        this.name,
        logger,
      )
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during the interactions stream.'
      logger.errors('gemini-text-interactions.chatStream fatal', {
        error,
        source: 'gemini-text-interactions.chatStream',
      })
      yield asChunk({
        type: 'RUN_ERROR',
        runId,
        model: options.model,
        timestamp,
        message,
        error: { message },
      })
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<GeminiTextInteractionsProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const { logger } = chatOptions
    const baseRequest = buildInteractionsRequest(chatOptions)

    const request = {
      ...baseRequest,
      response_mime_type: 'application/json',
      response_format: outputSchema,
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
      const result = await this.client.interactions.create(request)

      const rawText = extractTextFromInteraction(result)

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
      throw new Error(
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during structured output generation.',
      )
    }
  }
}

/** @experimental Interactions API is in Beta. */
export function createGeminiTextInteractions<TModel extends GeminiModels>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiTextInteractionsConfig, 'apiKey'>,
): GeminiTextInteractionsAdapter<TModel> {
  return new GeminiTextInteractionsAdapter({ apiKey, ...config }, model)
}

/** @experimental Interactions API is in Beta. */
export function geminiTextInteractions<TModel extends GeminiModels>(
  model: TModel,
  config?: Omit<GeminiTextInteractionsConfig, 'apiKey'>,
): GeminiTextInteractionsAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiTextInteractions(model, apiKey, config)
}

function buildInteractionsRequest(
  options: TextOptions<GeminiTextInteractionsProviderOptions>,
) {
  const modelOpts = options.modelOptions

  const systemInstruction =
    modelOpts?.system_instruction ?? options.systemPrompts?.join('\n')

  const generationConfig: Interactions.GenerationConfig = {
    ...modelOpts?.generation_config,
  }
  if (options.temperature !== undefined) {
    generationConfig.temperature = options.temperature
  }
  if (options.topP !== undefined) {
    generationConfig.top_p = options.topP
  }
  if (options.maxTokens !== undefined) {
    generationConfig.max_output_tokens = options.maxTokens
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
    response_mime_type: modelOpts?.response_mime_type,
  }
}

// When `hasPreviousInteraction` is true the server holds the transcript up
// through the last assistant turn, so we only send messages that come after
// it (a new user turn, a tool result continuing a function call, etc.).
// Otherwise we send the full conversation as `Turn[]`.
function convertMessagesToInteractionsInput(
  messages: Array<ModelMessage>,
  hasPreviousInteraction: boolean,
): Array<TurnInput> {
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

  const turns: Array<TurnInput> = []
  for (const msg of source) {
    const turn = messageToTurn(msg, toolCallIdToName)
    if (turn) turns.push(turn)
  }

  if (hasPreviousInteraction && turns.length === 0) {
    throw new Error(
      'Gemini Interactions adapter: modelOptions.previous_interaction_id was provided but no new messages were found after the last assistant turn. Append at least one user or tool message before chaining.',
    )
  }

  return turns
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

function safeParseToolArguments(
  raw: string | undefined,
): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function messageToTurn(
  msg: ModelMessage,
  toolCallIdToName: Map<string, string>,
): TurnInput | undefined {
  const parts: Array<ContentBlock> = []

  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      parts.push(contentPartToBlock(part))
    }
  } else if (
    typeof msg.content === 'string' &&
    msg.content &&
    msg.role !== 'tool'
  ) {
    parts.push({ type: 'text', text: msg.content })
  }

  if (msg.role === 'assistant' && msg.toolCalls?.length) {
    for (const toolCall of msg.toolCalls) {
      parts.push({
        type: 'function_call',
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: safeParseToolArguments(toolCall.function.arguments),
      })
    }
  }

  if (msg.role === 'tool' && msg.toolCallId) {
    parts.push({
      type: 'function_result',
      call_id: msg.toolCallId,
      name: toolCallIdToName.get(msg.toolCallId),
      result: typeof msg.content === 'string' ? msg.content : '',
    })
  }

  if (parts.length === 0) return undefined

  const role = msg.role === 'assistant' ? 'model' : 'user'

  return { role, content: parts }
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
          parameters: tool.inputSchema ?? {
            type: 'object',
            properties: {},
            required: [],
          },
        })
      }
    }
  }

  return result
}

async function* translateInteractionEvents(
  stream: AsyncIterable<InteractionSSEEvent>,
  model: string,
  runId: string,
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

  const closeReasoningIfNeeded = function* (): Generator<StreamChunk> {
    if (reasoningMessageId && !hasClosedReasoning) {
      hasClosedReasoning = true
      yield asChunk({
        type: 'REASONING_MESSAGE_END',
        messageId: reasoningMessageId,
        model,
        timestamp,
      })
      yield asChunk({
        type: 'REASONING_END',
        messageId: reasoningMessageId,
        model,
        timestamp,
      })
    }
  }

  const emitRunStartedIfNeeded = function* (): Generator<StreamChunk> {
    if (!hasEmittedRunStarted) {
      hasEmittedRunStarted = true
      yield asChunk({
        type: 'RUN_STARTED',
        runId,
        model,
        timestamp,
      })
    }
  }

  for await (const event of stream) {
    logger.provider(`provider=gemini-text-interactions`, { event })
    switch (event.event_type) {
      case 'interaction.start': {
        interactionId = event.interaction.id
        yield* emitRunStartedIfNeeded()
        break
      }

      case 'content.start': {
        yield* emitRunStartedIfNeeded()
        break
      }

      case 'content.delta': {
        yield* emitRunStartedIfNeeded()
        const delta = event.delta
        switch (delta.type) {
          case 'text': {
            yield* closeReasoningIfNeeded()
            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield asChunk({
                type: 'TEXT_MESSAGE_START',
                messageId,
                model,
                timestamp,
                role: 'assistant',
              })
            }
            textAccumulated += delta.text
            yield asChunk({
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              model,
              timestamp,
              delta: delta.text,
              content: textAccumulated,
            })
            break
          }
          case 'function_call': {
            yield* closeReasoningIfNeeded()
            sawFunctionCall = true
            const toolCallId = delta.id
            const deltaArgs: Record<string, unknown> =
              typeof delta.arguments === 'string'
                ? safeParseToolArguments(delta.arguments)
                : delta.arguments
            let state = toolCalls.get(toolCallId)
            if (!state) {
              state = {
                name: delta.name,
                args: JSON.stringify(deltaArgs),
                index: nextToolIndex++,
                started: false,
                ended: false,
              }
              toolCalls.set(toolCallId, state)
            } else {
              // Merge incremental fragments at the object level — the SDK
              // types args as an object per delta, so string concatenation
              // would produce invalid JSON.
              try {
                const existing = JSON.parse(state.args)
                state.args = JSON.stringify({
                  ...(existing && typeof existing === 'object' ? existing : {}),
                  ...deltaArgs,
                })
              } catch {
                state.args = JSON.stringify(deltaArgs)
              }
              if (delta.name) state.name = delta.name
            }
            if (!state.started) {
              state.started = true
              yield asChunk({
                type: 'TOOL_CALL_START',
                toolCallId,
                toolName: state.name,
                model,
                timestamp,
                index: state.index,
              })
            }
            yield asChunk({
              type: 'TOOL_CALL_ARGS',
              toolCallId,
              model,
              timestamp,
              delta: JSON.stringify(deltaArgs),
              args: state.args,
            })
            break
          }
          case 'google_search_call':
          case 'code_execution_call':
          case 'url_context_call':
          case 'file_search_call': {
            yield* closeReasoningIfNeeded()
            yield asChunk({
              type: 'CUSTOM',
              name: `gemini.${camelizeDeltaType(delta.type)}`,
              value: delta,
              model,
              timestamp,
            })
            break
          }
          case 'google_search_result':
          case 'code_execution_result':
          case 'url_context_result':
          case 'file_search_result': {
            yield* closeReasoningIfNeeded()
            yield asChunk({
              type: 'CUSTOM',
              name: `gemini.${camelizeDeltaType(delta.type)}`,
              value: delta,
              model,
              timestamp,
            })
            break
          }
          case 'thought_summary': {
            const thoughtText =
              delta.content && 'text' in delta.content ? delta.content.text : ''
            if (!thoughtText) break
            if (thinkingStepId === null) {
              thinkingStepId = generateId(adapterName)
              reasoningMessageId = generateId(adapterName)
              yield asChunk({
                type: 'REASONING_START',
                messageId: reasoningMessageId,
                model,
                timestamp,
              })
              yield asChunk({
                type: 'REASONING_MESSAGE_START',
                messageId: reasoningMessageId,
                role: 'reasoning',
                model,
                timestamp,
              })
              yield asChunk({
                type: 'STEP_STARTED',
                stepId: thinkingStepId,
                model,
                timestamp,
                stepType: 'thinking',
              })
            }
            thinkingAccumulated += thoughtText
            yield asChunk({
              type: 'REASONING_MESSAGE_CONTENT',
              messageId: reasoningMessageId!,
              delta: thoughtText,
              model,
              timestamp,
            })
            yield asChunk({
              type: 'STEP_FINISHED',
              stepId: thinkingStepId,
              model,
              timestamp,
              delta: thoughtText,
              content: thinkingAccumulated,
            })
            break
          }
          default:
            break
        }
        break
      }

      case 'content.stop':
      case 'interaction.status_update': {
        break
      }

      case 'interaction.complete': {
        if (event.interaction.id) {
          interactionId = event.interaction.id
        }

        yield* closeReasoningIfNeeded()

        for (const [toolCallId, state] of toolCalls) {
          if (state.ended) continue
          state.ended = true
          let parsedInput: unknown = {}
          try {
            const parsed = JSON.parse(state.args)
            parsedInput = parsed && typeof parsed === 'object' ? parsed : {}
          } catch {
            parsedInput = {}
          }
          yield asChunk({
            type: 'TOOL_CALL_END',
            toolCallId,
            toolName: state.name,
            model,
            timestamp,
            input: parsedInput,
          })
        }

        if (hasEmittedTextMessageStart) {
          yield asChunk({
            type: 'TEXT_MESSAGE_END',
            messageId,
            model,
            timestamp,
          })
        }

        const usage = event.interaction.usage
        const finishReason: 'tool_calls' | 'stop' = sawFunctionCall
          ? 'tool_calls'
          : 'stop'

        if (interactionId) {
          yield asChunk({
            type: 'CUSTOM',
            name: 'gemini.interactionId',
            value: { interactionId },
            model,
            timestamp,
          })
        }

        yield asChunk({
          type: 'RUN_FINISHED',
          runId,
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
        })
        break
      }

      case 'error': {
        const message = event.error?.message ?? 'Unknown error'
        const code = event.error?.code?.toString()
        yield asChunk({
          type: 'RUN_ERROR',
          runId,
          model,
          timestamp,
          message,
          code,
          error: { message, code },
        })
        return
      }

      default:
        break
    }
  }
}

function camelizeDeltaType(type: string): string {
  const [first, ...rest] = type.split('_')
  return (
    (first ?? '') +
    rest.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  )
}

function extractTextFromInteraction(interaction: Interaction): string {
  let text = ''
  for (const output of interaction.outputs ?? []) {
    if (output.type === 'text') {
      text += output.text
    }
  }
  return text
}
