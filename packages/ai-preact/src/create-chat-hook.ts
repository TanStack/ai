import { useChat as useUnboundChat } from './use-chat'
import type { AnyClientTool, InterruptDefinition } from '@tanstack/ai/client'
import type {
  DistributedOmit,
  InferredClientContext,
} from '@tanstack/ai-client'
import type { UseChatOptions } from './types'

type ChatHookOverrides<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> = {
  threadId: string
  live?: boolean
  forwardedProps?: Record<string, any>
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
 * Pass `threadId` on every call. You can also override `initialMessages`,
 * `live`, and `forwardedProps` per call. Do not change `tools`,
 * `interrupts`, or `outputSchema` here. Those stay on the factory options.
 */
export function createChatHook<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
>(
  options: DistributedOmit<
    UseChatOptions<TTools, TContext, TInterrupts>,
    'threadId'
  > & {
    // Plain keys so TypeScript can infer the generics through the Omit.
    tools?: TTools
    interrupts?: TInterrupts
  },
) {
  function useChat(
    overrides: ChatHookOverrides<TTools, TContext, TInterrupts>,
  ) {
    // `overrides` carries the required `threadId`.
    return useUnboundChat({ ...options, ...overrides } as UseChatOptions<
      TTools,
      TContext,
      TInterrupts
    >)
  }

  return { useChat }
}
