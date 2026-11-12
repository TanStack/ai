import { createContext, useContext } from 'solid-js'
import type { Context } from 'solid-js'
import type {
  ChatUIInterrupt,
  ChatUISelectedPart,
} from '@tanstack/ai-client/ui'
import type { UseChatReturn } from '../types'

export interface ChatUIContexts {
  chatContext: Context<UseChatReturn<any, any, any> | null>
  partContext: Context<ChatUISelectedPart | null>
  interruptContext: Context<ChatUIInterrupt | null>
  useChatContext: () => UseChatReturn<any, any, any>
}

/**
 * Create isolated contexts for widgets in separate files or nested chats.
 * `createChatHook` uses shared contexts unless these are passed in `context`.
 */
export function createChatHookContexts(): ChatUIContexts {
  // Solid 2 treats undefined as no default. Null preserves our actionable
  // missing-provider errors rather than throwing ContextNotFoundError first.
  const chatContext = createContext<UseChatReturn<any, any, any> | null>(null)
  const partContext = createContext<ChatUISelectedPart | null>(null)
  const interruptContext = createContext<ChatUIInterrupt | null>(null)

  function useChatContext() {
    const chat = useContext(chatContext)
    if (!chat) {
      throw new Error(
        '`useChatContext` must be used within `UI.Provider` or `UI.Chat`.',
      )
    }
    return chat
  }

  return { chatContext, partContext, interruptContext, useChatContext }
}

export const defaultChatUIContexts = createChatHookContexts()
