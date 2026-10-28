import { useChat as useUnboundChat } from './use-chat'
import type {
  AnyClientTool,
  InterruptDefinition,
  SchemaInput,
} from '@tanstack/ai'
import type {
  DistributedOmit,
  InferredClientContext,
} from '@tanstack/ai-client'
import type { UseChatOptions } from './types'

type ChatHookOverrides<
  TTools extends ReadonlyArray<AnyClientTool>,
  TSchema extends SchemaInput | undefined,
  TContext,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> = {
  threadId: string
  live?: boolean
  forwardedProps?: Record<string, any>
  initialMessages?: UseChatOptions<
    TTools,
    TSchema,
    TContext,
    TInterrupts
  >['initialMessages']
}

/**
 * Bind chat options once at module scope. The returned `useChat` composable
 * creates a chat instance from those options.
 *
 * Pass `threadId` on every call. You can also override `initialMessages`,
 * `live`, and `forwardedProps` per call. Do not change `tools`,
 * `interrupts`, or `outputSchema` here. Those stay on the factory options.
 *
 * Rename the composable at the call site if you already import `useChat` from
 * `@tanstack/ai-vue`: `const { useChat: useAppChat } = createChatHook(chatOptions)`.
 *
 * @example
 * ```ts
 * const { useChat } = createChatHook(chatOptions)
 *
 * const chat = useChat({ threadId: 'support-1' })
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
    UseChatOptions<TTools, TSchema, TContext, TInterrupts>,
    'threadId'
  > & {
    // Plain keys so TypeScript can infer the generics through the Omit.
    tools?: TTools
    outputSchema?: TSchema
    interrupts?: TInterrupts
  },
) {
  function useChat(
    overrides: ChatHookOverrides<TTools, TSchema, TContext, TInterrupts>,
  ) {
    // `overrides` carries the required `threadId`.
    return useUnboundChat({ ...options, ...overrides } as UseChatOptions<
      TTools,
      TSchema,
      TContext,
      TInterrupts
    >)
  }

  return { useChat }
}
