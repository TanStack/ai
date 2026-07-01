import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks'
import type {
  ChatClientState,
  ConnectionStatus,
  InferredClientContext,
} from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'

import type {
  MultimodalContent,
  UIMessage,
  UseChatOptions,
  UseChatReturn,
} from './types'

export function useChat<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = InferredClientContext<TTools>,
>(options: UseChatOptions<TTools, TContext>): UseChatReturn<TTools> {
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
  const activeClientRef = useRef<ChatClient | null>(null)
  const cleanupInvalidationRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const optionsRef = useRef<UseChatOptions<TTools, TContext>>(options)

  optionsRef.current = options

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const client = useMemo(() => {
    const messagesToUse = options.initialMessages || []
    isFirstMountRef.current = false

    // Build options with conditional spreads for fields whose source
    // type is `T | undefined` but the ChatClient target uses a strict
    // optional (`field?: T`) — `exactOptionalPropertyTypes` rejects
    // assigning `undefined` to those, so we omit the key when absent.
    const initialOptions = optionsRef.current
    const transport = initialOptions.connection
      ? { connection: initialOptions.connection }
      : { fetcher: initialOptions.fetcher }

    const instance = new ChatClient<TTools, TContext>({
      devtoolsBridgeFactory: createChatDevtoolsBridge,
      ...transport,
      id: clientId,
      initialMessages: messagesToUse,
      ...(initialOptions.body !== undefined && { body: initialOptions.body }),
      ...(initialOptions.threadId !== undefined && {
        threadId: initialOptions.threadId,
      }),
      ...(initialOptions.forwardedProps !== undefined && {
        forwardedProps: initialOptions.forwardedProps,
      }),
      ...(initialOptions.persistence !== undefined && {
        persistence: initialOptions.persistence,
      }),
      ...(initialOptions.context !== undefined && {
        context: initialOptions.context,
      }),
      devtools: {
        ...initialOptions.devtools,
        framework: 'preact',
        hookName: 'useChat',
        outputKind: initialOptions.outputSchema ? 'structured' : 'chat',
      },
      // Wrap every callback so the latest options are read at call time.
      // Capturing the function reference directly would freeze it to whatever
      // the parent passed on the first render.
      onResponse: (response) => {
        if (activeClientRef.current !== instance) return
        return optionsRef.current.onResponse?.(response)
      },
      onChunk: (chunk) => {
        if (activeClientRef.current !== instance) return
        optionsRef.current.onChunk?.(chunk)
      },
      onFinish: (message) => {
        if (activeClientRef.current !== instance) return
        optionsRef.current.onFinish?.(message)
      },
      onError: (err) => {
        if (activeClientRef.current !== instance) return
        optionsRef.current.onError?.(err)
      },
      onCustomEvent: (eventType, data, context) => {
        if (activeClientRef.current !== instance) return
        optionsRef.current.onCustomEvent?.(eventType, data, context)
      },
      ...(initialOptions.tools !== undefined && {
        tools: initialOptions.tools,
      }),
      ...(options.streamProcessor !== undefined && {
        streamProcessor: options.streamProcessor,
      }),
      onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
        if (activeClientRef.current !== instance) return
        setMessages(newMessages)
      },
      onLoadingChange: (newIsLoading: boolean) => {
        if (activeClientRef.current !== instance) return
        setIsLoading(newIsLoading)
      },
      onStatusChange: (newStatus: ChatClientState) => {
        if (activeClientRef.current !== instance) return
        setStatus(newStatus)
      },
      onErrorChange: (newError: Error | undefined) => {
        if (activeClientRef.current !== instance) return
        setError(newError)
      },
      onSubscriptionChange: (nextIsSubscribed: boolean) => {
        if (activeClientRef.current !== instance) return
        setIsSubscribed(nextIsSubscribed)
      },
      onConnectionStatusChange: (nextStatus: ConnectionStatus) => {
        if (activeClientRef.current !== instance) return
        setConnectionStatus(nextStatus)
      },
      onSessionGeneratingChange: (isGenerating: boolean) => {
        if (activeClientRef.current !== instance) return
        setSessionGenerating(isGenerating)
      },
    })
    activeClientRef.current = instance
    return instance
  }, [clientId])

  useEffect(() => {
    const clientMessages = client.getMessages()
    if (clientMessages !== messagesRef.current) {
      setMessages(clientMessages)
    }
  }, [client])

  // Sync body / forwardedProps changes to the client.
  // Both populate the same wire payload; `forwardedProps` is preferred
  // and `body` is deprecated but still supported.
  useEffect(() => {
    // Conditional spread: `updateOptions` declares strict-optional
    // fields and rejects explicit `undefined` under EOPT.
    client.updateOptions({
      body: options.body,
      ...(options.forwardedProps !== undefined && {
        forwardedProps: options.forwardedProps,
      }),
      context: options.context,
    })
  }, [client, options.body, options.forwardedProps, options.context])

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
    if (cleanupInvalidationRef.current) {
      clearTimeout(cleanupInvalidationRef.current)
      cleanupInvalidationRef.current = null
    }
    activeClientRef.current = client
    client.mountDevtools()

    return () => {
      cleanupInvalidationRef.current = setTimeout(() => {
        if (activeClientRef.current === client) {
          activeClientRef.current = null
        }
        cleanupInvalidationRef.current = null
      }, 0)
      // Subscribe/unsubscribe on `options.live` is owned by the dedicated
      // effect above. This cleanup only fires on unmount or client swap,
      // so read `live` through the ref to avoid disposing the client every
      // time `live` toggles.
      if (optionsRef.current.live) {
        client.unsubscribe()
      } else {
        client.stop()
      }
      client.dispose()
    }
  }, [client])

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
      output: unknown
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

  const renderedMessages = client.getMessages()

  return {
    messages: renderedMessages,
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
