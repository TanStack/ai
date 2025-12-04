import { writable, derived, get } from 'svelte/store'
import { ChatClient } from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type { UIMessage, UseChatOptions, UseChatReturn } from './types'

/**
 * Svelte hook for chat functionality using stores.
 *
 * This hook wraps the ChatClient from @tanstack/ai-client and exposes
 * reactive state using Svelte stores.
 *
 * @example
 * ```svelte
 * <script>
 *   import { useChat, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const chat = useChat({
 *     connection: fetchServerSentEvents('/api/chat'),
 *   })
 * </script>
 *
 * <div>
 *   {#each $chat.messages as message}
 *     <div>{message.role}: {message.content}</div>
 *   {/each}
 * </div>
 * ```
 */
export function useChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: UseChatOptions<TTools>,
): UseChatReturn<TTools> {
  // Generate a unique ID for this chat instance
  const clientId =
    options.id ||
    `chat-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Create writable stores for reactive state
  const messagesStore = writable<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isLoadingStore = writable<boolean>(false)
  const errorStore = writable<Error | undefined>(undefined)

  // Track if this is the first mount
  let isFirstMount = true

  // Create ChatClient instance
  const client = new ChatClient({
    connection: options.connection,
    id: clientId,
    initialMessages: options.initialMessages,
    body: options.body,
    onResponse: options.onResponse,
    onChunk: options.onChunk,
    onFinish: options.onFinish,
    onError: options.onError,
    tools: options.tools,
    streamProcessor: options.streamProcessor,
    onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
      messagesStore.set(newMessages)
    },
    onLoadingChange: (newIsLoading: boolean) => {
      isLoadingStore.set(newIsLoading)
    },
    onErrorChange: (newError: Error | undefined) => {
      errorStore.set(newError)
    },
  })

  // Sync initial messages on mount only
  if (
    isFirstMount &&
    options.initialMessages &&
    options.initialMessages.length > 0
  ) {
    const currentMessages = get(messagesStore)
    // Only set if current messages are empty (initial state)
    if (currentMessages.length === 0) {
      client.setMessagesManually(options.initialMessages)
    }
    isFirstMount = false
  }

  // Define methods
  const sendMessage = async (content: string) => {
    await client.sendMessage(content)
  }

  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    await client.append(message)
  }

  const reload = async () => {
    await client.reload()
  }

  const stop = () => {
    client.stop()
  }

  const clear = () => {
    client.clear()
  }

  const setMessagesManually = (newMessages: Array<UIMessage<TTools>>) => {
    client.setMessagesManually(newMessages)
  }

  const addToolResult = async (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => {
    await client.addToolResult(result)
  }

  const addToolApprovalResponse = async (response: {
    id: string
    approved: boolean
  }) => {
    await client.addToolApprovalResponse(response)
  }

  // Return the chat interface with stores
  return {
    messages: messagesStore,
    isLoading: isLoadingStore,
    error: errorStore,
    sendMessage,
    append,
    reload,
    stop,
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    addToolApprovalResponse,
  }
}

