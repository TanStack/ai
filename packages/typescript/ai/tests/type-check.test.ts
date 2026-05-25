/**
 * Type-level tests for TextActivityOptions
 * These should fail to compile if the types are incorrect
 */

import { describe, it, expectTypeOf } from 'vitest'
import {
  createChatOptions,
  createToolRegistry,
  mergeAgentTools,
  toolDefinition,
} from '../src'
import { ToolCallManager } from '../src/activities/chat/tools/tool-calls'
import type { TextAdapter } from '../src/activities/chat/adapter'
import type { ChatMiddleware } from '../src'

// Mock adapter for testing - simulates OpenAI adapter
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

describe('TextActivityOptions type checking', () => {
  it('should allow valid options', () => {
    // This should type-check successfully
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
    expectTypeOf(registeredTool).toMatchTypeOf<typeof tool | undefined>()

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
