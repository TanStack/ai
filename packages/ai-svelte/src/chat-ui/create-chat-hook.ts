import type { InferredClientContext } from '@tanstack/ai-client'
import type {
  ChatUIInterruptsOf,
  ChatUISchemaOf,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import { createChat as createUnboundChat } from '../create-chat.svelte'
import type { CreateChatOptions } from '../types'
import { createChatUI } from './create-ui'
import type { ChatUIFactoryConfig, ChatUIHost } from './create-ui'

type HeadlessOptions<TOptions> = CreateChatOptions<
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
 * Returns a bound `createAppChat`, the UI descriptor (`ui`), and
 * `useChatContext`. Pass `{ui}` into `UIChat`. Pass instance overrides
 * such as `threadId` into `createAppChat()`.
 */
export function createChatHook<const TOptions>({
  options,
  ...chatComponents
}: {
  options: TOptions
} & ChatUIFactoryConfig<NoInfer<TOptions>>) {
  const ui = createChatUI(
    options,
    chatComponents as ChatUIFactoryConfig<NoInfer<TOptions>>,
  )

  function createAppChat(overrides?: ChatInstanceOverrides<TOptions>) {
    if (!overrides) {
      return createUnboundChat(
        options as HeadlessOptions<TOptions>,
      ) as ChatUIHost<TOptions>
    }
    return createUnboundChat({
      ...(options as HeadlessOptions<TOptions>),
      ...overrides,
    }) as ChatUIHost<TOptions>
  }

  return {
    createAppChat,
    ui,
    useChatContext: ui.useChatContext,
  }
}
