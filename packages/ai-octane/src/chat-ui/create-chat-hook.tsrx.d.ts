import type { ComponentBody } from 'octane'
import type { ChatUIFactoryConfig, ChatUIHost } from './create-ui.tsrx'

export declare function createChatHook<
  const TOptions,
  TInput extends ComponentBody<any> | undefined = ComponentBody<any> | undefined,
>(config: { options: TOptions } & ChatUIFactoryConfig<TOptions, TInput>): {
  useAppChat: (overrides?: {
    threadId?: string
    live?: boolean
    forwardedProps?: Record<string, any>
    body?: Record<string, any>
    initialMessages?: ChatUIHost<TOptions>['messages']
  }) => ChatUIHost<TOptions> & { AppChat: ComponentBody }
  useChatContext: () => ChatUIHost<TOptions>
}
