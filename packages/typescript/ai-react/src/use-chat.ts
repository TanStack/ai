import { useCallback, useEffect, useId, useMemo } from 'react'
import { useStore } from '@tanstack/react-store'
import { ChatClient } from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'

import type { UIMessage, UseChatOptions, UseChatReturn } from './types'

export function useChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: UseChatOptions<TTools>,
): UseChatReturn<TTools> {
  const hookId = useId()
  const clientId = options.id || hookId

  // Create ChatClient instance (memoized by clientId)
  // The client contains a TanStack Store that we subscribe to for reactivity
  const client = useMemo(() => {
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
  }, [clientId])

  // Subscribe to store with selectors for optimal re-renders
  // Only re-render when the specific selected value changes
  const messages = useStore(client.store, (state) => state.messages)
  const isLoading = useStore(client.store, (state) => state.isLoading)
  const error = useStore(client.store, (state) => state.error)

  // Cleanup on unmount: stop any in-flight requests
  useEffect(() => {
    return () => {
      // Stop any active generation when component unmounts or client changes
      client.stop()
    }
  }, [client])

  // Note: Callback options (onResponse, onChunk, onFinish, onError, onToolCall)
  // are captured at client creation time. Changes to these callbacks require
  // remounting the component or changing the connection to recreate the client.

  const sendMessage = useCallback(
    async (content: string) => {
      await client.sendMessage(content)
    },
    [client],
  )

  const append = useCallback(
    async (message: ModelMessage | UIMessage) => {
      await client.append(message)
    },
    [client],
  )

  const reload = useCallback(async () => {
    await client.reload()
  }, [client])

  const stop = useCallback(() => {
    client.stop()
  }, [client])

  const clear = useCallback(() => {
    client.clear()
  }, [client])

  const setMessagesManually = useCallback(
    (newMessages: Array<UIMessage<TTools>>) => {
      client.setMessagesManually(newMessages)
    },
    [client],
  )

  const addToolResult = useCallback(
    async (result: {
      toolCallId: string
      tool: string
      output: any
      state?: 'output-available' | 'output-error'
      errorText?: string
    }) => {
      await client.addToolResult(result)
    },
    [client],
  )

  const addToolApprovalResponse = useCallback(
    async (response: { id: string; approved: boolean }) => {
      await client.addToolApprovalResponse(response)
    },
    [client],
  )

  return {
    messages,
    sendMessage,
    append,
    reload,
    stop,
    isLoading,
    error,
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    addToolApprovalResponse,
  }
}
