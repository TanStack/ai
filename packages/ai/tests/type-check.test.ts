/**
 * Type-level tests for TextActivityOptions and ChatStream
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
import type { ChatStream, KnownCustomEvent } from '../src'
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

type ChatStreamChunk = ChatStream extends AsyncIterable<infer C> ? C : never

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
// chat() return type integration
// ===========================

describe('chat() return type', () => {
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

  it('stream: true without outputSchema is ChatStream', () => {
    const stream = chat({
      adapter: mockAdapter,
      messages: [],
      tools: [weatherTool, searchTool],
    })
    expectTypeOf(stream).toEqualTypeOf<ChatStream>()
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
// ChatStream: tagged custom events
// ===========================

describe('ChatStream tagged custom event narrowing', () => {
  it('should narrow approval-requested CUSTOM event payload', () => {
    type Chunk = ChatStreamChunk
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
    type Chunk = ChatStreamChunk
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
    type Chunk = ChatStreamChunk
    type Start = Extract<
      Chunk,
      { type: 'CUSTOM'; name: 'structured-output.start' }
    >

    expectTypeOf<Start['value']>().toEqualTypeOf<{ messageId: string }>()
  })

  it('should narrow structured-output.complete CUSTOM event payload', () => {
    type Chunk = ChatStreamChunk
    type Complete = Extract<
      Chunk,
      { type: 'CUSTOM'; name: 'structured-output.complete' }
    >

    expectTypeOf<Complete['value']>().toEqualTypeOf<{
      object: unknown
      raw: string
      reasoning?: string
    }>()
  })

  it('should narrow CustomEvent to KnownCustomEvent', () => {
    type Chunk = ChatStreamChunk
    type Custom = Extract<Chunk, { type: 'CUSTOM' }>
    expectTypeOf<Custom['name']>().toEqualTypeOf<KnownCustomEvent['name']>()
    type Approval = Extract<Custom, { name: 'approval-requested' }>
    expectTypeOf<Approval['value']['toolCallId']>().toEqualTypeOf<string>()
  })

  it('should not poison `value` to any across the CUSTOM union', () => {
    type Chunk = ChatStreamChunk
    type Approval = Extract<
      Chunk,
      { type: 'CUSTOM'; name: 'approval-requested' }
    >

    expectTypeOf<Approval['value']>().not.toBeAny()
  })
})

describe('ChatStream runtime access (kiira parity)', () => {
  it('full union should allow reading chunk.type (common property)', () => {
    type C = ChatStreamChunk
    expectTypeOf<C['type']>().not.toBeNever()
  })
})
