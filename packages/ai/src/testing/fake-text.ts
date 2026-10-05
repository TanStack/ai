import { BaseTextAdapter } from '../activities/chat/adapter'
import { EventType } from '../types'
import type {
  StructuredOutputOptions,
  StructuredOutputResult,
} from '../activities/chat/adapter'
import type { AdapterYieldChunk } from '../utilities/adapter-yield-chunk'
import type {
  ContentPart,
  DefaultMessageMetadataByModality,
  Modality,
  ModelMessage,
  TextOptions,
  TokenUsage,
} from '../types'

/** One scripted answer of the fake model. */
export interface FakeResponse {
  /** The visible text. */
  text?: string
  /** Thinking text, streamed before the answer. */
  thinking?: string
  /**
   * Tool calls. `id` defaults to `fake-call-<fake>-<call>-<index>`, unique
   * across fakes.
   */
  toolCalls?: Array<{ name: string; input?: unknown; id?: string }>
  /** Default: `'tool_calls'` when there are tool calls, else `'stop'`. */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls'
  /** Fail the call with a `RUN_ERROR` that has this message. */
  error?: string
}

/** Counters of a fake adapter. */
export interface FakeTextState {
  /** How many model calls the fake answered. */
  callCount: number
}

/** A scripted answer, or a function that builds one from the request. */
export type FakeResponseStep =
  | FakeResponse
  | ((call: {
      request: TextOptions
      state: FakeTextState
    }) => FakeResponse | Promise<FakeResponse>)

export interface FakeTextOptions<
  TModel extends string,
  TInput extends ReadonlyArray<Modality>,
> {
  /** The model id. Default `'fake-model'`. */
  model?: TModel
  /** The input kinds the model reads. Sets the adapter's `inputModalities`. */
  input?: TInput
  /** The model's context window in tokens. Data for the caller. */
  contextWindow?: number
  /** Stream the text at this many tokens (4 characters each) per second. */
  tokensPerSecond?: number
  /**
   * Estimate prompt caching per `threadId`: the part of the request that
   * matches the thread's previous request counts as cached.
   */
  cache?: boolean
}

const EMPTY_QUEUE = 'No more fake responses queued'
const CHARS_PER_TOKEN = 4

/**
 * Numbers each fake, so two fakes in one process (for example two hosts in a
 * restart test) never give the same tool-call id.
 */
let fakeCount = 0

function estimateTokens(text: string) {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

function partText(part: ContentPart) {
  if (part.type === 'text') return part.content
  const source = part.source
  const mime = 'mimeType' in source ? source.mimeType : 'unknown'
  return `[${part.type}:${mime}:${source.value.length}]`
}

function messageText(message: ModelMessage) {
  const content =
    typeof message.content === 'string'
      ? message.content
      : (message.content ?? []).map(partText).join('')
  const calls = (message.toolCalls ?? []).map(
    (call) => `${call.function.name}:${call.function.arguments}`,
  )
  return [`${message.role}:${content}`, ...calls].join('\n')
}

/** pi's serialized request form: the system prompts, then `role:text` per message. */
function serializeRequest(request: TextOptions) {
  const system = (request.systemPrompts ?? []).map(
    (prompt) =>
      `system:${typeof prompt === 'string' ? prompt : prompt.content}`,
  )
  return [...system, ...request.messages.map(messageText)].join('\n')
}

function serializeResponse(response: FakeResponse) {
  const calls = (response.toolCalls ?? []).map(
    (call) => `${call.name}:${JSON.stringify(call.input ?? {})}`,
  )
  return [response.thinking ?? '', response.text ?? '', ...calls]
    .filter((part) => part !== '')
    .join('\n')
}

function commonPrefixLength(a: string, b: string) {
  const max = Math.min(a.length, b.length)
  let index = 0
  while (index < max && a[index] === b[index]) index++
  return index
}

function chunksOf(text: string) {
  const chunks: Array<string> = []
  for (let index = 0; index < text.length; index += CHARS_PER_TOKEN) {
    chunks.push(text.slice(index, index + CHARS_PER_TOKEN))
  }
  return chunks
}

/**
 * A text adapter that answers from a script. Use it to test `chat()`, tools,
 * and middleware with no network and no API key. Create it with `fakeText()`.
 */
export class FakeTextAdapter<
  TModel extends string,
  TInput extends ReadonlyArray<Modality>,
> extends BaseTextAdapter<
  TModel,
  Record<string, unknown>,
  TInput,
  DefaultMessageMetadataByModality
> {
  readonly name = 'fake'
  // Optional, as on `TextAdapter`, so the fake is an adapter under
  // `exactOptionalPropertyTypes` too.
  declare readonly inputModalities?: ReadonlyArray<Modality>
  /** The context window from the options. */
  readonly contextWindow: number | undefined
  readonly state: FakeTextState = { callCount: 0 }

  private queue: Array<FakeResponseStep> = []
  private readonly previousRequests = new Map<string, string>()
  private readonly options: FakeTextOptions<TModel, TInput>
  private readonly instance = ++fakeCount

  constructor(model: TModel, options: FakeTextOptions<TModel, TInput>) {
    super({}, model)
    this.options = options
    if (options.input) this.inputModalities = options.input
    this.contextWindow = options.contextWindow
  }

  /** Replace the queue of answers. */
  setResponses(responses: Array<FakeResponseStep>) {
    this.queue = [...responses]
  }

  /** Add answers to the end of the queue. */
  appendResponses(responses: Array<FakeResponseStep>) {
    this.queue.push(...responses)
  }

  /** How many answers are still queued. */
  pendingResponses() {
    return this.queue.length
  }

  private async nextResponse(request: TextOptions) {
    const step = this.queue.shift()
    this.state.callCount++
    if (step === undefined) return { error: EMPTY_QUEUE }
    return typeof step === 'function'
      ? await step({ request, state: this.state })
      : step
  }

  private usage(request: TextOptions, response: FakeResponse) {
    const serialized = serializeRequest(request)
    const promptTokens = estimateTokens(serialized)
    const completionTokens = estimateTokens(serializeResponse(response))
    const usage: TokenUsage = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    }
    const thread = request.threadId
    if (!this.options.cache || thread === undefined) return usage
    const previous = this.previousRequests.get(thread) ?? ''
    this.previousRequests.set(thread, serialized)
    const cachedTokens = Math.floor(
      commonPrefixLength(previous, serialized) / CHARS_PER_TOKEN,
    )
    return {
      ...usage,
      promptTokensDetails: {
        cachedTokens,
        cacheWriteTokens: promptTokens - cachedTokens,
      },
    }
  }

  private async pace(signal: AbortSignal | undefined) {
    const perSecond = this.options.tokensPerSecond
    if (!perSecond) return !signal?.aborted
    await new Promise((resolve) => setTimeout(resolve, 1000 / perSecond))
    return !signal?.aborted
  }

  async *chatStream(options: TextOptions): AsyncIterable<AdapterYieldChunk> {
    const signal = options.abortController?.signal
    const runId = options.runId ?? `fake-run-${this.state.callCount + 1}`
    const threadId = options.threadId ?? 'fake-thread'
    const model = this.model
    const response = await this.nextResponse(options)
    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      model,
      timestamp: Date.now(),
      // As real adapters do: a continuation links to the run it resumes.
      ...(options.parentRunId ? { parentRunId: options.parentRunId } : {}),
    }
    if (response.error !== undefined) {
      yield {
        type: EventType.RUN_ERROR,
        model,
        timestamp: Date.now(),
        message: response.error,
        error: { message: response.error },
      }
      return
    }

    if (response.thinking) {
      const messageId = `${runId}-thinking`
      yield {
        type: EventType.REASONING_START,
        messageId,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.REASONING_MESSAGE_START,
        messageId,
        role: 'reasoning',
        timestamp: Date.now(),
      }
      for (const delta of chunksOf(response.thinking)) {
        if (!(await this.pace(signal))) return
        yield {
          type: EventType.REASONING_MESSAGE_CONTENT,
          messageId,
          delta,
          timestamp: Date.now(),
        }
      }
      yield {
        type: EventType.REASONING_MESSAGE_END,
        messageId,
        timestamp: Date.now(),
      }
      yield { type: EventType.REASONING_END, messageId, timestamp: Date.now() }
    }

    if (response.text) {
      const messageId = `${runId}-text`
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        model,
        timestamp: Date.now(),
      }
      for (const delta of chunksOf(response.text)) {
        if (!(await this.pace(signal))) return
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta,
          model,
          timestamp: Date.now(),
        }
      }
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        model,
        timestamp: Date.now(),
      }
    }

    const toolCalls = response.toolCalls ?? []
    for (const [index, call] of toolCalls.entries()) {
      const toolCallId =
        call.id ??
        `fake-call-${this.instance}-${this.state.callCount}-${index}`
      yield {
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: call.name,
        toolName: call.name,
        model,
        timestamp: Date.now(),
        index,
      }
      yield {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId,
        delta: JSON.stringify(call.input ?? {}),
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TOOL_CALL_END,
        toolCallId,
        model,
        timestamp: Date.now(),
      }
    }

    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      model,
      timestamp: Date.now(),
      finishReason:
        response.finishReason ?? (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
      usage: this.usage(options, response),
    }
  }

  /** Answers with the next queued response. Its `text` must be JSON. */
  async structuredOutput(
    options: StructuredOutputOptions<Record<string, unknown>>,
  ): Promise<StructuredOutputResult<unknown>> {
    const response = await this.nextResponse(options.chatOptions)
    if (response.error !== undefined) throw new Error(response.error)
    const rawText = response.text ?? ''
    return {
      data: JSON.parse(rawText),
      rawText,
      usage: this.usage(options.chatOptions, response),
    }
  }
}

/**
 * Create a scripted fake text adapter for tests. Queue answers with
 * `setResponses`, then pass the fake to `chat()` as its adapter.
 *
 * - An empty queue answers with a `RUN_ERROR`: "No more fake responses queued".
 * - Usage is estimated as `ceil(characters / 4)` over the request and the
 *   answer, so a long message can overflow a small `contextWindow`.
 *
 * @example
 * ```ts
 * const fake = fakeText()
 * fake.setResponses([{ text: 'Hello' }])
 * for await (const chunk of chat({ adapter: fake, messages })) {
 *   // ...
 * }
 * ```
 */
export function fakeText<
  const TModel extends string = 'fake-model',
  const TInput extends ReadonlyArray<Modality> = ReadonlyArray<Modality>,
>(options: FakeTextOptions<TModel, TInput> = {}) {
  const model = options.model ?? 'fake-model'
  // `options.model` is `TModel` when set. The default only applies when the
  // caller left it out, and then `TModel` is the default `'fake-model'`.
  return new FakeTextAdapter(model as TModel, options)
}
