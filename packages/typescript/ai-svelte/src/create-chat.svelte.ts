import { ChatClient } from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type { CreateChatOptions, CreateChatReturn, UIMessage } from './types'

/**
 * Creates a reactive chat instance for Svelte 5.
 *
 * This function wraps the ChatClient from @tanstack/ai-client and exposes
 * reactive state using Svelte 5 runes. The returned object has reactive
 * getters that automatically update when state changes.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const chat = createChat({
 *     connection: fetchServerSentEvents('/api/chat'),
 *   })
 * </script>
 *
 * <div>
 *   {#each chat.messages as message}
 *     <div>{message.role}: {message.parts[0].content}</div>
 *   {/each}
 *
 *   {#if chat.isLoading}
 *     <button onclick={chat.stop}>Stop</button>
 *   {/if}
 *
 *   <button onclick={() => chat.sendMessage('Hello!')}>Send</button>
 * </div>
 * ```
 */
export function createChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: CreateChatOptions<TTools>,
): CreateChatReturn<TTools> {
  // Generate a unique ID for this chat instance
  const clientId =
    options.id ||
    `chat-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Create reactive state using Svelte 5 runes
  let messages = $state<Array<UIMessage<TTools>>>(options.initialMessages || [])
  let isLoading = $state(false)
  let error = $state<Error | undefined>(undefined)

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
      messages = newMessages
    },
    onLoadingChange: (newIsLoading: boolean) => {
      isLoading = newIsLoading
    },
    onErrorChange: (newError: Error | undefined) => {
      error = newError
    },
  })

  // Note: Cleanup is handled by calling stop() directly when needed.
  // Unlike React/Vue/Solid, Svelte 5 runes like $effect can only be used
  // during component initialization, so we don't add automatic cleanup here.
  // Users should call chat.stop() in their component's cleanup if needed.

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

  const setMessages = (newMessages: Array<UIMessage<TTools>>) => {
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

  const updateBody = (newBody: Record<string, any>) => {
    client.updateOptions({ body: newBody })
  }

  // Return the chat interface with reactive getters
  // Using getters allows Svelte to track reactivity without needing $ prefix
  return {
    get messages() {
      return messages
    },
    get isLoading() {
      return isLoading
    },
    get error() {
      return error
    },
    sendMessage,
    append,
    reload,
    stop,
    setMessages,
    clear,
    addToolResult,
    addToolApprovalResponse,
    updateBody,
  }
}
