import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChatClient } from '@tanstack/ai-client'
import type { ModelMessage } from '@tanstack/ai'
import type { UIMessage, UseChatOptions, UseChatReturn } from './types'

export function useChat(options: UseChatOptions): UseChatReturn {
  const hookId = useId()
  const clientId = options.id || hookId

  const [messages, setMessages] = useState<Array<UIMessage>>(
    options.initialMessages || [],
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)

  // Track current messages in a ref to preserve them when client is recreated
  const messagesRef = useRef<Array<UIMessage>>(options.initialMessages || [])
  const isFirstMountRef = useRef(true)

  // Update ref whenever messages change
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Create ChatClient instance with callbacks to sync state
  // Note: Options are captured at client creation time.
  // The connection adapter can use functions for dynamic values (url, headers, etc.)
  // which are evaluated lazily on each request.
  const client = useMemo(() => {
    // On first mount, use initialMessages. On subsequent recreations, preserve existing messages.
    const messagesToUse = isFirstMountRef.current
      ? options.initialMessages || []
      : messagesRef.current

    isFirstMountRef.current = false

    return new ChatClient({
      connection: options.connection,
      id: clientId,
      initialMessages: messagesToUse,
      body: options.body,
      onResponse: options.onResponse,
      onChunk: options.onChunk,
      onFinish: options.onFinish,
      onError: options.onError,
      onToolCall: options.onToolCall,
      streamProcessor: options.streamProcessor,
      onMessagesChange: (newMessages: Array<UIMessage>) => {
        setMessages(newMessages)
      },
      onLoadingChange: (newIsLoading: boolean) => {
        setIsLoading(newIsLoading)
      },
      onErrorChange: (newError: Error | undefined) => {
        setError(newError)
      },
    })
    // Only recreate when clientId changes
    // Connection and other options are captured at creation time
  }, [clientId])

  // Sync initial messages on mount only
  // Note: initialMessages are passed to ChatClient constructor, but we also
  // set them here to ensure React state is in sync
  useEffect(() => {
    if (options.initialMessages && options.initialMessages.length > 0) {
      // Only set if current messages are empty (initial state)
      if (messages.length === 0) {
        client.setMessagesManually(options.initialMessages)
      }
    }
  }, []) // Only run on mount - initialMessages are handled by ChatClient constructor

  // Cleanup on unmount: stop any in-flight requests
  useEffect(() => {
    return () => {
      // Stop any active generation when component unmounts
      if (isLoading) {
        client.stop()
      }
    }
  }, [client, isLoading])

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
    (newMessages: Array<UIMessage>) => {
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
