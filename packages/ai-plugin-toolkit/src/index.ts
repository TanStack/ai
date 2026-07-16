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
  ChatPluginReturn,
  ChatPluginRequest,
  GenerationPlugin,
  GenerationPluginOptions,
  GenerationPluginRequest,
  PluginConfig,
  PluginDefinition,
} from './types.js'
import type { InferSchemaType, SchemaInput, StreamChunk } from '@tanstack/ai'

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
  return { kind: 'chat', callback }
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
      const chatReq: ChatPluginRequest = {
        messages: params.messages,
        tools: params.tools,
        ...envelope,
        request,
      }
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
    const { plugin: _omit, ...rawInput } = params.forwardedProps
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

  const req: GenerationPluginRequest = {
    input,
    ...envelope,
    request,
    signal: request.signal,
  }

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
