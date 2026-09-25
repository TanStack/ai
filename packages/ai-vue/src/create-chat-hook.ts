import { useChat as useUnboundChat } from './use-chat'
import type {
  AnyClientTool,
  InterruptDefinition,
  SchemaInput,
} from '@tanstack/ai'
import type { InferredClientContext } from '@tanstack/ai-client'
import type { UseChatOptions } from './types'

type ChatHookOverrides<
  TTools extends ReadonlyArray<AnyClientTool>,
  TSchema extends SchemaInput | undefined,
  TContext,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> = {
  threadId?: string
  live?: boolean
  forwardedProps?: Record<string, any>
  body?: Record<string, any>
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
 * Pass per-call overrides for instance keys such as `threadId`,
 * `initialMessages`, `live`, and `forwardedProps`. Do not change `tools`,
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
>(options: UseChatOptions<TTools, TSchema, TContext, TInterrupts>) {
  function useChat(
    overrides?: ChatHookOverrides<TTools, TSchema, TContext, TInterrupts>,
  ) {
    if (!overrides) {
      return useUnboundChat(options)
    }
    return useUnboundChat({ ...options, ...overrides })
  }

  return { useChat }
}
