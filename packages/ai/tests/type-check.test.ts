/**
 * Type-level tests for TextActivityOptions and TypedStreamChunk
 * These should fail to compile if the types are incorrect
 */

import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  chat,
  createChatOptions,
  createToolRegistry,
  mergeAgentTools,
  toolDefinition,
} from '../src'
import { ToolCallManager } from '../src/activities/chat/tools/tool-calls'
import type {
  AnyTool,
  JSONSchema,
  KnownCustomEvent,
  ProviderTool,
  StreamChunk,
  Tool,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
  TypedStreamChunk,
} from '../src'
import type { TextAdapter } from '../src/activities/chat/adapter'
import type { ChatMiddleware } from '../src'

// ===========================
// Mock adapter (inline — needed for typeof in generic args)
// ===========================

type MockAdapter = TextAdapter<
  'test-model',
  { validOption: string; anotherOption?: number },
  readonly ['text', 'image'],
  {
    text: unknown
    image: unknown
    audio: unknown
    video: unknown
    document: unknown
  }
>

const mockAdapter = {
  kind: 'text' as const,
  name: 'mock',
  model: 'test-model' as const,
  '~types': {
    providerOptions: {} as { validOption: string; anotherOption?: number },
    inputModalities: ['text', 'image'] as const,
    messageMetadataByModality: {
      // These `as unknown` casts are necessary — TextAdapter requires all 5
      // modality keys but the mock doesn't have real metadata types for them.
      text: undefined as unknown,
      image: undefined as unknown,
      audio: undefined as unknown,
      video: undefined as unknown,
      document: undefined as unknown,
    },
    toolCapabilities: [] as ReadonlyArray<string>,
    toolCallMetadata: undefined as unknown,
    systemPromptMetadata: undefined as never,
  },
  chatStream: async function* () {},
  structuredOutput: async () => ({ data: {}, rawText: '{}' }),
} satisfies MockAdapter

// ===========================
// Tool definitions for type tests
// ===========================

const weatherTool = toolDefinition({
  name: 'get_weather',
  description: 'Get weather',
  inputSchema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).optional(),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    conditions: z.string(),
  }),
})

const searchTool = toolDefinition({
  name: 'search',
  description: 'Search the web',
  inputSchema: z.object({
    query: z.string(),
  }),
})

const weatherServerTool = weatherTool.server(async () => ({
  temperature: 72,
  conditions: 'sunny',
}))

const searchClientTool = searchTool.client(async () => 'results')

const noInputTool = toolDefinition({
  name: 'get_time',
  description: 'Get the current time',
})

const jsonSchemaTool: Tool<JSONSchema, JSONSchema, 'json_tool'> = {
  name: 'json_tool',
  description: 'A tool with plain JSON Schema',
  inputSchema: {
    type: 'object',
    properties: { key: { type: 'string' } },
  },
}

// Provider tools carry opaque metadata and intentionally have a generic
// `string` name — used here to assert `NonProviderTools` correctly partitions
// them out so they don't widen the typed tool-call discriminated union.
const fakeProviderTool: ProviderTool<'fake-provider', 'web_search'> = {
  name: 'web_search',
  description: 'Provider-native web search',
  '~provider': 'fake-provider',
  '~toolKind': 'web_search',
}

// ===========================
// Type-level helpers to reduce Extract repetition
// ===========================

/** Extract the TOOL_CALL_START event from a chunk union */
type StartEventOf<TChunk> = Extract<TChunk, { type: 'TOOL_CALL_START' }>

/** Extract the TOOL_CALL_END event from a chunk union */
type EndEventOf<TChunk> = Extract<TChunk, { type: 'TOOL_CALL_END' }>

/** Extract the chunk type from an AsyncIterable (e.g. chat() return) */
type ChunkOf<T> = T extends AsyncIterable<infer C> ? C : never

/** Build the full TypedStreamChunk and extract both event types at once */
type ToolEventsOf<TTools extends ReadonlyArray<AnyTool>> = {
  start: StartEventOf<TypedStreamChunk<TTools>>
  end: EndEventOf<TypedStreamChunk<TTools>>
}

// ===========================
// TextActivityOptions type checking (pre-existing)
// ===========================

describe('TextActivityOptions type checking', () => {
  it('should allow valid options', () => {
    const options = createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      modelOptions: {
        validOption: 'test',
        anotherOption: 42,
      },
    })

    expectTypeOf(options.adapter).toExtend<MockAdapter>()
  })

  it('should reject invalid properties on createChatOptions', () => {
    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      // @ts-expect-error - thisIsntvalid is not a valid property
      thisIsntvalid: true,
    })
  })

  it('should reject invalid modelOptions properties', () => {
    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      modelOptions: {
        // @ts-expect-error - invalidOption is not a valid modelOption
        invalidOption: 'should error',
      },
    })
  })

  it('infers typed context for reusable tools and middleware', () => {
    type AppContext = { userId: string; db: { name: string } }

    const tool = toolDefinition({
      name: 'typedContextTool',
      description: 'Uses context',
    }).server<AppContext>((_input, ctx) => {
      expectTypeOf(ctx.context.userId).toEqualTypeOf<string>()
      return { dbName: ctx.context.db.name }
    })

    const middleware: ChatMiddleware<AppContext> = {
      onStart(ctx) {
        expectTypeOf(ctx.context.db.name).toEqualTypeOf<string>()
      },
    }

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      context: { userId: 'u-1', db: { name: 'primary' } },
      tools: [tool],
      middleware: [middleware],
    })
  })

  it('rejects missing or incompatible context for typed consumers', () => {
    type AppContext = { userId: string; db: { name: string } }
    const tool = toolDefinition({
      name: 'requiresContext',
      description: 'Requires context',
    }).server<AppContext>(() => ({ ok: true }))

    // @ts-expect-error - context is required when a typed tool requires it
    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [tool],
    })

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [tool],
      // @ts-expect-error - db is required by AppContext
      context: { userId: 'u-1' },
    })

    // @ts-expect-error - direct execution also requires runtime context
    tool.execute?.({})

    tool.execute?.(
      {},
      {
        toolCallId: 'call-1',
        context: { userId: 'u-1', db: { name: 'primary' } },
        emitCustomEvent: () => {},
      },
    )
  })

  it('allows context omission when typed consumers accept undefined', () => {
    type OptionalContext = { userId: string } | undefined
    const tool = toolDefinition({
      name: 'optionalContext',
      description: 'Accepts optional context',
    }).server<OptionalContext>((_input, ctx) => {
      expectTypeOf(ctx?.context).toEqualTypeOf<OptionalContext>()
      return { userId: ctx?.context?.userId ?? null }
    })

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [tool],
    })
  })

  it('requires context that satisfies every typed consumer', () => {
    type ToolContext = { userId: string }
    type MiddlewareContext = { tenantId: string }

    const tool = toolDefinition({
      name: 'requiresUserContext',
      description: 'Requires user context',
    }).server<ToolContext>(() => ({ ok: true }))

    const middleware: ChatMiddleware<MiddlewareContext> = {
      onStart(ctx) {
        expectTypeOf(ctx.context.tenantId).toEqualTypeOf<string>()
      },
    }

    const options = createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [tool],
      middleware: [middleware],
      context: { userId: 'u-1', tenantId: 't-1' },
    })

    expectTypeOf<NonNullable<typeof options.context>>().toEqualTypeOf<
      ToolContext & MiddlewareContext
    >()

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [tool],
      middleware: [middleware],
      // @ts-expect-error - tenantId is required by middleware context
      context: { userId: 'u-1' },
    })
  })

  it('requires context that satisfies typed consumers in widened arrays', () => {
    type UserContext = { userId: string }
    type TenantContext = { tenantId: string }

    const userTool = toolDefinition({
      name: 'widenedUserContextTool',
      description: 'Requires user context',
    }).server<UserContext>(() => ({ ok: true }))
    const tenantTool = toolDefinition({
      name: 'widenedTenantContextTool',
      description: 'Requires tenant context',
    }).server<TenantContext>(() => ({ ok: true }))
    const tools: Array<typeof userTool | typeof tenantTool> = [
      userTool,
      tenantTool,
    ]

    const userMiddleware: ChatMiddleware<UserContext> = {}
    const tenantMiddleware: ChatMiddleware<TenantContext> = {}
    const middleware: Array<typeof userMiddleware | typeof tenantMiddleware> = [
      userMiddleware,
      tenantMiddleware,
    ]

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools,
      middleware,
      context: { userId: 'u-1', tenantId: 't-1' },
    })

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools,
      middleware,
      // @ts-expect-error - widened arrays still require both context shapes
      context: { userId: 'u-1' },
    })
  })

  it('handles optional typed context consumers in widened arrays', () => {
    type UserContext = { userId: string }
    type OptionalTenantContext = { tenantId: string } | undefined

    const requiredTool = toolDefinition({
      name: 'widenedRequiredContextTool',
      description: 'Requires user context',
    }).server<UserContext>(() => ({ ok: true }))
    const optionalTool = toolDefinition({
      name: 'widenedOptionalContextTool',
      description: 'Accepts optional tenant context',
    }).server<OptionalTenantContext>((_input, ctx) => {
      expectTypeOf(ctx?.context).toEqualTypeOf<OptionalTenantContext>()
      return { tenantId: ctx?.context?.tenantId ?? null }
    })

    const requiredMiddleware: ChatMiddleware<UserContext> = {}
    const optionalMiddleware: ChatMiddleware<OptionalTenantContext> = {}

    const mixedTools: Array<typeof requiredTool | typeof optionalTool> = [
      requiredTool,
      optionalTool,
    ]
    const mixedMiddleware: Array<
      typeof requiredMiddleware | typeof optionalMiddleware
    > = [requiredMiddleware, optionalMiddleware]

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: mixedTools,
      middleware: mixedMiddleware,
      context: { userId: 'u-1', tenantId: 't-1' },
    })

    // @ts-expect-error - required consumers still force a context value
    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: mixedTools,
      middleware: mixedMiddleware,
    })

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: mixedTools,
      middleware: mixedMiddleware,
      // @ts-expect-error - provided context must satisfy optional consumers too
      context: { userId: 'u-1' },
    })

    const optionalTools: Array<typeof optionalTool> = [optionalTool]
    const optionalMiddlewareOnly: Array<typeof optionalMiddleware> = [
      optionalMiddleware,
    ]

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: optionalTools,
      middleware: optionalMiddlewareOnly,
    })

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: optionalTools,
      middleware: optionalMiddlewareOnly,
      context: { tenantId: 't-1' },
    })

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: optionalTools,
      middleware: optionalMiddlewareOnly,
      // @ts-expect-error - if context is provided, it must match the typed consumers
      context: { userId: 'u-1' },
    })
  })

  it('preserves typed context when merging server and client agent tools', () => {
    type AppContext = { userId: string }

    const serverTool = toolDefinition({
      name: 'serverNeedsContext',
      description: 'Requires runtime context',
    }).server<AppContext>((_input, ctx) => {
      expectTypeOf(ctx.context.userId).toEqualTypeOf<string>()
      return { userId: ctx.context.userId }
    })

    const mergedTools = mergeAgentTools(
      [serverTool],
      [
        {
          name: 'clientOnlyTool',
          description: 'Client-only tool from the request body',
          parameters: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
        },
      ],
    )

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: mergedTools,
      context: { userId: 'u-1' },
    })

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: mergedTools,
      // @ts-expect-error - merged server tools still require AppContext
      context: {},
    })
  })

  it('requires inferred context for ToolCallManager execution', () => {
    type AppContext = { userId: string }

    const tool = toolDefinition({
      name: 'managerRequiresContext',
      description: 'Requires runtime context',
    }).server<AppContext>((_input, ctx) => {
      expectTypeOf(ctx.context.userId).toEqualTypeOf<string>()
      return { ok: true }
    })

    const manager = new ToolCallManager([tool])

    // @ts-expect-error - required-context tools cannot execute without context
    manager.executeTools({} as never)

    manager.executeTools({} as never, { userId: 'u-1' })

    // @ts-expect-error - provided context must satisfy the managed tools
    manager.executeTools({} as never, {})
  })

  it('allows ToolCallManager context omission for optional-context tools', () => {
    type OptionalContext = { userId: string } | undefined

    const tool = toolDefinition({
      name: 'managerOptionalContext',
      description: 'Accepts optional runtime context',
    }).server<OptionalContext>((_input, ctx) => {
      expectTypeOf(ctx?.context).toEqualTypeOf<OptionalContext>()
      return { ok: true }
    })

    const manager = new ToolCallManager([tool])

    manager.executeTools({} as never)
    manager.executeTools({} as never, { userId: 'u-1' })
  })

  it('preserves context-required tools in tool registries', () => {
    type AppContext = { userId: string }

    const tool = toolDefinition({
      name: 'registryRequiresContext',
      description: 'Requires runtime context',
    }).server<AppContext>((_input, ctx) => {
      expectTypeOf(ctx.context.userId).toEqualTypeOf<string>()
      return { ok: true }
    })

    const registry = createToolRegistry([tool])
    registry.add(tool)

    const [registeredTool] = registry.getTools()
    expectTypeOf(registeredTool).toExtend<typeof tool | undefined>()

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: registry.getTools(),
      context: { userId: 'u-1' },
    })

    createChatOptions({
      adapter: mockAdapter,
      messages: [{ role: 'user', content: 'Hello' }],
      tools: registry.getTools(),
      // @ts-expect-error - registry tools still require AppContext
      context: {},
    })
  })
})

// ===========================
// TypedStreamChunk: tool name and input typing
// ===========================

describe('TypedStreamChunk tool call type safety', () => {
  describe('tool name typing', () => {
    it('should narrow toolName to literal union on both START and END events', () => {
      type E = ToolEventsOf<[typeof weatherTool, typeof searchTool]>

      expectTypeOf<E['start']['toolName']>().toEqualTypeOf<
        'get_weather' | 'search'
      >()
      expectTypeOf<E['end']['toolName']>().toEqualTypeOf<
        'get_weather' | 'search'
      >()
    })

    it('should narrow toolName to a single literal with one tool', () => {
      type E = ToolEventsOf<[typeof weatherTool]>

      expectTypeOf<E['start']['toolName']>().toEqualTypeOf<'get_weather'>()
      expectTypeOf<E['end']['toolName']>().toEqualTypeOf<'get_weather'>()
    })

    it('should narrow AG-UI toolCallName (not only deprecated toolName)', () => {
      type E = ToolEventsOf<[typeof weatherTool, typeof searchTool]>

      expectTypeOf<E['start']['toolCallName']>().toEqualTypeOf<
        'get_weather' | 'search'
      >()
      expectTypeOf<E['end']['toolCallName']>().toEqualTypeOf<
        'get_weather' | 'search'
      >()

      type Chunk = TypedStreamChunk<[typeof weatherTool, typeof searchTool]>
      type WeatherStart = Extract<
        Extract<Chunk, { type: 'TOOL_CALL_START' }>,
        { toolCallName: 'get_weather' }
      >
      expectTypeOf<
        WeatherStart['toolCallName']
      >().toEqualTypeOf<'get_weather'>()
    })
  })

  describe('tool output typing', () => {
    it('should type output from outputSchema on TOOL_CALL_END', () => {
      type WeatherEnd = Extract<
        Extract<
          TypedStreamChunk<[typeof weatherTool]>,
          { type: 'TOOL_CALL_END' }
        >,
        { toolName: 'get_weather' }
      >
      expectTypeOf<Exclude<WeatherEnd['output'], undefined>>().toEqualTypeOf<{
        temperature: number
        conditions: string
      }>()
    })

    it('should produce unknown output when the tool has no outputSchema', () => {
      type SearchEnd = Extract<
        Extract<
          TypedStreamChunk<[typeof searchTool]>,
          { type: 'TOOL_CALL_END' }
        >,
        { toolName: 'search' }
      >
      expectTypeOf<Exclude<SearchEnd['output'], undefined>>().toBeUnknown()
    })
  })

  describe('tool input typing', () => {
    it('should type input as the union of tool input types', () => {
      type E = ToolEventsOf<[typeof weatherTool, typeof searchTool]>

      type ExpectedInput =
        | { location: string; unit?: 'celsius' | 'fahrenheit' }
        | { query: string }
      expectTypeOf<
        Exclude<E['end']['input'], undefined>
      >().toEqualTypeOf<ExpectedInput>()
    })

    it('should type input correctly with a single tool', () => {
      type E = ToolEventsOf<[typeof searchTool]>

      expectTypeOf<Exclude<E['end']['input'], undefined>>().toEqualTypeOf<{
        query: string
      }>()
    })

    it('should produce unknown input for tools without inputSchema', () => {
      type E = ToolEventsOf<[typeof noInputTool]>

      // Use toBeUnknown() instead of toEqualTypeOf<unknown>() —
      // the latter can't distinguish `any` from `unknown` in vitest.
      expectTypeOf<Exclude<E['end']['input'], undefined>>().toBeUnknown()
    })

    it('should produce unknown input for plain JSON Schema tools', () => {
      type E = ToolEventsOf<[typeof jsonSchemaTool]>

      expectTypeOf<Exclude<E['end']['input'], undefined>>().toBeUnknown()
    })

    it('should preserve tool names when mixing Zod and no-schema tools', () => {
      type E = ToolEventsOf<[typeof searchTool, typeof noInputTool]>

      expectTypeOf<E['end']['toolName']>().toEqualTypeOf<
        'search' | 'get_time'
      >()
    })
  })

  describe('discriminated union narrowing', () => {
    it('should narrow input to specific tool type when checking toolName', () => {
      type Chunk = TypedStreamChunk<[typeof weatherTool, typeof searchTool]>
      type End = Extract<Chunk, { type: 'TOOL_CALL_END' }>

      // Narrowing by toolName should give the specific tool's input type
      type WeatherEnd = Extract<End, { toolName: 'get_weather' }>
      expectTypeOf<Exclude<WeatherEnd['input'], undefined>>().toEqualTypeOf<{
        location: string
        unit?: 'celsius' | 'fahrenheit'
      }>()

      type SearchEnd = Extract<End, { toolName: 'search' }>
      expectTypeOf<Exclude<SearchEnd['input'], undefined>>().toEqualTypeOf<{
        query: string
      }>()
    })

    it('should narrow START events by toolName', () => {
      type Chunk = TypedStreamChunk<[typeof weatherTool, typeof searchTool]>
      type Start = Extract<Chunk, { type: 'TOOL_CALL_START' }>

      type WeatherStart = Extract<Start, { toolName: 'get_weather' }>
      expectTypeOf<WeatherStart['toolName']>().toEqualTypeOf<'get_weather'>()

      type SearchStart = Extract<Start, { toolName: 'search' }>
      expectTypeOf<SearchStart['toolName']>().toEqualTypeOf<'search'>()
    })

    it('should narrow input with three or more tools', () => {
      type Chunk = TypedStreamChunk<
        [typeof weatherTool, typeof searchTool, typeof noInputTool]
      >
      type End = Extract<Chunk, { type: 'TOOL_CALL_END' }>

      type WeatherEnd = Extract<End, { toolName: 'get_weather' }>
      expectTypeOf<Exclude<WeatherEnd['input'], undefined>>().toEqualTypeOf<{
        location: string
        unit?: 'celsius' | 'fahrenheit'
      }>()

      type SearchEnd = Extract<End, { toolName: 'search' }>
      expectTypeOf<Exclude<SearchEnd['input'], undefined>>().toEqualTypeOf<{
        query: string
      }>()

      type TimeEnd = Extract<End, { toolName: 'get_time' }>
      expectTypeOf<Exclude<TimeEnd['input'], undefined>>().toBeUnknown()
    })

    it('should narrow input through chat() return type', () => {
      const stream = chat({
        adapter: mockAdapter,
        messages: [],
        tools: [weatherTool, searchTool],
      })
      type Chunk = ChunkOf<typeof stream>
      type End = Extract<Chunk, { type: 'TOOL_CALL_END' }>

      type WeatherEnd = Extract<End, { toolName: 'get_weather' }>
      expectTypeOf<Exclude<WeatherEnd['input'], undefined>>().toEqualTypeOf<{
        location: string
        unit?: 'celsius' | 'fahrenheit'
      }>()

      type SearchEnd = Extract<End, { toolName: 'search' }>
      expectTypeOf<Exclude<SearchEnd['input'], undefined>>().toEqualTypeOf<{
        query: string
      }>()
    })

    it('should narrow input with server tool variants', () => {
      type Chunk = TypedStreamChunk<
        [typeof weatherServerTool, typeof searchClientTool]
      >
      type End = Extract<Chunk, { type: 'TOOL_CALL_END' }>

      type WeatherEnd = Extract<End, { toolName: 'get_weather' }>
      expectTypeOf<Exclude<WeatherEnd['input'], undefined>>().toEqualTypeOf<{
        location: string
        unit?: 'celsius' | 'fahrenheit'
      }>()

      type SearchEnd = Extract<End, { toolName: 'search' }>
      // .client() preserves the original inputSchema type from the base definition
      expectTypeOf<Exclude<SearchEnd['input'], undefined>>().toEqualTypeOf<{
        query: string
      }>()
    })
  })

  describe('server and client tool variants', () => {
    it('should type ServerTool name and input from .server()', () => {
      type E = ToolEventsOf<[typeof weatherServerTool]>

      expectTypeOf<E['start']['toolName']>().toEqualTypeOf<'get_weather'>()
      expectTypeOf<Exclude<E['end']['input'], undefined>>().toEqualTypeOf<{
        location: string
        unit?: 'celsius' | 'fahrenheit'
      }>()
    })

    it('should type ClientTool name from .client()', () => {
      type E = ToolEventsOf<[typeof searchClientTool]>

      expectTypeOf<E['start']['toolName']>().toEqualTypeOf<'search'>()
    })

    it('should deduplicate names across definition, server, and client variants', () => {
      type E = ToolEventsOf<
        [typeof weatherTool, typeof weatherServerTool, typeof searchClientTool]
      >

      expectTypeOf<E['start']['toolName']>().toEqualTypeOf<
        'get_weather' | 'search'
      >()
    })

    it('should narrow input through chat() with server/client tools', () => {
      const stream = chat({
        adapter: mockAdapter,
        messages: [],
        tools: [weatherServerTool, searchClientTool],
      })
      type Chunk = ChunkOf<typeof stream>
      type End = Extract<Chunk, { type: 'TOOL_CALL_END' }>

      type WeatherEnd = Extract<End, { toolName: 'get_weather' }>
      expectTypeOf<Exclude<WeatherEnd['input'], undefined>>().toEqualTypeOf<{
        location: string
        unit?: 'celsius' | 'fahrenheit'
      }>()

      type SearchEnd = Extract<End, { toolName: 'search' }>
      expectTypeOf<Exclude<SearchEnd['input'], undefined>>().toEqualTypeOf<{
        query: string
      }>()
    })
  })

  describe('mixed schema types', () => {
    it('should narrow per-tool when mixing Zod and JSON Schema tools', () => {
      type Chunk = TypedStreamChunk<[typeof searchTool, typeof jsonSchemaTool]>
      type End = Extract<Chunk, { type: 'TOOL_CALL_END' }>

      type SearchEnd = Extract<End, { toolName: 'search' }>
      expectTypeOf<Exclude<SearchEnd['input'], undefined>>().toEqualTypeOf<{
        query: string
      }>()

      type JsonEnd = Extract<End, { toolName: 'json_tool' }>
      expectTypeOf<Exclude<JsonEnd['input'], undefined>>().toBeUnknown()
    })
  })

  describe('non-tool events are preserved', () => {
    it('should include all non-tool-call AG-UI events in the union', () => {
      type Chunk = TypedStreamChunk<[typeof weatherTool]>

      // Every AG-UI event type should still be extractable
      expectTypeOf<Extract<Chunk, { type: 'RUN_STARTED' }>>().not.toBeNever()
      expectTypeOf<Extract<Chunk, { type: 'RUN_FINISHED' }>>().not.toBeNever()
      expectTypeOf<Extract<Chunk, { type: 'RUN_ERROR' }>>().not.toBeNever()
      expectTypeOf<
        Extract<Chunk, { type: 'TEXT_MESSAGE_START' }>
      >().not.toBeNever()
      expectTypeOf<
        Extract<Chunk, { type: 'TEXT_MESSAGE_CONTENT' }>
      >().not.toBeNever()
      expectTypeOf<
        Extract<Chunk, { type: 'TEXT_MESSAGE_END' }>
      >().not.toBeNever()
      expectTypeOf<Extract<Chunk, { type: 'STEP_STARTED' }>>().not.toBeNever()
      expectTypeOf<Extract<Chunk, { type: 'STEP_FINISHED' }>>().not.toBeNever()
      expectTypeOf<
        Extract<Chunk, { type: 'MESSAGES_SNAPSHOT' }>
      >().not.toBeNever()
      expectTypeOf<Extract<Chunk, { type: 'STATE_SNAPSHOT' }>>().not.toBeNever()
      expectTypeOf<Extract<Chunk, { type: 'STATE_DELTA' }>>().not.toBeNever()
      expectTypeOf<Extract<Chunk, { type: 'CUSTOM' }>>().not.toBeNever()
    })

    it('should keep ToolCallArgsEvent unparameterized (string delta, no toolName)', () => {
      type Chunk = TypedStreamChunk<[typeof weatherTool]>
      type ArgsEvent = Extract<Chunk, { type: 'TOOL_CALL_ARGS' }>

      expectTypeOf<ArgsEvent>().not.toBeNever()
      expectTypeOf<ArgsEvent['delta']>().toEqualTypeOf<string>()
      expectTypeOf<ArgsEvent>().toExtend<ToolCallArgsEvent>()
    })
  })
})

// ===========================
// chat() return type integration
// ===========================

describe('chat() tool type inference', () => {
  it('should infer typed tool names through chat() return type', () => {
    type Chunk = ChunkOf<
      ReturnType<
        typeof chat<
          typeof mockAdapter,
          undefined,
          true,
          [typeof weatherTool, typeof searchTool]
        >
      >
    >

    expectTypeOf<StartEventOf<Chunk>['toolName']>().toEqualTypeOf<
      'get_weather' | 'search'
    >()
    expectTypeOf<EndEventOf<Chunk>['toolName']>().toEqualTypeOf<
      'get_weather' | 'search'
    >()
  })

  it('should infer TTools from options.tools without explicit type args', () => {
    // This is the actual user-facing API — if inference breaks, users silently
    // get `string` for toolName even when passing typed tools.
    const stream = chat({
      adapter: mockAdapter,
      messages: [],
      tools: [weatherTool, searchTool],
    })
    type Chunk = ChunkOf<typeof stream>

    expectTypeOf<StartEventOf<Chunk>['toolName']>().toEqualTypeOf<
      'get_weather' | 'search'
    >()
    expectTypeOf<EndEventOf<Chunk>['toolName']>().toEqualTypeOf<
      'get_weather' | 'search'
    >()
  })

  it('should return Promise<string> when stream: false, regardless of tools', () => {
    type Result = ReturnType<
      typeof chat<typeof mockAdapter, undefined, false, [typeof weatherTool]>
    >

    expectTypeOf<Result>().toEqualTypeOf<Promise<string>>()
  })

  it('should return Promise<inferred schema> when outputSchema is provided without explicit stream', () => {
    // Per issue #526, schema-bearing calls default to Promise<T>.
    // Only explicit `stream: true` opts into StructuredOutputStream.
    const schema = z.object({ summary: z.string() })
    type Result = ReturnType<
      typeof chat<
        typeof mockAdapter,
        typeof schema,
        boolean,
        [typeof weatherTool]
      >
    >

    expectTypeOf<Result>().toEqualTypeOf<Promise<{ summary: string }>>()
  })
})

// ===========================
// createChatOptions() preserves TTools
// ===========================

describe('createChatOptions() tool type preservation', () => {
  it('should preserve specific tool types through options helper', () => {
    const opts = createChatOptions({
      adapter: mockAdapter,
      tools: [weatherTool, searchTool],
    })

    type ToolsType = Exclude<typeof opts.tools, undefined>

    // Use union check — tuple ordering is not guaranteed across TS versions
    expectTypeOf<ToolsType[number]['name']>().toEqualTypeOf<
      'get_weather' | 'search'
    >()
  })
})

// ===========================
// Fallback / default behavior
// ===========================

describe('TypedStreamChunk fallback behavior', () => {
  it('should fallback to string/unknown with no tools (default generic)', () => {
    type Chunk = ChunkOf<ReturnType<typeof chat<typeof mockAdapter>>>

    expectTypeOf<StartEventOf<Chunk>['toolName']>().toEqualTypeOf<string>()
    // Base ToolCallEndEvent keeps toolName optional (AG-UI-compatible)
    expectTypeOf<EndEventOf<Chunk>['toolName']>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<Exclude<EndEventOf<Chunk>['input'], undefined>>().toBeUnknown()
  })

  it('should fallback to string/unknown with empty tools array', () => {
    type E = ToolEventsOf<[]>

    expectTypeOf<E['start']['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<E['end']['toolName']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Exclude<E['end']['input'], undefined>>().toBeUnknown()
  })

  it('should fallback to string/unknown when used without type args', () => {
    type E = {
      start: StartEventOf<TypedStreamChunk>
      end: EndEventOf<TypedStreamChunk>
    }

    expectTypeOf<E['start']['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<E['end']['toolName']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Exclude<E['end']['input'], undefined>>().toBeUnknown()
  })

  it('should handle readonly tools array (as const)', () => {
    const tools = [weatherTool, searchTool] as const
    type E = ToolEventsOf<typeof tools>

    expectTypeOf<E['start']['toolName']>().toEqualTypeOf<
      'get_weather' | 'search'
    >()
  })

  it('should fall back to untyped events when the array contains ONLY ProviderTools', () => {
    // ProviderTool has `name: string` (generic), so HasTypedTools must report
    // false for arrays containing only ProviderTools — otherwise the
    // discriminated union would widen `toolName` back to `string` and defeat
    // the entire typing exercise. Regression guard for NonProviderTools.
    type E = ToolEventsOf<[typeof fakeProviderTool]>

    expectTypeOf<E['start']['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<E['end']['toolName']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Exclude<E['end']['input'], undefined>>().toBeUnknown()
  })

  it('should keep narrowing on user tools when mixed with ProviderTools', () => {
    // The motivating mixed case: a user passes `[webSearchTool, myTypedTool]`
    // — they should still get typed narrowing for `myTypedTool`. Partition
    // strips the ProviderTool, leaving the typed tool's literal name.
    type E = ToolEventsOf<[typeof fakeProviderTool, typeof weatherTool]>

    expectTypeOf<E['start']['toolName']>().toEqualTypeOf<'get_weather'>()
    expectTypeOf<E['end']['toolName']>().toEqualTypeOf<'get_weather'>()
  })
})

// ===========================
// Backward compatibility
// ===========================

describe('backward compatibility', () => {
  it('should preserve unparameterized ToolCallStartEvent/ToolCallEndEvent defaults', () => {
    expectTypeOf<ToolCallStartEvent['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<ToolCallEndEvent['toolName']>().toEqualTypeOf<
      string | undefined
    >()
    expectTypeOf<Exclude<ToolCallEndEvent['input'], undefined>>().toBeUnknown()
  })

  it('should treat explicit defaults as identical to unparameterized', () => {
    expectTypeOf<
      ToolCallStartEvent<string>
    >().toEqualTypeOf<ToolCallStartEvent>()
    expectTypeOf<
      ToolCallEndEvent<string, unknown>
    >().toEqualTypeOf<ToolCallEndEvent>()
  })

  it('should make typed events assignable to untyped events', () => {
    expectTypeOf<
      ToolCallStartEvent<'get_weather'>
    >().toExtend<ToolCallStartEvent>()
    expectTypeOf<
      ToolCallEndEvent<'get_weather', { location: string }>
    >().toExtend<ToolCallEndEvent>()
  })

  it('should make TypedStreamChunk assignable to StreamChunk', () => {
    type Typed = TypedStreamChunk<[typeof weatherTool]>
    expectTypeOf<Typed>().toExtend<StreamChunk>()
  })

  it('should keep StreamChunk itself unchanged', () => {
    type Start = Extract<StreamChunk, { type: 'TOOL_CALL_START' }>
    expectTypeOf<Start['toolName']>().toEqualTypeOf<string>()
  })
})

// ===========================
// TypedStreamChunk: tagged custom events
// ===========================

describe('TypedStreamChunk tagged custom event narrowing', () => {
  it('should narrow approval-requested CUSTOM event payload', () => {
    type Chunk = TypedStreamChunk<[typeof weatherTool]>
    type Approval = Extract<
      Chunk,
      { type: 'CUSTOM'; name: 'approval-requested' }
    >

    expectTypeOf<Approval['value']>().toEqualTypeOf<{
      toolCallId: string
      toolName: string
      input: unknown
      approval: { id: string; needsApproval: true }
    }>()
  })

  it('should narrow tool-input-available CUSTOM event payload', () => {
    type Chunk = TypedStreamChunk<[typeof weatherTool]>
    type ToolInput = Extract<
      Chunk,
      { type: 'CUSTOM'; name: 'tool-input-available' }
    >

    expectTypeOf<ToolInput['value']>().toEqualTypeOf<{
      toolCallId: string
      toolName: string
      input: unknown
    }>()
  })

  it('should narrow structured-output.start CUSTOM event payload', () => {
    type Chunk = TypedStreamChunk<[typeof weatherTool]>
    type Start = Extract<
      Chunk,
      { type: 'CUSTOM'; name: 'structured-output.start' }
    >

    expectTypeOf<Start['value']>().toEqualTypeOf<{ messageId: string }>()
  })

  it('should narrow structured-output.complete CUSTOM event payload', () => {
    type Chunk = TypedStreamChunk<[typeof weatherTool]>
    type Complete = Extract<
      Chunk,
      { type: 'CUSTOM'; name: 'structured-output.complete' }
    >

    // Adapter-emitted form: T defaults to unknown, narrowed by orchestrator later
    expectTypeOf<Complete['value']>().toEqualTypeOf<{
      object: unknown
      raw: string
      reasoning?: string
    }>()
  })

  it('should narrow CustomEvent to KnownCustomEvent even without typed tools', () => {
    // Framework CUSTOM events (sandbox, code-mode, structured-output,
    // approvals, etc.) don't depend on the tools array, so they narrow in the
    // fallback branch too — `chunk.type === 'CUSTOM' && chunk.name === '...'`
    // works whether the caller passed typed tools or not.
    type Chunk = TypedStreamChunk
    type Custom = Extract<Chunk, { type: 'CUSTOM' }>
    // `name` is the discriminated union of known framework CUSTOM literals.
    expectTypeOf<Custom['name']>().toEqualTypeOf<KnownCustomEvent['name']>()
    // Core tagged shapes still narrow.
    type Approval = Extract<Custom, { name: 'approval-requested' }>
    expectTypeOf<Approval['value']['toolCallId']>().toEqualTypeOf<string>()
  })

  it('should not poison `value` to any across the CUSTOM union', () => {
    // Regression test: when bare CustomEvent (`value: any`) gets unioned with
    // tagged variants, the discriminated narrow loses type information.
    // Picking any tagged variant must keep its `value` shape intact rather
    // than collapsing to `any`.
    type Chunk = TypedStreamChunk<[typeof weatherTool]>
    type Approval = Extract<
      Chunk,
      { type: 'CUSTOM'; name: 'approval-requested' }
    >

    // toBeAny() inverts the assertion — this guards the regression.
    expectTypeOf<Approval['value']>().not.toBeAny()
  })
})

describe('TypedStreamChunk runtime access (kiira parity)', () => {
  it('full union should allow reading chunk.type (common property)', () => {
    type C = TypedStreamChunk<[typeof weatherTool]>
    // If this line type-errors under tsc, the docs for-await pattern is broken.
    expectTypeOf<C['type']>().not.toBeNever()
  })
})
