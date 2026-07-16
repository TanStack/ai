import { EventType } from '@ag-ui/core'
import {
  chatParamsFromRequestBody,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import {
  toRunErrorPayload,
  validateWithStandardSchema,
} from '@tanstack/ai/adapter-internals'
import type {
  AnyPlugin,
  ChatPlugin,
  ChatPluginRequest,
  ChatPluginReturn,
  CollectedChatResult,
  GenerationPlugin,
  GenerationPluginExecute,
  GenerationPluginOptions,
  GenerationPluginRequest,
  PluginConfig,
  PluginDefinition,
  PluginRunOptions,
} from './types.js'
import type {
  InferSchemaType,
  ModelMessage,
  SchemaInput,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai'

export type * from './types.js'
export {
  audioPlugin,
  imagePlugin,
  speechPlugin,
  summarizePlugin,
  transcriptionPlugin,
  videoPlugin,
} from './media.js'
export type {
  AudioPluginInput,
  ImagePluginInput,
  MaybeStream,
  SpeechPluginInput,
  SummarizePluginInput,
  TranscriptionPluginInput,
  VideoPluginInput,
} from './media.js'

/** Declare a conversational plugin (full chat surface on the client). */
export function chatPlugin<TRet extends ChatPluginReturn>(
  callback: (req: ChatPluginRequest) => TRet,
): ChatPlugin<(req: ChatPluginRequest) => TRet> {
  const run = (async (arg: unknown, options?: PluginRunOptions) => {
    const normalized = await normalizeRunArg(arg, options)
    const messages = normalized.params
      ? normalized.params.messages
      : (normalized.rawMessages ?? [])
    const tools = normalized.params ? normalized.params.tools : []
    const envelope = buildEnvelope(normalized.params, options)
    const req = buildChatRequest(messages, tools, envelope, normalized.request)
    const result = callback(req)
    if (!isAsyncIterable(result)) {
      throw new Error('chat plugin must return a streaming ChatStream')
    }
    return collectChatStream(result)
  }) as ChatPlugin<(req: ChatPluginRequest) => TRet>['run']
  return { kind: 'chat', callback, run }
}

/** Declare a one-shot plugin: (optionally schema-validated) input in, result out. */
export function generationPlugin<
  TResult,
  const TSchema extends SchemaInput | undefined = undefined,
>(
  options: GenerationPluginOptions<TSchema, TResult>,
): GenerationPlugin<
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
  TResult
> {
  const schema = options.input
  const execute = options.execute as GenerationPluginExecute<unknown, TResult>
  const run = (async (arg: unknown, runOptions?: PluginRunOptions) => {
    const normalized = await normalizeRunArg(arg, runOptions)
    const rawInput = normalized.params
      ? stripPluginDiscriminator(normalized.params.forwardedProps)
      : normalized.rawInput
    const validation = await validateWithStandardSchema(schema, rawInput)
    if (!validation.success) {
      throw new Error(
        `Invalid plugin input: ${JSON.stringify(validation.issues)}`,
      )
    }
    const envelope = buildEnvelope(normalized.params, runOptions)
    const req = buildGenerationRequest(
      validation.data,
      envelope,
      normalized.request,
      runOptions?.signal ?? normalized.request.signal,
    )
    const out = execute(req)
    return isAsyncIterable(out) ? extractGenerationResult(out) : await out
  }) as GenerationPlugin<
    TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
    TResult
  >['run']
  return {
    kind: 'one-shot',
    ...(schema !== undefined && { input: schema }),
    execute: options.execute,
    run,
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null && typeof value === 'object' && Symbol.asyncIterator in value
  )
}

function customEvent(name: string, value: unknown): StreamChunk {
  return {
    type: EventType.CUSTOM,
    name,
    value,
    timestamp: Date.now(),
  }
}

interface RunEnvelope {
  threadId: string
  runId: string
  parentRunId?: string
  state: unknown
  aguiContext: ChatPluginRequest['aguiContext']
  forwardedProps: Record<string, unknown>
}

type ParsedParams = Awaited<ReturnType<typeof chatParamsFromRequestBody>>

/** The synthetic request used when `.run()` is called without a real one. */
const SYNTHETIC_RUN_URL = 'http://plugin.local/run'

/** Drop the `plugin` routing discriminator, leaving the plugin's own input. */
function stripPluginDiscriminator(
  forwardedProps: Record<string, unknown>,
): Record<string, unknown> {
  const { plugin: _omit, ...rest } = forwardedProps
  return rest
}

interface NormalizedRunArg {
  /** The `Request` exposed to the plugin (real for form 1, synthetic otherwise). */
  request: Request
  /** Parsed AG-UI params, present for the `Request` and body forms. */
  params?: ParsedParams
  /** Raw chat messages (form 3: an array argument). */
  rawMessages?: Array<UIMessage | ModelMessage>
  /** Raw generation input (form 3: a non-array, non-body argument). */
  rawInput?: unknown
}

/** An object carries AG-UI envelope markers → treat it as a request body. */
function isBodyLike(value: object): boolean {
  return 'forwardedProps' in value || ('messages' in value && 'runId' in value)
}

/**
 * Normalize any of the three `.run()` input forms to a common shape:
 * - `Request` → read + parse its JSON body through `chatParamsFromRequestBody`.
 * - `Array` → raw chat messages.
 * - object with AG-UI markers → parse as a request body.
 * - anything else → raw generation input.
 */
async function normalizeRunArg(
  arg: unknown,
  options?: PluginRunOptions,
): Promise<NormalizedRunArg> {
  if (arg instanceof Request) {
    const body = await arg.json()
    const params = await chatParamsFromRequestBody(body)
    return { request: arg, params }
  }
  const request = options?.request ?? new Request(SYNTHETIC_RUN_URL)
  if (Array.isArray(arg)) {
    return { request, rawMessages: arg as Array<UIMessage | ModelMessage> }
  }
  if (typeof arg === 'object' && arg !== null && isBodyLike(arg)) {
    const params = await chatParamsFromRequestBody(arg)
    return { request, params }
  }
  return { request, rawInput: arg }
}

/**
 * Build the run envelope. When a parsed body is present its fields are used
 * verbatim (so the handler's SSE output is unchanged); otherwise `options`
 * overrides win over synthetic defaults (`crypto.randomUUID()` ids,
 * `state: null`, empty `aguiContext`/`forwardedProps`).
 */
function buildEnvelope(
  source: ParsedParams | undefined,
  options?: PluginRunOptions,
): RunEnvelope {
  if (source) {
    return {
      threadId: source.threadId,
      runId: source.runId,
      ...(source.parentRunId !== undefined && {
        parentRunId: source.parentRunId,
      }),
      state: source.state,
      aguiContext: source.aguiContext,
      forwardedProps: source.forwardedProps,
    }
  }
  const parentRunId = options?.parentRunId
  return {
    threadId: options?.threadId ?? crypto.randomUUID(),
    runId: options?.runId ?? crypto.randomUUID(),
    ...(parentRunId !== undefined && { parentRunId }),
    state: options?.state ?? null,
    aguiContext: options?.aguiContext ?? [],
    forwardedProps: options?.forwardedProps ?? {},
  }
}

/** Assemble a one-shot plugin request from validated input + envelope. */
function buildGenerationRequest(
  input: unknown,
  envelope: RunEnvelope,
  request: Request,
  signal: AbortSignal = request.signal,
): GenerationPluginRequest {
  return {
    input,
    ...envelope,
    request,
    signal,
  }
}

/** Assemble a chat plugin request from messages/tools + envelope. */
function buildChatRequest(
  messages: ChatPluginRequest['messages'],
  tools: ChatPluginRequest['tools'],
  envelope: RunEnvelope,
  request: Request,
): ChatPluginRequest {
  return { messages, tools, ...envelope, request }
}

/** Drain a one-shot stream and return the terminal `generation:result` value. */
async function extractGenerationResult(
  stream: AsyncIterable<StreamChunk>,
): Promise<unknown> {
  let result: unknown
  for await (const chunk of stream) {
    if (chunk.type === EventType.CUSTOM && chunk.name === 'generation:result') {
      result = chunk.value
    }
  }
  return result
}

/**
 * Collect a chat stream into `{ text, structured }`. `text` accumulates the
 * `TEXT_MESSAGE_CONTENT` deltas; `structured` is the terminal
 * `structured-output.complete` event's `value.object` (else `null`).
 */
async function collectChatStream(
  stream: AsyncIterable<StreamChunk>,
): Promise<CollectedChatResult> {
  let text = ''
  let structured: unknown = null
  for await (const chunk of stream) {
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
      const { delta } = chunk
      if (typeof delta === 'string') text += delta
    } else if (
      chunk.type === EventType.CUSTOM &&
      chunk.name === 'structured-output.complete'
    ) {
      const value = chunk.value
      if (value !== null && typeof value === 'object' && 'object' in value) {
        structured = (value as { object: unknown }).object
      }
    }
  }
  return { text, structured }
}

/**
 * Define a server-side plugin endpoint: a registry of app-named plugins
 * exposing a single request `handler`. Inert — no adapters, connections, or
 * other resources are constructed until a request actually arrives.
 *
 * Routing: the client tags each request with a `plugin` discriminator in
 * `forwardedProps`. Chat plugins speak the conversational AG-UI protocol;
 * one-shot plugins receive validated input and return a result (or stream)
 * for the response — one request, one abort scope.
 */
export function definePlugin<const T extends PluginConfig>(
  config: T,
): PluginDefinition<T> {
  const plugins = Object.keys(config) as Array<keyof T & string>
  const pluginKinds = Object.fromEntries(
    Object.entries(config).map(([name, p]) => [name, p.kind]),
  ) as Record<string, AnyPlugin['kind']>

  const handler = async (request: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new Response('Invalid JSON body', { status: 400 })
    }

    // Both plugin kinds ride the AG-UI envelope; reject malformed bodies with
    // a 400 (chatParamsFromRequestBody rejects with an AGUIError).
    let params: Awaited<ReturnType<typeof chatParamsFromRequestBody>>
    try {
      params = await chatParamsFromRequestBody(body)
    } catch (error) {
      if (error instanceof Response) return error
      return new Response(
        error instanceof Error ? error.message : 'Invalid request body',
        { status: 400 },
      )
    }

    const pluginName = params.forwardedProps.plugin
    // Route on OWN, DECLARED plugin names only — `plugins` comes from
    // `Object.keys(config)`, which excludes inherited `Object.prototype`
    // members (`toString`, `constructor`, ...) that a bare `in` check would
    // otherwise treat as callable plugins.
    const declared =
      typeof pluginName === 'string' &&
      (plugins as Array<string>).includes(pluginName)
    // `Reflect.get` returns `any`; this is a single narrowing cast.
    const target =
      declared && typeof pluginName === 'string'
        ? (Reflect.get(config, pluginName) as AnyPlugin | undefined)
        : undefined
    if (!target) {
      return new Response(`Unknown plugin: ${String(pluginName)}`, {
        status: 400,
      })
    }

    const envelope = buildEnvelope(params)

    if (target.kind === 'chat') {
      const chatReq = buildChatRequest(
        params.messages,
        params.tools,
        envelope,
        request,
      )
      const result = target.callback(chatReq)
      if (!isAsyncIterable(result)) {
        return new Response('chat plugin must return a streaming ChatStream', {
          status: 400,
        })
      }
      return toServerSentEventsResponse(result as AsyncIterable<any>)
    }

    // One-shot plugin: input = the forwarded props minus the routing
    // discriminator, validated against the plugin's schema when declared.
    const rawInput = stripPluginDiscriminator(params.forwardedProps)
    const validation = await validateWithStandardSchema(target.input, rawInput)
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: 'Invalid plugin input',
          plugin: pluginName,
          issues: validation.issues,
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    return toServerSentEventsResponse(
      runGenerationPluginStream(target, validation.data, envelope, request),
    )
  }

  return { plugins, pluginKinds, handler, '~plugins': config }
}

/**
 * Run a one-shot plugin to completion as a response stream: RUN_STARTED, the
 * plugin's own `generation:result`, RUN_FINISHED — or RUN_ERROR on failure.
 */
async function* runGenerationPluginStream(
  target: GenerationPlugin<any, any>,
  input: unknown,
  envelope: RunEnvelope,
  request: Request,
): AsyncIterable<StreamChunk> {
  const { threadId, runId } = envelope

  const req = buildGenerationRequest(input, envelope, request)

  const out = target.execute(req)

  // Escape hatch: an execute returning a raw StreamChunk iterable (e.g. a
  // `stream: true` activity) is forwarded as-is.
  if (isAsyncIterable(out)) {
    yield* out
    return
  }

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  }

  try {
    const result = await out
    yield customEvent('generation:result', result)
    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: 'stop',
      timestamp: Date.now(),
    }
  } catch (error) {
    const payload = toRunErrorPayload(error, 'Plugin failed')
    const codeFields =
      payload.code !== undefined ? { code: payload.code } : undefined
    yield {
      type: EventType.RUN_ERROR,
      message: payload.message,
      ...codeFields,
      error: { message: payload.message, ...codeFields },
      timestamp: Date.now(),
    }
  }
}
