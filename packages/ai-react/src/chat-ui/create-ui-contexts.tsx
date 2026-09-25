import { createContext, useContext } from 'react'
import type { Context } from 'react'
import type {
  ChatUIInterrupt,
  ChatUISelectedPart,
} from '@tanstack/ai-client/ui'
import type { UseChatReturn } from '../types'

/**
 * Scoped chat, part, and interrupt contexts plus matching context hooks.
 * Pass these into {@link createChatHook} when widgets live in other files, or
 * when two chat trees nest and must not share the default contexts.
 */
export interface ChatUIContexts {
  chatContext: Context<UseChatReturn<any, any, any> | null>
  partContext: Context<ChatUISelectedPart | null>
  interruptContext: Context<ChatUIInterrupt | null>
  useChatContext: () => UseChatReturn<any, any, any>
}

/**
 * Create a fresh set of chat UI contexts. This matches Form
 * `createFormHookContexts` and Table `createTableHookContexts`.
 *
 * Most apps can skip this. `createChatHook` uses shared module contexts by
 * default. The hooks on this object are the escape hatch for a widget file
 * that cannot import the `createChatHook` result (circular import), or for
 * nested chats that need isolated providers.
 *
 * Prefer the `useChatContext` hook returned from `createChatHook` when you
 * can import that result. That hook knows the `chatComponents` types. Part
 * and interrupt widgets take `part` / `interrupt` as props.
 */
export function createChatHookContexts(): ChatUIContexts {
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

  return {
    chatContext,
    partContext,
    interruptContext,
    useChatContext,
  }
}

export const defaultChatUIContexts = createChatHookContexts()
