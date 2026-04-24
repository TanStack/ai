import { BaseTextAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
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
 * `interactionId` on `RUN_FINISHED.providerMetadata`; pass it back on the
 * next turn via `modelOptions.previous_interaction_id` to continue the
 * conversation without resending history. Text output + function tools
 * only.
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

    try {
      const request = buildInteractionsRequest(options)
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
      )
    } catch (error) {
      yield {
        type: 'RUN_ERROR',
        runId,
        model: options.model,
        timestamp,
        error: {
          message:
            error instanceof Error
              ? error.message
              : 'An unknown error occurred during the interactions stream.',
        },
      }
    }
  }

  async structuredOutput(
    options: StructuredOutputOptions<GeminiTextInteractionsProviderOptions>,
  ): Promise<StructuredOutputResult<unknown>> {
    const { chatOptions, outputSchema } = options
    const baseRequest = buildInteractionsRequest(chatOptions)

    const request = {
      ...baseRequest,
      response_mime_type: 'application/json',
      response_format: outputSchema,
    }

    try {
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

// When `hasPreviousInteraction` is true the server holds the transcript;
// per Google's Interactions docs we send only the latest user turn. Otherwise
// we send the full conversation as `Turn[]`.
function convertMessagesToInteractionsInput(
  messages: Array<ModelMessage>,
  hasPreviousInteraction: boolean,
): Array<TurnInput> {
  if (hasPreviousInteraction) {
    const latest = findLatestUserTurn(messages)
    return latest ? [latest] : []
  }

  const toolCallIdToName = new Map<string, string>()
  const turns: Array<TurnInput> = []

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        toolCallIdToName.set(tc.id, tc.function.name)
      }
    }
    const turn = messageToTurn(msg, toolCallIdToName)
    if (turn) turns.push(turn)
  }

  return turns
}

function findLatestUserTurn(
  messages: Array<ModelMessage>,
): TurnInput | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role === 'user') {
      return messageToTurn(msg, new Map())
    }
  }
  return undefined
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
        arguments: toolCall.function.arguments
          ? JSON.parse(toolCall.function.arguments)
          : {},
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

// Built-in Gemini tools use a snake_case shape that differs from what the
// generateContent converter emits — reject them with a clear error rather
// than silently producing an invalid request.
function convertToolsToInteractionsFormat<TTool extends Tool>(
  tools: Array<TTool> | undefined,
): Array<InteractionsTool> | undefined {
  if (!tools || tools.length === 0) return undefined

  const result: Array<InteractionsTool> = []

  for (const tool of tools) {
    switch (tool.name) {
      case 'code_execution':
      case 'google_search':
      case 'google_search_retrieval':
      case 'google_maps':
      case 'url_context':
      case 'file_search':
      case 'computer_use':
        throw new Error(
          `Tool "${tool.name}" is a built-in Gemini tool and is not yet supported via the Interactions API adapter. Use geminiText() for built-in tools, or use function tools with geminiTextInteractions().`,
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

  const emitRunStartedIfNeeded = function* (): Generator<StreamChunk> {
    if (!hasEmittedRunStarted) {
      hasEmittedRunStarted = true
      yield {
        type: 'RUN_STARTED',
        runId,
        model,
        timestamp,
      }
    }
  }

  for await (const event of stream) {
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
            if (!hasEmittedTextMessageStart) {
              hasEmittedTextMessageStart = true
              yield {
                type: 'TEXT_MESSAGE_START',
                messageId,
                model,
                timestamp,
                role: 'assistant',
              }
            }
            textAccumulated += delta.text
            yield {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId,
              model,
              timestamp,
              delta: delta.text,
              content: textAccumulated,
            }
            break
          }
          case 'function_call': {
            sawFunctionCall = true
            const toolCallId = delta.id
            const argsString =
              typeof delta.arguments === 'string'
                ? delta.arguments
                : JSON.stringify(delta.arguments)
            let state = toolCalls.get(toolCallId)
            if (!state) {
              state = {
                name: delta.name,
                args: argsString,
                index: nextToolIndex++,
                started: false,
                ended: false,
              }
              toolCalls.set(toolCallId, state)
            } else {
              state.args = argsString
              if (delta.name) state.name = delta.name
            }
            if (!state.started) {
              state.started = true
              yield {
                type: 'TOOL_CALL_START',
                toolCallId,
                toolName: state.name,
                model,
                timestamp,
                index: state.index,
              }
            }
            yield {
              type: 'TOOL_CALL_ARGS',
              toolCallId,
              model,
              timestamp,
              delta: argsString,
              args: argsString,
            }
            break
          }
          case 'thought_summary': {
            const thoughtText =
              delta.content && 'text' in delta.content ? delta.content.text : ''
            if (!thoughtText) break
            if (thinkingStepId === null) {
              thinkingStepId = generateId(adapterName)
              yield {
                type: 'STEP_STARTED',
                stepId: thinkingStepId,
                model,
                timestamp,
                stepType: 'thinking',
              }
            }
            thinkingAccumulated += thoughtText
            yield {
              type: 'STEP_FINISHED',
              stepId: thinkingStepId,
              model,
              timestamp,
              delta: thoughtText,
              content: thinkingAccumulated,
            }
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
          yield {
            type: 'TOOL_CALL_END',
            toolCallId,
            toolName: state.name,
            model,
            timestamp,
            input: parsedInput,
          }
        }

        if (hasEmittedTextMessageStart) {
          yield {
            type: 'TEXT_MESSAGE_END',
            messageId,
            model,
            timestamp,
          }
        }

        const usage = event.interaction.usage
        const finishReason: 'tool_calls' | 'stop' = sawFunctionCall
          ? 'tool_calls'
          : 'stop'

        yield {
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
          ...(interactionId ? { providerMetadata: { interactionId } } : {}),
        }
        break
      }

      case 'error': {
        yield {
          type: 'RUN_ERROR',
          runId,
          model,
          timestamp,
          error: {
            message: event.error?.message ?? 'Unknown error',
            code: event.error?.code?.toString(),
          },
        }
        break
      }

      default:
        break
    }
  }
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
