import { ChatClient } from '@tanstack/ai-client'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai'
import type {
  ChatClientState,
  ConnectionStatus,
  StructuredOutputPart,
} from '@tanstack/ai-client'

import type {
  DeepPartial,
  MultimodalContent,
  UIMessage,
  UseChatOptions,
  UseChatReturn,
} from './types'

export function useChat<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
>(options: UseChatOptions<TTools, TSchema>): UseChatReturn<TTools, TSchema> {
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

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  // Track current messages in a ref to preserve them when client is recreated
  const messagesRef = useRef<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isFirstMountRef = useRef(true)

  // Update ref synchronously during render so it's always current when useMemo runs.
  messagesRef.current = messages

  // Track current options in a ref to avoid recreating client when options change
  const optionsRef = useRef<UseChatOptions<TTools, TSchema>>(options)
  optionsRef.current = options

  // Create ChatClient instance with callbacks to sync state
  const client = useMemo(() => {
    const messagesToUse = isFirstMountRef.current
      ? options.initialMessages || []
      : messagesRef.current

    isFirstMountRef.current = false

    return new ChatClient({
      connection: optionsRef.current.connection,
      id: clientId,
      initialMessages: messagesToUse,
      body: optionsRef.current.body,
      forwardedProps: optionsRef.current.forwardedProps,
      onResponse: (response) => optionsRef.current.onResponse?.(response),
      onChunk: (chunk: StreamChunk) => {
        optionsRef.current.onChunk?.(chunk)
      },
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

  useEffect(() => {
    client.updateOptions({
      body: options.body,
      forwardedProps: options.forwardedProps,
    })
  }, [client, options.body, options.forwardedProps])

  useEffect(() => {
    if (options.initialMessages && options.initialMessages.length > 0) {
      if (messages.length === 0) {
        client.setMessagesManually(options.initialMessages)
      }
    }
  }, [])

  useEffect(() => {
    if (options.live) {
      client.subscribe()
    } else {
      client.unsubscribe()
    }
  }, [client, options.live])

  useEffect(() => {
    return () => {
      if (options.live) {
        client.unsubscribe()
      } else {
        client.stop()
      }
    }
  }, [client, options.live])

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

  // `partial` and `final` are derived from the active assistant message's
  // structured-output part. "Active" = the last assistant message whose
  // position in the array is greater than the last user message — that is,
  // the assistant message responding to the most recent user turn. Between
  // sendMessage() and the server's first chunk no such assistant message
  // exists yet, so `partial` reads as `{}` and `final` as `null` without
  // any extra state. During streaming the part's `partial` is the progressive
  // parse; once `structured-output.complete` snaps the part to `complete`,
  // `final` returns the validated `data`. Historical structured responses on
  // earlier assistant messages are not exposed through these (consumers walk
  // `messages` directly for that).
  const activeStructuredPart = useMemo<StructuredOutputPart | null>(() => {
    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user') {
        lastUserIndex = i
        break
      }
    }
    for (let i = messages.length - 1; i > lastUserIndex; i--) {
      const m = messages[i]!
      if (m.role !== 'assistant') continue
      const part = m.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )
      if (part) return part
    }
    return null
  }, [messages])

  const partial = useMemo<Partial>(() => {
    if (!activeStructuredPart) return {} as Partial
    const v = activeStructuredPart.partial ?? activeStructuredPart.data
    return (v ?? {}) as Partial
  }, [activeStructuredPart])

  const final = useMemo<Final | null>(() => {
    if (!activeStructuredPart || activeStructuredPart.status !== 'complete') {
      return null
    }
    return activeStructuredPart.data as Final
  }, [activeStructuredPart])

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
    partial,
    final,
  } as unknown as UseChatReturn<TTools, TSchema>
}
