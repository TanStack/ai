/**
 * Type-level tests for TextActivityOptions and TypedStreamChunk
 * These should fail to compile if the types are incorrect
 */

import { describe, it, expectTypeOf } from 'vitest'
import { z } from 'zod'
import { chat, createChatOptions, toolDefinition } from '../src'
import type {
  JSONSchema,
  StreamChunk,
  Tool,
  ToolCallArgsEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  TypedStreamChunk,
} from '../src'
import type { TextAdapter } from '../src/activities/chat/adapter'

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
type ToolEventsOf<TTools extends ReadonlyArray<Tool<any, any, any>>> = {
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

    expectTypeOf(options.adapter).toMatchTypeOf<MockAdapter>()
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
      expectTypeOf<ArgsEvent>().toMatchTypeOf<ToolCallArgsEvent>()
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

  it('should return Promise<inferred schema> when outputSchema is provided', () => {
    const schema = z.object({ summary: z.string() })
    type Result = ReturnType<
      typeof chat<typeof mockAdapter, typeof schema, true, [typeof weatherTool]>
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
    expectTypeOf<EndEventOf<Chunk>['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<Exclude<EndEventOf<Chunk>['input'], undefined>>().toBeUnknown()
  })

  it('should fallback to string/unknown with empty tools array', () => {
    type E = ToolEventsOf<[]>

    expectTypeOf<E['start']['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<E['end']['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<Exclude<E['end']['input'], undefined>>().toBeUnknown()
  })

  it('should fallback to string/unknown when used without type args', () => {
    type E = {
      start: StartEventOf<TypedStreamChunk>
      end: EndEventOf<TypedStreamChunk>
    }

    expectTypeOf<E['start']['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<E['end']['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<Exclude<E['end']['input'], undefined>>().toBeUnknown()
  })

  it('should handle readonly tools array (as const)', () => {
    const tools = [weatherTool, searchTool] as const
    type E = ToolEventsOf<typeof tools>

    expectTypeOf<E['start']['toolName']>().toEqualTypeOf<
      'get_weather' | 'search'
    >()
  })
})

// ===========================
// Backward compatibility
// ===========================

describe('backward compatibility', () => {
  it('should preserve unparameterized ToolCallStartEvent/ToolCallEndEvent defaults', () => {
    expectTypeOf<ToolCallStartEvent['toolName']>().toEqualTypeOf<string>()
    expectTypeOf<ToolCallEndEvent['toolName']>().toEqualTypeOf<string>()
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
    >().toMatchTypeOf<ToolCallStartEvent>()
    expectTypeOf<
      ToolCallEndEvent<'get_weather', { location: string }>
    >().toMatchTypeOf<ToolCallEndEvent>()
  })

  it('should make TypedStreamChunk assignable to StreamChunk', () => {
    type Typed = TypedStreamChunk<[typeof weatherTool]>
    expectTypeOf<Typed>().toMatchTypeOf<StreamChunk>()
  })

  it('should keep StreamChunk itself unchanged', () => {
    type Start = Extract<StreamChunk, { type: 'TOOL_CALL_START' }>
    expectTypeOf<Start['toolName']>().toEqualTypeOf<string>()
  })
})
