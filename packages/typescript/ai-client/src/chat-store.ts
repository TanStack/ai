import { Store } from '@tanstack/store'
import type { UIMessage } from './types'
import type { AnyClientTool } from '@tanstack/ai'

/**
 * State shape for the chat store
 */
export interface ChatState<TTools extends ReadonlyArray<AnyClientTool> = any> {
  /**
   * Array of all messages in the conversation
   */
  messages: Array<UIMessage<TTools>>

  /**
   * Whether the chat is currently loading (streaming a response)
   */
  isLoading: boolean

  /**
   * Current error state, if any
   */
  error: Error | undefined
}

/**
 * TanStack Store-based state management for chat.
 * This is the core state container used by ChatClient and exposed
 * to framework adapters for reactive updates.
 */
export class ChatStore<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> extends Store<ChatState<TTools>> {
  constructor(initialMessages: Array<UIMessage<TTools>> = []) {
    super({
      messages: initialMessages,
      isLoading: false,
      error: undefined,
    })
  }

  /**
   * Replace all messages
   */
  setMessages(messages: Array<UIMessage<TTools>>): void {
    this.setState((prev) => ({ ...prev, messages }))
  }

  /**
   * Set loading state
   */
  setLoading(isLoading: boolean): void {
    this.setState((prev) => ({ ...prev, isLoading }))
  }

  /**
   * Set error state
   */
  setError(error: Error | undefined): void {
    this.setState((prev) => ({ ...prev, error }))
  }

  /**
   * Add a message to the end of the conversation
   */
  addMessage(message: UIMessage<TTools>): void {
    this.setState((prev) => ({
      ...prev,
      messages: [...prev.messages, message],
    }))
  }

  /**
   * Update a specific message by ID
   */
  updateMessage(
    id: string,
    updater: (msg: UIMessage<TTools>) => UIMessage<TTools>,
  ): void {
    this.setState((prev) => ({
      ...prev,
      messages: prev.messages.map((msg) => (msg.id === id ? updater(msg) : msg)),
    }))
  }

  /**
   * Remove messages after a specific index
   */
  removeMessagesAfter(index: number): void {
    this.setState((prev) => ({
      ...prev,
      messages: prev.messages.slice(0, index + 1),
    }))
  }

  /**
   * Clear all messages and reset error
   */
  clearMessages(): void {
    this.setState((prev) => ({
      ...prev,
      messages: [],
      error: undefined,
    }))
  }
}
