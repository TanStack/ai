import { useMemo, useRef } from 'react'
import type { ComponentType } from 'react'
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
 * This matches Form `createFormHook` and Table `createTableHook`. The
 * returned `useAppChat` creates a chat instance. `chat.AppChat` renders it.
 * `useChatContext` reads that instance. Part and interrupt widgets take
 * `part` / `interrupt` as props. Do not read those from context.
 *
 * Pass instance overrides such as `threadId` into `useAppChat()`.
 *
 * @example
 * ```tsx
 * const { useAppChat, useChatContext } = createChatHook({
 *   options: chatOptions,
 *   chatComponents: {
 *     layout: ChatLayout,
 *     message: ChatMessage,
 *     parts: { fallback: FallbackPart },
 *     tools: { getWeather: WeatherTool, purchaseItem: PurchaseTool },
 *     interrupts: { generic: { choosePlan: ChoosePlan } },
 *   },
 * })
 *
 * function Support() {
 *   const chat = useAppChat({ threadId: 'support-1' })
 *   return <chat.AppChat />
 * }
 * ```
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
    const chat = (
      overrides
        ? useUnboundChat({
            ...(options as HeadlessOptions<TOptions>),
            ...overrides,
          })
        : useUnboundChat(options as HeadlessOptions<TOptions>)
    ) as ChatUIHost<TOptions>

    // `useChat` returns a fresh object on every render. The mixed Chat
    // component must stay stable, or React remounts the tree on each
    // update. Read the current instance from a ref.
    const chatRef = useRef(chat)
    chatRef.current = chat

    const AppChat = useMemo(() => {
      function AppChatImpl() {
        return <ui.Chat chat={chatRef.current} />
      }
      return AppChatImpl
    }, [])

    return Object.assign(chat, { AppChat }) as ChatUIHost<TOptions> & {
      AppChat: ComponentType
    }
  }

  return {
    useAppChat,
    useChatContext: ui.useChatContext,
  }
}
