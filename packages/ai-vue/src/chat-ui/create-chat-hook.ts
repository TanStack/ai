import type { InferredClientContext } from '@tanstack/ai-client'
import type {
  ChatUIInterruptsOf,
  ChatUISchemaOf,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import { useChat as useUnboundChat } from '../use-chat'
import type { UseChatOptions } from '../types'
import { createChatUI } from './create-ui'
import type { ChatUIFactoryConfig, ChatUIHost } from './create-ui'

type HeadlessOptions<TOptions> = UseChatOptions<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  InferredClientContext<ChatUIToolsOf<TOptions>>,
  ChatUIInterruptsOf<TOptions>
>

type ChatInstanceOverrides<TOptions> = {
  threadId?: string
  live?: boolean
  forwardedProps?: Record<string, any>
  body?: Record<string, any>
  initialMessages?: HeadlessOptions<TOptions>['initialMessages']
}

/**
 * Bind chat options and UI widgets once at module scope.
 *
 * Returns a bound `useAppChat`, the UI descriptor (`ui`), and `useChatContext`.
 * Pass `ui` into `UIChat`. Part and interrupt widgets take props. Do not
 * read those from context.
 *
 * Pass instance overrides such as `threadId` into `useAppChat()`.
 */
export function createChatHook<const TOptions>({
  options,
  chatComponents,
}: {
  options: TOptions
  chatComponents: ChatUIFactoryConfig<NoInfer<TOptions>>
}) {
  const ui = createChatUI(options, chatComponents)

  function useAppChat(overrides?: ChatInstanceOverrides<TOptions>) {
    if (!overrides) {
      return useUnboundChat(
        options as HeadlessOptions<TOptions>,
      ) as ChatUIHost<TOptions>
    }
    return useUnboundChat({
      ...(options as HeadlessOptions<TOptions>),
      ...overrides,
    }) as ChatUIHost<TOptions>
  }

  return {
    useAppChat,
    ui,
    useChatContext: ui.useChatContext,
  }
}
