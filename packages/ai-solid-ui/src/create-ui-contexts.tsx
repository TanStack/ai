import { createContext, useContext } from 'solid-js'
import type { Context } from 'solid-js'
import type { ChatUIInterrupt, ChatUISelectedPart } from '@tanstack/ai-client/ui'
import type { UseChatReturn } from '@tanstack/ai-solid'

export interface ChatUIContexts {
  chatContext: Context<UseChatReturn<any, any, any> | undefined>
  partContext: Context<ChatUISelectedPart | undefined>
  interruptContext: Context<ChatUIInterrupt | undefined>
  useChatContext: () => UseChatReturn<any, any, any>
  usePartContext: () => ChatUISelectedPart
  useInterruptContext: () => ChatUIInterrupt
}

/**
 * Create a fresh set of chat UI contexts. This matches Form
 * `createFormHookContexts` and Table `createTableHookContexts`.
 */
export function createChatUIContexts(): ChatUIContexts {
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
