import { createChat as createUnboundChat } from './create-chat.svelte'
import type {
  AnyClientTool,
  InterruptDefinition,
  SchemaInput,
} from '@tanstack/ai'
import type {
  DistributedOmit,
  InferredClientContext,
} from '@tanstack/ai-client'
import type { CreateChatOptions } from './types'

type ChatHookOverrides<
  TTools extends ReadonlyArray<AnyClientTool>,
  TSchema extends SchemaInput | undefined,
  TContext,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> = {
  threadId: string
  live?: boolean
  forwardedProps?: Record<string, any>
  initialMessages?: CreateChatOptions<
    TTools,
    TSchema,
    TContext,
    TInterrupts
  >['initialMessages']
}

/**
 * Bind chat options once at module scope. The returned `createChat`
 * function creates a chat instance from those options.
 *
 * Pass `threadId` on every call. You can also override `initialMessages`,
 * `live`, and `forwardedProps` per call. Do not change `tools`,
 * `interrupts`, or `outputSchema` here. Those stay on the factory options.
 *
 * Rename the function at the call site if you already import `createChat` from
 * `@tanstack/ai-svelte`: `const { createChat: createAppChat } = createChatHook(chatOptions)`.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createChatHook } from '@tanstack/ai-svelte'
 *
 *   const { createChat } = createChatHook(chatOptions)
 *   const chat = createChat({ threadId: 'support-1' })
 * </script>
 * ```
 */
export function createChatHook<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
>(
  options: DistributedOmit<
    CreateChatOptions<TTools, TSchema, TContext, TInterrupts>,
    'threadId'
  > & {
    // Plain keys so TypeScript can infer the generics through the Omit.
    tools?: TTools
    outputSchema?: TSchema
    interrupts?: TInterrupts
  },
) {
  function createChat(
    overrides: ChatHookOverrides<TTools, TSchema, TContext, TInterrupts>,
  ) {
    // `overrides` carries the required `threadId`.
    return createUnboundChat({ ...options, ...overrides } as CreateChatOptions<
      TTools,
      TSchema,
      TContext,
      TInterrupts
    >)
  }

  return { createChat }
}
