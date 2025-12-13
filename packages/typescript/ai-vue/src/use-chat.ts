import { computed, onBeforeUnmount } from 'vue'
import { useStore } from '@tanstack/vue-store'
import { ChatClient } from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type { UIMessage, UseChatOptions, UseChatReturn } from './types'

let clientIdCounter = 0
function generateClientId() {
  return `vue-chat-${++clientIdCounter}`
}

export function useChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: UseChatOptions<TTools> = {} as UseChatOptions<TTools>,
): UseChatReturn<TTools> {
  const clientId = options.id || generateClientId()

  // Create ChatClient instance
  // The client contains a TanStack Store that we subscribe to for reactivity
  const client = new ChatClient<TTools>({
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
  })

  // Subscribe to store with selectors (returns readonly Refs for reactivity)
  // Only re-render when the specific selected value changes
  const messages = useStore(client.store, (state) => state.messages)
  const isLoading = useStore(client.store, (state) => state.isLoading)
  const error = useStore(client.store, (state) => state.error)

  // Cleanup on unmount
  onBeforeUnmount(() => {
    client.stop()
  })

  // Note: Callback options (onResponse, onChunk, onFinish, onError, onToolCall)
  // are captured at client creation time. Changes to these callbacks require
  // remounting the component or changing the connection to recreate the client.

  return {
    messages,
    isLoading,
    error,
    sendMessage: async (content: string) => {
      await client.sendMessage(content)
    },
    append: async (message: ModelMessage | UIMessage<TTools>) => {
      await client.append(message)
    },
    reload: async () => {
      await client.reload()
    },
    stop: () => {
      client.stop()
    },
    clear: () => {
      client.clear()
    },
    setMessages: (newMessages: Array<UIMessage<TTools>>) => {
      client.setMessagesManually(newMessages)
    },
    addToolResult: async (result: {
      toolCallId: string
      tool: string
      output: any
      state?: 'output-available' | 'output-error'
      errorText?: string
    }) => {
      await client.addToolResult(result)
    },
    addToolApprovalResponse: async (response: {
      id: string
      approved: boolean
    }) => {
      await client.addToolApprovalResponse(response)
    },
  }
}
