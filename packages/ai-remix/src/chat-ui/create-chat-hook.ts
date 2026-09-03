import type { InferredClientContext } from '@tanstack/ai-client'
import type {
  ChatUIInterruptsOf,
  ChatUISchemaOf,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import type { Handle } from 'remix/ui'
import { createChat as createUnboundChat } from '../create-chat.ts'
import type { CreateChatOptions } from '../types.ts'
import { createChatUI } from './create-ui.tsx'
import type { ChatUIFactoryConfig, ChatUIHost } from './create-ui.tsx'

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
 * Returns a bound `createAppChat`, the UI kit (`ui`), and `useChatContext`.
 * Call `createAppChat(handle)` in a Remix setup function. Render
 * `<ui.Chat chat={chat} />`. Pass instance overrides such as `threadId`
 * into `createAppChat(handle, overrides)`.
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

  function createAppChat(
    handle: Handle<any>,
    overrides?: ChatInstanceOverrides<TOptions>,
  ): ChatUIHost<TOptions> {
    const chat = overrides
      ? createUnboundChat(handle, {
          ...(options as HeadlessOptions<TOptions>),
          ...overrides,
        })
      : createUnboundChat(handle, options as HeadlessOptions<TOptions>)
    // oxlint-disable-next-line eslint-js/no-restricted-syntax -- return shape always includes partial/final; ChatUIHost gates those on TSchema
    return chat as unknown as ChatUIHost<TOptions>
  }

  return {
    createAppChat,
    ui,
    useChatContext: ui.useChatContext,
  }
}
