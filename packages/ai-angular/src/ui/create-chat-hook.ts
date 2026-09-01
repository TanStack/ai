import { assertInInjectionContext } from '@angular/core'
import type { Type } from '@angular/core'
import { injectChat } from '../inject-chat'
import type { InjectChatOptions } from '../types'
import { createChatUI } from './create-ui'
import type { ChatUIFactoryConfig, ChatUIHost, InputProps } from './create-ui'
import type {
  ChatUIInterruptsOf,
  ChatUISchemaOf,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import type { InferredClientContext } from '@tanstack/ai-client'

type HeadlessOptions<TOptions> = InjectChatOptions<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  InferredClientContext<ChatUIToolsOf<TOptions>>,
  ChatUIInterruptsOf<TOptions>
>

type ChatInstanceOverrides<TOptions> = {
  threadId?: string
  live?: HeadlessOptions<TOptions>['live']
  forwardedProps?: HeadlessOptions<TOptions>['forwardedProps']
  body?: HeadlessOptions<TOptions>['body']
  initialMessages?: HeadlessOptions<TOptions>['initialMessages']
}

/**
 * Bind chat options and Angular widgets once at module scope.
 *
 * This matches Form `injectForm` and the React `createChatHook` factory:
 * widgets register here. The returned `injectAppChat` creates a chat
 * instance in an injection context. Render `<ai-chat [chat]="chat" />`
 * with the factory `Chat` component.
 */
export function createChatHook<
  const TOptions,
  TInput extends Type<unknown> | undefined = Type<unknown> | undefined,
>({
  options,
  ...chatComponents
}: {
  options: TOptions
} & ChatUIFactoryConfig<NoInfer<TOptions>, TInput>) {
  const ui = createChatUI(
    options,
    chatComponents as ChatUIFactoryConfig<NoInfer<TOptions>, TInput>,
  )

  function injectAppChat(overrides?: ChatInstanceOverrides<TOptions>) {
    assertInInjectionContext(injectAppChat)
    const chat = (
      overrides
        ? injectChat({
            ...(options as HeadlessOptions<TOptions>),
            ...overrides,
          })
        : injectChat(options as HeadlessOptions<TOptions>)
    ) as ChatUIHost<TOptions>
    return chat
  }

  return {
    injectAppChat,
    injectChatContext: ui.injectChatContext,
    Chat: ui.Chat,
    ChatProvider: ui.ChatProvider,
  } as {
    injectAppChat: (
      overrides?: ChatInstanceOverrides<TOptions>,
    ) => ChatUIHost<TOptions>
    injectChatContext: () => ChatUIHost<TOptions>
    Chat: Type<unknown>
    ChatProvider: Type<unknown>
  }
}

export type { InputProps }
