import { createMemo, createUniqueId, onCleanup } from 'solid-js'
import { useStore } from '@tanstack/solid-store'
import { ChatClient } from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type { UIMessage, UseChatOptions, UseChatReturn } from './types'

export function useChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: UseChatOptions<TTools> = {} as UseChatOptions<TTools>,
): UseChatReturn<TTools> {
  const hookId = createUniqueId()
  const clientId = options.id || hookId

  // Create ChatClient instance (memoized)
  // The client contains a TanStack Store that we subscribe to for reactivity
  const client = createMemo(() => {
    return new ChatClient<TTools>({
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
  })

  // Subscribe to store with selectors (returns Accessors for fine-grained reactivity)
  // Only re-render when the specific selected value changes
  const messages = useStore(client().store, (state) => state.messages)
  const isLoading = useStore(client().store, (state) => state.isLoading)
  const error = useStore(client().store, (state) => state.error)

  // Cleanup on unmount
  onCleanup(() => {
    client().stop()
  })

  // Note: Callback options (onResponse, onChunk, onFinish, onError, onToolCall)
  // are captured at client creation time. Changes to these callbacks require
  // remounting the component or changing the connection to recreate the client.

  return {
    messages,
    isLoading,
    error,
    sendMessage: async (content: string) => {
      await client().sendMessage(content)
    },
    append: async (message: ModelMessage | UIMessage<TTools>) => {
      await client().append(message)
    },
    reload: async () => {
      await client().reload()
    },
    stop: () => {
      client().stop()
    },
    clear: () => {
      client().clear()
    },
    setMessages: (newMessages: Array<UIMessage<TTools>>) => {
      client().setMessagesManually(newMessages)
    },
    addToolResult: async (result: {
      toolCallId: string
      tool: string
      output: any
      state?: 'output-available' | 'output-error'
      errorText?: string
    }) => {
      await client().addToolResult(result)
    },
    addToolApprovalResponse: async (response: {
      id: string
      approved: boolean
    }) => {
      await client().addToolApprovalResponse(response)
    },
  }
}
