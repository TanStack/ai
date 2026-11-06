import { chat as coreChat } from '@tanstack/ai'
import { Effect, JsonSchema, Schema, Stream } from 'effect'
import type {
  AnyTextAdapter,
  DefinedAgent,
  InferSchemaType,
  InterruptDefinition,
  SchemaInput,
  StandardJSONSchemaV1,
  StreamChunk,
  ToolDefinition,
  ToolExecutionContext,
} from '@tanstack/ai'
import type { TextActivityOptions } from '@tanstack/ai/adapters'
import type { Context } from 'effect'
import { toEffect, toStream } from './lift'
import type { AIError } from './lift'

type AnyToolDefinition = ToolDefinition<any, any, string, boolean, any>

/**
 * A server tool whose `execute` returns an Effect. Make it with
 * `serverTool`. `R` is the services the Effect needs.
 */
export interface EffectServerTool<TDef extends AnyToolDefinition, R> {
  readonly _tag: 'EffectServerTool'
  readonly def: TDef
  readonly execute: (
    input: InferSchemaType<TDef['inputSchema']>,
    ctx: ToolExecutionContext,
  ) => Effect.Effect<InferSchemaType<TDef['outputSchema']>, unknown, R>
}

/**
 * Makes a server tool from a tool definition and a function that returns an
 * Effect. Pass it in the `tools` of `chat`. The Effect runs with the services
 * of the `chat` caller, and stops when the run aborts. A failure goes to the
 * model as a tool error.
 *
 * @example
 * const getUser = serverTool(getUserDef, ({ id }) =>
 *   Effect.gen(function* () {
 *     const db = yield* Db
 *     return yield* db.findUser(id)
 *   }),
 * )
 */
export const serverTool = <TDef extends AnyToolDefinition, E, R>(
  def: TDef,
  execute: (
    input: InferSchemaType<TDef['inputSchema']>,
    ctx: ToolExecutionContext,
  ) => Effect.Effect<InferSchemaType<TDef['outputSchema']>, E, R>,
) => {
  const tool: EffectServerTool<TDef, R> = {
    _tag: 'EffectServerTool',
    def,
    execute,
  }
  return tool
}

const closedJsonSchema =
  (schema: Schema.Constraint) =>
  (options: StandardJSONSchemaV1.Options): Record<string, unknown> => {
    const doc = Schema.toJsonSchemaDocument(schema, {
      onExcessProperty: 'error',
    })
    // Same shape as Effect's own toStandardJSONSchemaV1: no empty defs key,
    // because OpenAI strict mode rejects `definitions` / `$defs`.
    if (options.target === 'draft-2020-12') {
      const hasDefs = Object.keys(doc.definitions).length > 0
      return {
        $schema: JsonSchema.META_SCHEMA_URI_DRAFT_2020_12,
        ...doc.schema,
        ...(hasDefs && { $defs: doc.definitions }),
      }
    }
    const doc07 = JsonSchema.toDocumentDraft07(doc)
    const hasDefs = Object.keys(doc07.definitions).length > 0
    return {
      $schema: JsonSchema.META_SCHEMA_URI_DRAFT_07,
      ...doc07.schema,
      ...(hasDefs && { definitions: doc07.definitions }),
    }
  }

/**
 * Turn an Effect Schema into a tool `inputSchema` or `outputSchema`.
 * Objects are closed (`additionalProperties: false`), so providers such as
 * OpenAI can use strict mode. `Schema.toStandardJSONSchemaV1` leaves objects
 * open, which turns strict mode off.
 *
 * @example
 * toolDefinition({
 *   name: 'get_weather',
 *   inputSchema: toolSchema(Schema.Struct({ city: Schema.String })),
 * })
 */
export const toolSchema = <S extends Schema.Constraint>(
  schema: S,
): StandardJSONSchemaV1<S['Encoded'], S['Type']> => ({
  '~standard': {
    version: 1,
    vendor: 'effect',
    jsonSchema: {
      input: closedJsonSchema(schema),
      output: closedJsonSchema(Schema.toType(schema)),
    },
  },
})

type CoreTool<T> =
  T extends EffectServerTool<infer TDef, unknown>
    ? ReturnType<TDef['server']>
    : T

type CoreTools<TTools> =
  TTools extends ReadonlyArray<unknown>
    ? { readonly [K in keyof TTools]: CoreTool<TTools[K]> }
    : TTools

type ToolServices<TTools> =
  TTools extends ReadonlyArray<infer TTool>
    ? TTool extends EffectServerTool<AnyToolDefinition, infer R>
      ? R
      : never
    : never

type CoreToolsOption<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined,
  TStream extends boolean,
> = TextActivityOptions<TAdapter, TSchema, TStream, any>['tools']

type CoreChat<
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined,
  TStream extends boolean,
  TTools,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
  TContext,
  TMiddleware extends Array<unknown> | undefined,
  TAgents extends ReadonlyArray<DefinedAgent>,
> = typeof coreChat<
  TAdapter,
  TSchema,
  TStream,
  Extract<CoreTools<TTools>, CoreToolsOption<TAdapter, TSchema, TStream>>,
  TInterrupts,
  TContext,
  TMiddleware,
  TAgents
>

type Lift<TResult, R> =
  TResult extends AsyncIterable<infer TChunk>
    ? Stream.Stream<TChunk, AIError, R>
    : Effect.Effect<Awaited<TResult>, AIError, R>

type RuntimeChatOptions = Parameters<typeof coreChat>[0]

type RuntimeTool<R> =
  | EffectServerTool<AnyToolDefinition, R>
  | NonNullable<RuntimeChatOptions['tools']>[number]

type RuntimeOptions<R> = Omit<RuntimeChatOptions, 'tools'> & {
  tools?: ReadonlyArray<RuntimeTool<R>> | undefined
}

const isEffectServerTool = <R>(
  tool: RuntimeTool<R>,
): tool is EffectServerTool<AnyToolDefinition, R> =>
  '_tag' in tool && tool._tag === 'EffectServerTool'

// Core chat takes an AbortController. toEffect and toStream give a signal.
const controllerFor = (signal: AbortSignal) => {
  const controller = new AbortController()
  signal.addEventListener('abort', () => controller.abort(signal.reason), {
    once: true,
  })
  return controller
}

// Core picks the result kind at runtime. The public `chat` type mirrors it.
const runCore: (
  options: RuntimeChatOptions,
) => AsyncIterable<StreamChunk> | Promise<unknown> = coreChat

const runChat = <R>(
  options: RuntimeOptions<R>,
  context: Context.Context<R>,
  signal: AbortSignal,
) =>
  runCore({
    ...options,
    tools: options.tools?.map((tool) =>
      isEffectServerTool(tool)
        ? tool.def.server((input, ctx) =>
            Effect.runPromiseWith(context)(
              // One core path passes no context. Give the empty one core builds there.
              tool.execute(input, ctx ?? { emitCustomEvent: () => {} }),
              { signal: ctx?.abortSignal },
            ),
          )
        : tool,
    ),
    abortController: controllerFor(signal),
  })

/**
 * Runs core `chat` as an Effect. Takes the options of core `chat`, without
 * `abortController`: interruption aborts the run. `tools` can also hold
 * `serverTool` values. Their services join the requirements of the result.
 *
 * Returns a `Stream` of chunks by default. With `stream: false` it returns an
 * `Effect` of the result. With `outputSchema` (and no `stream: true`) it
 * returns an `Effect` of the parsed object. A throw or a rejection of core
 * fails with `AIError`.
 */
export const chat = <
  TAdapter extends AnyTextAdapter,
  TSchema extends SchemaInput | undefined = undefined,
  TStream extends boolean = boolean,
  const TTools extends
    | ReadonlyArray<
        | EffectServerTool<AnyToolDefinition, unknown>
        | NonNullable<CoreToolsOption<TAdapter, TSchema, TStream>>[number]
      >
    | undefined = undefined,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = [],
  TContext = unknown,
  const TMiddleware extends Array<unknown> | undefined = undefined,
  const TAgents extends ReadonlyArray<DefinedAgent> =
    ReadonlyArray<DefinedAgent>,
>(
  options: Omit<
    Parameters<
      CoreChat<
        TAdapter,
        TSchema,
        TStream,
        TTools,
        TInterrupts,
        TContext,
        TMiddleware,
        TAgents
      >
    >[0],
    'tools' | 'abortController'
  > & { tools?: TTools },
) => {
  type R = ToolServices<TTools>
  // The public types above mirror core. At runtime core picks the result kind by this same rule.
  const runtimeOptions = options as RuntimeOptions<R>
  const isStream = options.outputSchema
    ? options.stream === true
    : options.stream !== false
  const result = isStream
    ? Stream.unwrap(
        Effect.map(Effect.context<R>(), (context) =>
          toStream(
            (signal) =>
              runChat(
                runtimeOptions,
                context,
                signal,
              ) as AsyncIterable<StreamChunk>,
          ),
        ),
      )
    : Effect.flatMap(Effect.context<R>(), (context) =>
        toEffect(
          (signal) =>
            runChat(runtimeOptions, context, signal) as Promise<unknown>,
        ),
      )
  return result as Lift<
    ReturnType<
      CoreChat<
        TAdapter,
        TSchema,
        TStream,
        TTools,
        TInterrupts,
        TContext,
        TMiddleware,
        TAgents
      >
    >,
    R
  >
}
