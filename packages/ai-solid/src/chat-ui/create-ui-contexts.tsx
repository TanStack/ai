import { createContext, useContext } from 'solid-js'
import type { Context } from 'solid-js'
import type { ChatUIInterrupt, ChatUISelectedPart } from '@tanstack/ai-client/ui'
import type { UseChatReturn } from '../types'

export interface ChatUIContexts {
  chatContext: Context<UseChatReturn<any, any, any> | undefined>
  partContext: Context<ChatUISelectedPart | undefined>
  interruptContext: Context<ChatUIInterrupt | undefined>
  useChatContext: () => UseChatReturn<any, any, any>
}

/**
 * Create a fresh set of chat UI contexts. This matches Form
 * `createFormHookContexts` and Table `createTableHookContexts`.
 *
 * Most apps can skip this. `createChatHook` uses shared module contexts by
 * default. Call this when a widget file cannot import the `createChatHook`
 * result, or when nested chats need isolated providers.
 *
 * Prefer `useChatContext` from `createChatHook` when you can import that
 * result. Part and interrupt widgets take `part` / `interrupt` as props.
 */
export function createChatHookContexts(): ChatUIContexts {
  const chatContext = createContext<UseChatReturn<any, any, any> | undefined>(
    undefined,
  )
  const partContext = createContext<ChatUISelectedPart | undefined>(undefined)
  const interruptContext = createContext<ChatUIInterrupt | undefined>(undefined)

  function useChatContext() {
    const chat = useContext(chatContext)
    if (!chat) {
      throw new Error(
        '`useChatContext` must be used within `UI.Provider` or `UI.Chat`.',
      )
    }
    return chat
  }

  return {
    chatContext,
    partContext,
    interruptContext,
    useChatContext,
  }
}

export const defaultChatUIContexts = createChatHookContexts()
