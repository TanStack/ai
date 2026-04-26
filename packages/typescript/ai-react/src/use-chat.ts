import { ChatClient } from '@tanstack/ai-client'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type { ChatClientState, ConnectionStatus } from '@tanstack/ai-client'

import type {
  MultimodalContent,
  UIMessage,
  UseChatOptions,
  UseChatReturn,
} from './types'

export function useChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: UseChatOptions<TTools>,
): UseChatReturn<TTools> {
  const hookId = useId()
  const clientId = options.id || hookId

  const [messages, setMessages] = useState<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [status, setStatus] = useState<ChatClientState>('ready')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected')
  const [sessionGenerating, setSessionGenerating] = useState(false)

  // Track current messages in a ref to preserve them when client is recreated
  const messagesRef = useRef<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isFirstMountRef = useRef(true)

  // Update ref synchronously during render so it's always current when useMemo runs.
  // A useEffect here would be async and messagesRef could be stale on client recreation.
  messagesRef.current = messages

  // Track current options in a ref to avoid recreating client when options change
  const optionsRef = useRef<UseChatOptions<TTools>>(options)
  optionsRef.current = options

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
      connection: optionsRef.current.connection,
      id: clientId,
      initialMessages: messagesToUse,
      body: optionsRef.current.body,
      // Wrap every callback so the latest options are read at call time.
      // Capturing the function reference directly would freeze it to whatever
      // the parent passed on the first render.
      onResponse: (response) => optionsRef.current.onResponse?.(response),
      onChunk: (chunk) => optionsRef.current.onChunk?.(chunk),
      onFinish: (message: UIMessage<TTools>) => {
        optionsRef.current.onFinish?.(message)
      },
      onError: (error: Error) => {
        optionsRef.current.onError?.(error)
      },
      tools: optionsRef.current.tools,
      onCustomEvent: (eventType, data, context) =>
        optionsRef.current.onCustomEvent?.(eventType, data, context),
      streamProcessor: options.streamProcessor,
      onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
        setMessages(newMessages)
      },
      onLoadingChange: (newIsLoading: boolean) => {
        setIsLoading(newIsLoading)
      },
      onErrorChange: (newError: Error | undefined) => {
        setError(newError)
      },
      onStatusChange: (status: ChatClientState) => {
        setStatus(status)
      },
      onSubscriptionChange: (nextIsSubscribed: boolean) => {
        setIsSubscribed(nextIsSubscribed)
      },
      onConnectionStatusChange: (nextStatus: ConnectionStatus) => {
        setConnectionStatus(nextStatus)
      },
      onSessionGeneratingChange: (isGenerating: boolean) => {
        setSessionGenerating(isGenerating)
      },
    })
  }, [clientId])

  // Sync body changes to the client
  // This allows dynamic body values (like model selection) to be updated without recreating the client
  useEffect(() => {
    client.updateOptions({ body: options.body })
  }, [client, options.body])

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

  // Keep connection lifecycle opt-in and explicit.
  useEffect(() => {
    if (options.live) {
      client.subscribe()
    } else {
      client.unsubscribe()
    }
  }, [client, options.live])

  // Cleanup on unmount: stop any in-flight requests
  // Note: We only cleanup when client changes or component unmounts.
  // DO NOT include isLoading in dependencies - that would cause the cleanup
  // to run when isLoading changes, aborting continuation requests.
  useEffect(() => {
    return () => {
      // live mode owns the connection lifecycle; non-live keeps request-only stop.
      if (options.live) {
        client.unsubscribe()
      } else {
        client.stop()
      }
    }
  }, [client, options.live])

  // All callback options are read through optionsRef at call time, so fresh
  // closures from each render are picked up without recreating the client.

  const sendMessage = useCallback(
    async (content: string | MultimodalContent) => {
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
    status,
    isSubscribed,
    connectionStatus,
    sessionGenerating,
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    addToolApprovalResponse,
  }
}
