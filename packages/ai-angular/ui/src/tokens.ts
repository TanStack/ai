import { InjectionToken, inject, signal } from '@angular/core'
import type { WritableSignal } from '@angular/core'
import type {
  ChatUIInterrupt,
  ChatUISelectedPart,
} from '@tanstack/ai-client/ui'
import type { InjectChatResult } from '@tanstack/ai-angular'

/**
 * Holder for the active chat instance. Factory components inject this
 * and read `host()`.
 */
export class ChatHostRef {
  readonly host: WritableSignal<InjectChatResult | null> = signal(null)
}

export interface ChatUITokens {
  chatRef: InjectionToken<ChatHostRef>
  part: InjectionToken<ChatUISelectedPart>
  interrupt: InjectionToken<ChatUIInterrupt>
  injectChatContext: () => InjectChatResult
}

/**
 * Create isolated tokens for nested chat trees, or for widgets in other
 * files that cannot import the `createChatHook` result.
 */
export function createChatHookContexts(): ChatUITokens {
  const chatRef = new InjectionToken<ChatHostRef>('ChatUIHostRef')
  const part = new InjectionToken<ChatUISelectedPart>('ChatUIPart')
  const interrupt = new InjectionToken<ChatUIInterrupt>('ChatUIInterrupt')

  function injectChatContext() {
    const ref = inject(chatRef)
    const chat = ref.host()
    if (!chat) {
      throw new Error(
        '`injectChatContext` must be used within `Chat` or `ChatProvider`.',
      )
    }
    return chat
  }

  return { chatRef, part, interrupt, injectChatContext }
}

export const defaultChatUITokens = createChatHookContexts()
