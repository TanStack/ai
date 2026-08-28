import { createContext, useContext } from 'react'
import type { Context } from 'react'
import type { ChatUIInterrupt, ChatUISelectedPart } from '@tanstack/ai-client/ui'
import type { UseChatReturn } from '@tanstack/ai-react'

/**
 * Scoped chat, part, and interrupt contexts plus matching context hooks.
 * Pass these into {@link createChatUI} when widgets live in other files, or
 * when two chat trees nest and must not share the default contexts.
 */
export interface ChatUIContexts {
  chatContext: Context<UseChatReturn<any, any, any> | null>
  partContext: Context<ChatUISelectedPart | null>
  interruptContext: Context<ChatUIInterrupt | null>
  useChatContext: () => UseChatReturn<any, any, any>
  usePartContext: () => ChatUISelectedPart
  useInterruptContext: () => ChatUIInterrupt
}

/**
 * Create a fresh set of chat UI contexts. This matches Form
 * `createFormHookContexts` and Table `createTableHookContexts`.
 *
 * Most apps can skip this. `createChatUI` uses shared module contexts by
 * default. Call this when a widget file cannot import the `createChatUI`
 * result (circular import), or when nested chats need isolated providers.
 */
export function createChatUIContexts(): ChatUIContexts {
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

  function usePartContext() {
    const selected = useContext(partContext)
    if (!selected) {
      throw new Error(
        '`usePartContext` must be used within `UI.Part` or an automatic part.',
      )
    }
    return selected
  }

  function useInterruptContext() {
    const interrupt = useContext(interruptContext)
    if (!interrupt) {
      throw new Error(
        '`useInterruptContext` must be used within `UI.Interrupt`.',
      )
    }
    return interrupt
  }

  return {
    chatContext,
    partContext,
    interruptContext,
    useChatContext,
    usePartContext,
    useInterruptContext,
  }
}

export const defaultChatUIContexts = createChatUIContexts()
