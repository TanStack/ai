import { EventType } from '@ag-ui/core'
import { chatParamsFromRequestBody } from '../../utilities/chat-params.js'
import { toServerSentEventsResponse } from '../../stream-to-response.js'
import { toRunErrorPayload } from '../error-payload.js'
import {
  StandardSchemaValidationError,
  validateWithStandardSchema,
} from '../chat/tools/schema-converter.js'
import { TRANSACTION_EVENTS } from './types.js'
import type {
  AnyVerb,
  ChatVerb,
  ChatVerbReturn,
  ClientTransactionKinds,
  CollectedChatResult,
  OneShotVerb,
  TransactionChatRequest,
  TransactionConfig,
  TransactionDefinition,
  TransactionRunContext,
  VerbOptions,
  VerbRequest,
} from './types.js'
import type { InferSchemaType, SchemaInput, StreamChunk } from '../../types.js'

export type * from './types.js'
export { TRANSACTION_EVENTS } from './types.js'

/** Declare a conversational verb (full chat surface on the client). */
export function chatVerb<TRet extends ChatVerbReturn>(
  callback: (req: TransactionChatRequest) => TRet,
): ChatVerb<(req: TransactionChatRequest) => TRet> {
  return { kind: 'chat', callback }
}

/** Declare a one-shot verb: (optionally schema-validated) input in, result out. */
export function verb<
  TResult,
  const TSchema extends SchemaInput | undefined = undefined,
>(
  options: VerbOptions<TSchema, TResult>,
): OneShotVerb<
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
  TResult
> {
  return {
    kind: 'one-shot',
    ...(options.input !== undefined && { input: options.input }),
    execute: options.execute,
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value != null && typeof value === 'object' && Symbol.asyncIterator in value
  )
}

/**
 * An unbounded push channel bridging concurrently-running sub-verb streams
 * into the single response iterable. `push` after `close` is a no-op.
 */
function createChunkChannel(): {
  push: (chunk: StreamChunk) => void
  close: () => void
  [Symbol.asyncIterator]: () => AsyncIterator<StreamChunk>
} {
  const queue: Array<StreamChunk> = []
  let notify: (() => void) | null = null
  let closed = false

  return {
    push(chunk: StreamChunk) {
      if (closed) return
      queue.push(chunk)
      notify?.()
    },
    close() {
      closed = true
      notify?.()
    },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<StreamChunk>> {
          for (;;) {
            const chunk = queue.shift()
            if (chunk !== undefined) return { value: chunk, done: false }
            if (closed) return { value: undefined, done: true }
            await new Promise<void>((resolve) => {
              notify = resolve
            })
            notify = null
          }
        },
      }
    },
  }
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
  aguiContext: TransactionChatRequest['aguiContext']
  forwardedProps: Record<string, unknown>
}

/**
 * Define a server-side transaction endpoint: a registry of app-named verbs
 * exposing a single request `handler`. Inert — no adapters, connections, or
 * other resources are constructed until a request actually arrives.
 *
 * Routing: the client tags each request with a `verb` discriminator in
 * `forwardedProps`. Chat verbs speak the conversational AG-UI protocol;
 * one-shot verbs receive validated input and may compose sibling verbs via
 * `ctx.call`, which streams each sub-run back to the client tagged with
 * {@link TRANSACTION_EVENTS} custom events — one request, one abort scope.
 */
export function defineTransaction<const T extends TransactionConfig>(
  config: T,
): TransactionDefinition<T> {
  const verbs = Object.keys(config) as Array<keyof T & string>
  const verbKinds = Object.fromEntries(
    Object.entries(config).map(([name, v]) => [name, v.kind]),
  ) as Record<string, AnyVerb['kind']>

  const verbNameOf = (v: AnyVerb): string =>
    verbs.find((name) => config[name] === v) ?? 'verb'

  const handler = async (request: Request): Promise<Response> => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return new Response('Invalid JSON body', { status: 400 })
    }

    // Both verb kinds ride the AG-UI envelope; reject malformed bodies with
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

    const verbName = params.forwardedProps.verb
    // Route on OWN, DECLARED verb names only — `verbs` comes from
    // `Object.keys(config)`, which excludes inherited `Object.prototype`
    // members (`toString`, `constructor`, ...) that a bare `in` check would
    // otherwise treat as callable verbs.
    const declared =
      typeof verbName === 'string' &&
      (verbs as Array<string>).includes(verbName)
    // `Reflect.get` returns `any`; this is a single narrowing cast.
    const target =
      declared && typeof verbName === 'string'
        ? (Reflect.get(config, verbName) as AnyVerb | undefined)
        : undefined
    if (!target) {
      return new Response(`Unknown transaction verb: ${String(verbName)}`, {
        status: 400,
      })
    }

    const envelope: RunEnvelope = {
      threadId: params.threadId,
      runId: params.runId,
      ...(params.parentRunId !== undefined && {
        parentRunId: params.parentRunId,
      }),
      state: params.state,
      aguiContext: params.aguiContext,
      forwardedProps: params.forwardedProps,
    }

    if (target.kind === 'chat') {
      const chatReq: TransactionChatRequest = {
        messages: params.messages,
        tools: params.tools,
        ...envelope,
        request,
      }
      const result = target.callback(chatReq)
      if (!isAsyncIterable(result)) {
        return new Response(
          'transaction chat verb must return a streaming ChatStream',
          { status: 400 },
        )
      }
      return toServerSentEventsResponse(result as AsyncIterable<any>)
    }

    // One-shot verb: input = the forwarded props minus the routing
    // discriminator, validated against the verb's schema when declared.
    const { verb: _omit, ...rawInput } = params.forwardedProps
    const validation = await validateWithStandardSchema(target.input, rawInput)
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: 'Invalid verb input',
          verb: verbName,
          issues: validation.issues,
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    return toServerSentEventsResponse(
      runVerbStream(target, validation.data, envelope, request, verbNameOf),
    )
  }

  return { verbs, verbKinds, handler, '~verbs': config }
}

/**
 * Build a type-only client stub for a server-side {@link defineTransaction}
 * definition. The browser only needs verb names and kinds at runtime; input,
 * result, tool, and schema types flow from `TDef` via `import type`.
 *
 * @example
 * ```ts
 * import { clientTransaction } from '@tanstack/ai/transaction'
 *
 * // `blogTransaction` is your server-side defineTransaction() export.
 * const txnDef = clientTransaction<typeof blogTransaction>({
 *   drafting: 'chat',
 *   heroImage: 'one-shot',
 *   narration: 'one-shot',
 *   blogPost: 'one-shot',
 * })
 * ```
 */
export function clientTransaction<TDef extends TransactionDefinition<any>>(
  kinds: ClientTransactionKinds<TDef>,
): TDef {
  const verbs = Object.keys(kinds) as Array<keyof TDef['~verbs'] & string>
  const stub = {
    verbs,
    verbKinds: kinds,
    handler: async () => {
      throw new Error(
        'clientTransaction definitions are type-only stubs and must not handle requests in the browser. Route requests to the server transaction handler.',
      )
    },
    '~verbs': {} as TDef['~verbs'],
  }
  // Type-only stub: runtime value carries verb names/kinds; `~verbs` phantom
  // comes from the generic `TDef` supplied by the caller.
  // eslint-disable-next-line no-restricted-syntax -- phantom-only cast, see comment above
  return stub as unknown as TDef
}

/**
 * Run a one-shot verb as the root of a (possibly multi-sub-run) transaction
 * stream: RUN_STARTED, live sub-run events from `ctx.call`, the verb's own
 * `generation:result`, RUN_FINISHED — or RUN_ERROR on failure.
 */
async function* runVerbStream(
  target: OneShotVerb<any, any>,
  input: unknown,
  envelope: RunEnvelope,
  request: Request,
  verbNameOf: (v: AnyVerb) => string,
): AsyncIterable<StreamChunk> {
  const { threadId, runId } = envelope
  const channel = createChunkChannel()
  let subIndex = 0

  const call = async (subVerb: AnyVerb, subInput: unknown): Promise<any> => {
    request.signal.throwIfAborted()
    const index = subIndex++
    const subRunId = `${runId}-sub-${index}`
    const verbName = verbNameOf(subVerb)
    const tag = { runId: subRunId, parentRunId: runId, verb: verbName, index }
    channel.push(customEvent(TRANSACTION_EVENTS.SUB_RUN_STARTED, tag))
    try {
      let result: unknown
      if (subVerb.kind === 'chat') {
        result = await collectChatSubRun(
          subVerb,
          subInput as TransactionChatRequest['messages'],
          { ...envelope, runId: subRunId, parentRunId: runId },
          request,
          (chunk) =>
            channel.push(
              customEvent(TRANSACTION_EVENTS.SUB_RUN_CHUNK, { ...tag, chunk }),
            ),
        )
      } else {
        const validation = await validateWithStandardSchema(
          subVerb.input,
          subInput,
        )
        if (!validation.success) {
          throw new StandardSchemaValidationError(
            validation.issues.map((issue) => ({ message: issue.message })),
          )
        }
        const subReq: VerbRequest = {
          input: validation.data,
          threadId,
          runId: subRunId,
          parentRunId: runId,
          state: envelope.state,
          aguiContext: envelope.aguiContext,
          forwardedProps: envelope.forwardedProps,
          request,
          signal: request.signal,
        }
        const out = subVerb.execute(subReq, ctx)
        result = isAsyncIterable(out)
          ? await forwardAndExtractResult(out, (chunk) =>
              channel.push(
                customEvent(TRANSACTION_EVENTS.SUB_RUN_CHUNK, {
                  ...tag,
                  chunk,
                }),
              ),
            )
          : await out
      }
      channel.push(
        customEvent(TRANSACTION_EVENTS.SUB_RUN_RESULT, { ...tag, result }),
      )
      return result
    } catch (error) {
      channel.push(
        customEvent(TRANSACTION_EVENTS.SUB_RUN_ERROR, {
          ...tag,
          message: error instanceof Error ? error.message : String(error),
        }),
      )
      throw error
    }
  }

  const ctx: TransactionRunContext = {
    call: call as TransactionRunContext['call'],
    signal: request.signal,
  }

  const req: VerbRequest = {
    input,
    ...envelope,
    request,
    signal: request.signal,
  }

  const out = target.execute(req, ctx)

  // Escape hatch: an execute returning a raw StreamChunk iterable (e.g. a
  // `stream: true` activity) is forwarded as-is. `ctx.call` is unavailable
  // on this path — nothing drains the channel.
  if (isAsyncIterable(out)) {
    channel.close()
    yield* out
    return
  }

  yield {
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  }

  const execution = out.then(
    (result) => ({ ok: true as const, result }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  void execution.finally(() => channel.close())

  for await (const chunk of channel) {
    yield chunk
  }

  const outcome = await execution
  if (outcome.ok) {
    yield customEvent('generation:result', outcome.result)
    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: 'stop',
      timestamp: Date.now(),
    }
  } else {
    const payload = toRunErrorPayload(outcome.error, 'Transaction failed')
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

/**
 * Run a chat verb's callback to completion server-side, forwarding every
 * chunk to the transaction stream and collecting the accumulated text plus
 * the structured output (from the `structured-output.complete` event).
 */
async function collectChatSubRun(
  target: ChatVerb<any>,
  messages: TransactionChatRequest['messages'],
  envelope: RunEnvelope,
  request: Request,
  forward: (chunk: unknown) => void,
): Promise<CollectedChatResult> {
  const stream = target.callback({
    messages,
    tools: [],
    ...envelope,
    request,
  })
  if (!isAsyncIterable(stream)) {
    throw new Error('transaction chat verb must return a streaming ChatStream')
  }
  let text = ''
  let structured: unknown = null
  for await (const chunk of stream as AsyncIterable<any>) {
    request.signal.throwIfAborted()
    forward(chunk)
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) {
      text += typeof chunk.delta === 'string' ? chunk.delta : ''
    } else if (
      chunk.type === EventType.CUSTOM &&
      chunk.name === 'structured-output.complete'
    ) {
      structured = chunk.value?.object ?? null
    }
  }
  return { text, structured }
}

/**
 * Forward a streaming sub-verb's chunks and recover its result from the
 * terminal `generation:result` CUSTOM event.
 */
async function forwardAndExtractResult(
  stream: AsyncIterable<StreamChunk>,
  forward: (chunk: unknown) => void,
): Promise<unknown> {
  let result: unknown = null
  for await (const chunk of stream as AsyncIterable<any>) {
    forward(chunk)
    if (chunk.type === EventType.CUSTOM && chunk.name === 'generation:result') {
      result = chunk.value
    }
  }
  return result
}
