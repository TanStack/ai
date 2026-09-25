import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import type { StandardJSONSchemaV1 } from '@standard-schema/spec'
import { defineInterrupt } from '../src'
import {
  chat,
  createChatOptions,
  defineChatMiddleware,
  INTERRUPT_BOUNDARY_PHASES,
  INTERRUPT_TOOL_RESUMES,
  toolDefinition,
} from '../src'
import type { AnyTextAdapter } from '../src'
import type {
  ChatMiddleware,
  DefinedChatMiddleware,
  GenericInterruptRequest,
  GenericInterruptResolution,
  InterruptBoundaryPhase,
  InterruptResolutionCollection,
  InterruptResolutionResult,
  InterruptToolResume,
} from '../src'
import { createChatMiddleware } from '../src'

expectTypeOf(INTERRUPT_BOUNDARY_PHASES).toEqualTypeOf<
  readonly ['beforeModel', 'afterModel', 'beforeTools', 'afterTools']
>()
expectTypeOf<InterruptBoundaryPhase>().toEqualTypeOf<
  (typeof INTERRUPT_BOUNDARY_PHASES)[number]
>()
expectTypeOf(INTERRUPT_TOOL_RESUMES).toEqualTypeOf<
  readonly ['continue', 'cancel', 'stop']
>()
expectTypeOf<InterruptToolResume>().toEqualTypeOf<
  (typeof INTERRUPT_TOOL_RESUMES)[number]
>()

const standardDefinition = defineInterrupt({
  id: 'standard',
  responseSchema: z.object({ approved: z.boolean() }),
})
const duplicateIdDefinition = defineInterrupt({
  id: 'standard',
  responseSchema: z.object({ approved: z.boolean() }),
})
declare const runtimeInterruptId: string
const runtimeIdDefinition = defineInterrupt({
  id: runtimeInterruptId,
  responseSchema: z.object({ approved: z.boolean() }),
})

declare const jsonResponseSchema: StandardJSONSchemaV1<
  unknown,
  { accepted: boolean }
>
const jsonDefinition = defineInterrupt({
  id: 'json',
  responseSchema: jsonResponseSchema,
})
declare const unrelatedDefinition: ReturnType<typeof defineInterrupt>

type Definitions = typeof standardDefinition | typeof jsonDefinition
declare const collection: InterruptResolutionCollection<Definitions>

const standardRequest = standardDefinition.interrupt({
  key: 'standard',
  reason: 'test',
  message: 'Standard',
})
const jsonRequest = jsonDefinition.interrupt({
  key: 'json',
  reason: 'test',
  message: 'JSON',
})

const contextToolDefinition = toolDefinition({
  name: 'context-tool',
  description: 'Context tool',
  inputSchema: z.object({ value: z.string() }),
})
const contextTool = contextToolDefinition.server(
  async (_args, context: { context: { toolFlag: boolean } }) =>
    context.context.toolFlag,
)
const unregisteredRequest = unrelatedDefinition.interrupt({
  key: 'x',
  reason: 'x',
  message: 'x',
})

const validStandardResolution: GenericInterruptResolution<Definitions> = {
  request: standardRequest,
  status: 'resolved',
  response: { approved: true },
}
const validJsonResolution: GenericInterruptResolution<Definitions> = {
  request: jsonRequest,
  status: 'resolved',
  response: { accepted: true },
}
void validStandardResolution
void validJsonResolution

const validCancelledResolution: GenericInterruptResolution<
  typeof standardDefinition
> = {
  request: standardRequest,
  status: 'cancelled',
}
void validCancelledResolution

// @ts-expect-error Resolved resolutions must include the exact response.
const resolvedWithoutResponse: GenericInterruptResolution<
  typeof standardDefinition
> = {
  request: standardRequest,
  status: 'resolved',
}
void resolvedWithoutResponse

// @ts-expect-error Cancelled resolutions cannot include a response.
const cancelledWithResponse: GenericInterruptResolution<
  typeof standardDefinition
> = {
  request: standardRequest,
  status: 'cancelled',
  response: { approved: true },
}
void cancelledWithResponse

// @ts-expect-error A standard request cannot carry the JSON definition response.
const invalidResolutionPair: GenericInterruptResolution<Definitions> = {
  request: standardRequest,
  status: 'resolved',
  response: { accepted: true },
}
void invalidResolutionPair

// @ts-expect-error A collection rejects definitions outside its registered union.
collection.for(unrelatedDefinition)

const standardResolutions = collection.for(standardDefinition)
expectTypeOf<(typeof standardResolutions)[number]['response']>().toEqualTypeOf<
  { approved: boolean } | undefined
>()
const jsonResolutions = collection.for(jsonDefinition)
expectTypeOf<(typeof jsonResolutions)[number]['response']>().toEqualTypeOf<
  { accepted: boolean } | undefined
>()
const allResolutions = collection.all()
expectTypeOf(allResolutions).toEqualTypeOf<
  ReadonlyArray<GenericInterruptResolution<Definitions>>
>()
expectTypeOf(collection.all(standardDefinition)).toEqualTypeOf<
  ReadonlyArray<GenericInterruptResolution<typeof standardDefinition>>
>()
expectTypeOf(collection.all(standardDefinition, jsonDefinition)).toEqualTypeOf<
  ReadonlyArray<GenericInterruptResolution<Definitions>>
>()

const builderStandard: DefinedChatMiddleware<
  unknown,
  readonly [],
  readonly [],
  typeof standardDefinition
> = {
  onInterruptResolution() {
    return { toolResume: 'continue' }
  },
}
const builderJson: DefinedChatMiddleware<
  unknown,
  readonly [],
  readonly [],
  typeof jsonDefinition
> = {
  onInterruptResolution() {
    return { toolResume: 'continue' }
  },
}
const interruptFreeBuilt = createChatMiddleware()
  .use({
    name: 'logging-middleware',
    onConfig(_ctx, config) {
      return config
    },
  })
  .use({
    name: 'second-logging-middleware',
    onConfig(_ctx, config) {
      return config
    },
  })
  .build()

const built = createChatMiddleware()
  .use(builderStandard)
  .use(builderJson)
  .build()
expectTypeOf(built).toEqualTypeOf<
  [typeof builderStandard, typeof builderJson]
>()
const unionAwareBuilder = createChatMiddleware()
  .use(builderStandard)
  .use(builderJson)
  .use({
    onInterruptResolution(
      _ctx,
      resolutions: InterruptResolutionCollection<Definitions>,
    ) {
      expectTypeOf(resolutions.all()).toEqualTypeOf<
        ReadonlyArray<GenericInterruptResolution<Definitions>>
      >()
      return { toolResume: 'continue' }
    },
  })
void unionAwareBuilder

const validPhase: InterruptBoundaryPhase = 'beforeModel'
expectTypeOf(validPhase).toEqualTypeOf<'beforeModel'>()
const validMiddleware: ChatMiddleware<unknown, Definitions> = {
  onInterruptBoundary(ctx) {
    const phase: InterruptBoundaryPhase = ctx.phase
    void phase
    return
  },
  onInterruptResolution() {
    return { toolResume: 'continue' }
  },
}
expectTypeOf(validMiddleware).toMatchTypeOf<
  ChatMiddleware<unknown, Definitions>
>()

// @ts-expect-error The boundary phase is restricted to the four engine phases.
const invalidPhase: InterruptBoundaryPhase = 'init'
void invalidPhase

const invalidReturn: ChatMiddleware<unknown, Definitions> = {
  // @ts-expect-error Boundary hooks may return only an interrupts collection.
  onInterruptBoundary: () => ({ requests: [] }),
}
void invalidReturn

// @ts-expect-error Empty resolution objects are not valid decisions.
const invalidResolution: InterruptResolutionResult = {}
void invalidResolution

const invalidToolResume: ChatMiddleware<unknown, Definitions> = {
  // @ts-expect-error Only continue, cancel, or stop are valid.
  onInterruptResolution() {
    return { toolResume: 'pause' }
  },
}
void invalidToolResume

declare const adapter: AnyTextAdapter
chat({
  adapter,
  middleware: interruptFreeBuilt,
})
chat({
  adapter,
  // @ts-expect-error Literal interrupt definition ids must be unique in one chat registry.
  interrupts: [standardDefinition, duplicateIdDefinition] as const,
})
// Runtime IDs remain compatible. The runtime validation rejects duplicates
// only when the values are known at execution time.
chat({
  adapter,
  interrupts: [runtimeIdDefinition, runtimeIdDefinition] as const,
})
chat({
  adapter,
  interrupts: [standardDefinition, jsonDefinition] as const,
  middleware: [
    {
      onInterruptBoundary: () => ({
        interrupts: [standardRequest, jsonRequest],
      }),
      onInterruptResolution(_ctx, resolutions) {
        resolutions.for(standardDefinition)
        resolutions.for(jsonDefinition)
        return { toolResume: 'continue' }
      },
    },
  ],
})

// Public calls must infer the merged tool and user context without a
// predeclared ChatMiddleware annotation.
chat({
  adapter,
  interrupts: [standardDefinition, jsonDefinition] as const,
  tools: [contextTool] as const,
  context: { tenantId: 'tenant', toolFlag: true },
  middleware: [
    {
      setup(ctx) {
        expectTypeOf(ctx.context.tenantId).toEqualTypeOf<string>()
        expectTypeOf(ctx.context.toolFlag).toEqualTypeOf<boolean>()
        // @ts-expect-error Unknown context fields are rejected.
        ctx.context.unknownField
      },
      onInterruptBoundary(ctx) {
        expectTypeOf(ctx.context.tenantId).toEqualTypeOf<string>()
        expectTypeOf(ctx.context.toolFlag).toEqualTypeOf<boolean>()
        // @ts-expect-error Unknown context fields are rejected.
        ctx.context.unknownField
        return { interrupts: [standardRequest] }
      },
      onInterruptResolution(ctx, resolutions) {
        expectTypeOf(ctx.context.tenantId).toEqualTypeOf<string>()
        expectTypeOf(ctx.context.toolFlag).toEqualTypeOf<boolean>()
        resolutions.for(standardDefinition)
        resolutions.for(jsonDefinition)
        return { toolResume: 'continue' }
      },
    },
  ],
})

const publicOptions = createChatOptions({
  adapter,
  interrupts: [standardDefinition, jsonDefinition] as const,
  tools: [contextTool] as const,
  context: { tenantId: 'tenant', toolFlag: true },
  middleware: [
    {
      setup(ctx) {
        expectTypeOf(ctx.context.tenantId).toEqualTypeOf<string>()
        expectTypeOf(ctx.context.toolFlag).toEqualTypeOf<boolean>()
        // @ts-expect-error Unknown context fields are rejected.
        ctx.context.unknownField
      },
      onInterruptBoundary(ctx) {
        expectTypeOf(ctx.context.tenantId).toEqualTypeOf<string>()
        expectTypeOf(ctx.context.toolFlag).toEqualTypeOf<boolean>()
        return { interrupts: [jsonRequest] }
      },
      onInterruptResolution(_ctx, resolutions) {
        resolutions.for(standardDefinition)
        resolutions.for(jsonDefinition)
        return { toolResume: 'continue' }
      },
    },
  ],
})
chat({
  ...publicOptions,
  context: { tenantId: 'tenant', toolFlag: true },
})
publicOptions.middleware?.push({
  // @ts-expect-error Foreign definitions are rejected by options.middleware.push.
  onInterruptBoundary: () => ({
    interrupts: [unregisteredRequest],
  }),
})

chat({
  adapter,
  interrupts: [standardDefinition] as const,
  middleware: [
    {
      // @ts-expect-error Inline middleware may request only registered definitions.
      onInterruptBoundary: () => ({ interrupts: [unregisteredRequest] }),
      onInterruptResolution: (_ctx, resolutions) => {
        // @ts-expect-error Inline middleware resolutions may inspect only registered definitions.
        resolutions.for(unrelatedDefinition)
        return { toolResume: 'continue' }
      },
    },
  ],
})

const typedMiddleware: ChatMiddleware<{ tenantId: string }> = {
  setup(ctx) {
    expectTypeOf(ctx.context).toEqualTypeOf<{ tenantId: string }>()
  },
}
chat({
  adapter,
  interrupts: [] as const,
  tools: [] as const,
  context: { tenantId: 'tenant' },
  middleware: [typedMiddleware],
})
chat({
  adapter,
  tools: [] as const,
  context: { tenantId: 'tenant' },
  middleware: [typedMiddleware],
})

chat({
  adapter,
  // @ts-expect-error Middleware cannot emit a first-party interrupt without a registry.
  middleware: [
    {
      onInterruptBoundary: () => ({ interrupts: [standardRequest] }),
    },
  ],
})

const noRegistryMiddleware: ChatMiddleware<unknown, never> = {
  // @ts-expect-error A never registry cannot emit any first-party request.
  onInterruptBoundary: () => ({ interrupts: [standardRequest] }),
}
void noRegistryMiddleware
// @ts-expect-error A never definition cannot produce a request.
const noRegistryRequest: GenericInterruptRequest<never> = standardRequest
void noRegistryRequest

const standaloneRegisteredEmitter = defineChatMiddleware({
  onInterruptBoundary: () => ({ interrupts: [standardRequest] }),
})
chat({
  adapter,
  interrupts: [standardDefinition] as const,
  middleware: [standaloneRegisteredEmitter],
})
chat({
  adapter,
  // @ts-expect-error A reusable emitter also requires its definition in the chat registry.
  middleware: [standaloneRegisteredEmitter],
})

chat({
  adapter,
  interrupts: [] as const,
  // @ts-expect-error Middleware cannot emit a first-party interrupt with an empty registry.
  middleware: [
    {
      onInterruptBoundary: () => ({ interrupts: [standardRequest] }),
    },
  ],
})
