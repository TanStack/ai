import type { Context } from 'octane'
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

export declare function createChatHookContexts(): ChatUIContexts
export declare const defaultChatUIContexts: ChatUIContexts
