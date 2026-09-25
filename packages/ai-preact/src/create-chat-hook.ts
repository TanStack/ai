import { useChat as useUnboundChat } from './use-chat'
import type { AnyClientTool, InterruptDefinition } from '@tanstack/ai/client'
import type { InferredClientContext } from '@tanstack/ai-client'
import type { UseChatOptions } from './types'

type ChatHookOverrides<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> = {
  threadId?: string
  live?: boolean
  forwardedProps?: Record<string, any>
  body?: Record<string, any>
  initialMessages?: UseChatOptions<
    TTools,
    TContext,
    TInterrupts
  >['initialMessages']
}

/**
 * Bind chat options once at module scope. The returned `useChat` hook
 * creates a chat instance from those options.
 *
 * Pass per-call overrides for instance keys such as `threadId`,
 * `initialMessages`, `live`, and `forwardedProps`. Do not change `tools`,
 * `interrupts`, or `outputSchema` here. Those stay on the factory options.
 */
export function createChatHook<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
>(options: UseChatOptions<TTools, TContext, TInterrupts>) {
  function useChat(
    overrides?: ChatHookOverrides<TTools, TContext, TInterrupts>,
  ) {
    if (!overrides) {
      return useUnboundChat(options)
    }
    return useUnboundChat({ ...options, ...overrides })
  }

  return { useChat }
}
