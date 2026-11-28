import { merge } from 'solid-js'
import type { Component } from 'solid-js'
import type { InferredClientContext } from '@tanstack/ai-client'
import type {
  ChatUIInterruptsOf,
  ChatUISchemaOf,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import { useChat as useUnboundChat } from '../use-chat'
import type { UseChatOptions } from '../types'
import { createChatUI } from './create-ui'
import type { ChatUIFactoryConfig, ChatUIHost, InputProps } from './create-ui'

type HeadlessOptions<TOptions> = UseChatOptions<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  InferredClientContext<ChatUIToolsOf<TOptions>>,
  ChatUIInterruptsOf<TOptions>
>

type ChatInstanceOverrides<TOptions> = {
  threadId: string
  live?: boolean
  forwardedProps?: Record<string, any>
  initialMessages?: HeadlessOptions<TOptions>['initialMessages']
}

/** Bind chat options and UI widgets once; useAppChat creates each instance. */
export function createChatHook<
  const TOptions,
  TInput extends Component<any> | undefined =
    | Component<InputProps<NoInfer<TOptions>>>
    | undefined,
>({
  options,
  ...chatComponents
}: { options: TOptions } & ChatUIFactoryConfig<NoInfer<TOptions>, TInput>) {
  const ui = createChatUI(
    options,
    chatComponents as ChatUIFactoryConfig<NoInfer<TOptions>, TInput>,
  )

  function useAppChat(overrides: ChatInstanceOverrides<TOptions>) {
    const chat = useUnboundChat(
      merge(options as HeadlessOptions<TOptions>, overrides),
    ) as ChatUIHost<TOptions>

    function AppChat() {
      return <ui.Chat chat={chat} />
    }

    return Object.assign(chat, { AppChat }) as ChatUIHost<TOptions> & {
      AppChat: Component
    }
  }

  return { useAppChat, useChatContext: ui.useChatContext }
}
