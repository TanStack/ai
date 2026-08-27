import { inject } from 'vue'
import type { UseChatReturn } from '@tanstack/ai-vue'
import type { InjectionKey } from 'vue'

export const CHAT_KEY = Symbol() as InjectionKey<UseChatReturn>

/**
 * @deprecated Use `createChatUI()` from `@tanstack/ai-vue-ui`. Deprecated in 0.3.0. Removed in 1.0.0.
 * Composable to access chat context
 * @throws Error if used outside of Chat component
 */
export function useChatContext(): UseChatReturn {
  const context = inject(CHAT_KEY)
  if (!context) {
    throw new Error(
      "Chat components must be wrapped in <Chat>. Make sure you're using Chat.Messages, Chat.Input, etc. inside a <Chat> component.",
    )
  }
  return context
}
