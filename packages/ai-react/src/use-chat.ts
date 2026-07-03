import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai/client'
import type {
  ChatClientState,
  ChatPendingInterrupt,
  ChatResumeState,
  ConnectionStatus,
  InferredClientContext,
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
  TContext = InferredClientContext<TTools>,
>(
  options: UseChatOptions<TTools, TSchema, TContext>,
): UseChatReturn<TTools, TSchema> {
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
  const [resumeState, setResumeState] = useState<ChatResumeState | null>(
    options.initialResumeSnapshot?.resumeState ?? null,
  )
  const [pendingInterrupts, setPendingInterrupts] = useState<
    Array<ChatPendingInterrupt>
  >(options.initialResumeSnapshot?.pendingInterrupts ?? [])

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  // Track current messages in a ref to preserve them when client is recreated
  const messagesRef = useRef<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isFirstMountRef = useRef(true)
  const activeClientRef = useRef<ChatClient | null>(null)
  const lifecycleOwnedClientRef = useRef<ChatClient | null>(null)
  const lifecycleAutoResumeArmedRef = useRef(false)
  const cleanupInvalidationRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const cleanupDisposalRef = useRef<{
    client: ChatClient
    timeout: ReturnType<typeof setTimeout>
  } | null>(null)

  // Update ref synchronously during render so it's always current when useMemo runs.
  messagesRef.current = messages

  // Track current options in a ref to avoid recreating client when options change
  const optionsRef = useRef<UseChatOptions<TTools, TSchema, TContext>>(options)
  optionsRef.current = options

  const syncResumeState = useCallback((target: ChatClient | null) => {
    if (!target) return
    setResumeState(target.getResumeState())
    setPendingInterrupts(target.getPendingInterrupts())
  }, [])

  const isLifecycleOwnedClient = useCallback((target: ChatClient) => {
    return (
      activeClientRef.current === target &&
      lifecycleOwnedClientRef.current === target
    )
  }, [])

  const resumeIfLifecycleOwned = useCallback(
    (target: ChatClient) => {
      if (!isLifecycleOwnedClient(target)) return
      if (!lifecycleAutoResumeArmedRef.current) return
      if (typeof window === 'undefined') return
      void target.maybeAutoResume().then(
        () => {
          if (!isLifecycleOwnedClient(target)) return
          if (!lifecycleAutoResumeArmedRef.current) return
          syncResumeState(target)
        },
        () => {
          if (!isLifecycleOwnedClient(target)) return
          if (!lifecycleAutoResumeArmedRef.current) return
          syncResumeState(target)
        },
      )
    },
    [isLifecycleOwnedClient, syncResumeState],
  )

  // Create ChatClient instance with callbacks to sync state
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
      ...(initialOptions.initialResumeSnapshot !== undefined && {
        initialResumeSnapshot: initialOptions.initialResumeSnapshot,
      }),
      ...(initialOptions.context !== undefined && {
        context: initialOptions.context,
      }),
      devtools: {
        ...initialOptions.devtools,
        framework: 'react',
        hookName: 'useChat',
        outputKind: initialOptions.outputSchema ? 'structured' : 'chat',
      },
      onResponse: (response) => {
        if (activeClientRef.current !== instance) return
        void optionsRef.current.onResponse?.(response)
      },
      onChunk: (chunk: StreamChunk) => {
        if (activeClientRef.current !== instance) return
        optionsRef.current.onChunk?.(chunk)
      },
      onFinish: (message: UIMessage<TTools>) => {
        if (activeClientRef.current !== instance) return
        optionsRef.current.onFinish?.(message)
      },
      onError: (error: Error) => {
        if (activeClientRef.current !== instance) return
        optionsRef.current.onError?.(error)
      },
      ...(initialOptions.tools !== undefined && {
        tools: initialOptions.tools,
      }),
      onCustomEvent: (eventType, data, context) => {
        if (activeClientRef.current !== instance) return
        optionsRef.current.onCustomEvent?.(eventType, data, context)
      },
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
        syncResumeState(instance)
      },
      onErrorChange: (newError: Error | undefined) => {
        if (activeClientRef.current !== instance) return
        setError(newError)
      },
      onStatusChange: (status: ChatClientState) => {
        if (activeClientRef.current !== instance) return
        setStatus(status)
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
      onResumeStateChange: (nextResumeState, nextPendingInterrupts) => {
        if (activeClientRef.current !== instance) return
        setResumeState(nextResumeState)
        setPendingInterrupts(nextPendingInterrupts)
        resumeIfLifecycleOwned(instance)
      },
    })
    activeClientRef.current = instance
    return instance
  }, [clientId, resumeIfLifecycleOwned, syncResumeState])

  useEffect(() => {
    const clientMessages = client.getMessages()
    if (clientMessages !== messagesRef.current) {
      setMessages(clientMessages)
    }
  }, [client])

  // Sync each wire-payload slot in its own effect so an unrelated option
  // changing doesn't re-run the others. `updateOptions` declares strict-optional
  // fields and rejects explicit `undefined` under EOPT, so guard the optional
  // slots before passing them.
  useEffect(() => {
    client.updateOptions({ body: options.body })
  }, [client, options.body])

  useEffect(() => {
    if (options.forwardedProps !== undefined) {
      client.updateOptions({ forwardedProps: options.forwardedProps })
    }
  }, [client, options.forwardedProps])

  useEffect(() => {
    if (options.tools !== undefined) {
      client.updateOptions({ tools: options.tools })
    }
  }, [client, options.tools])

  useEffect(() => {
    client.updateOptions({ context: options.context })
  }, [client, options.context])

  useEffect(() => {
    if (options.live) {
      client.subscribe()
    } else {
      client.unsubscribe()
    }
  }, [client, options.live])

  useEffect(() => {
    if (cleanupDisposalRef.current?.client === client) {
      clearTimeout(cleanupDisposalRef.current.timeout)
      cleanupDisposalRef.current = null
    }
    if (cleanupInvalidationRef.current) {
      clearTimeout(cleanupInvalidationRef.current)
      cleanupInvalidationRef.current = null
    }
    activeClientRef.current = client
    lifecycleOwnedClientRef.current = client
    lifecycleAutoResumeArmedRef.current = false
    client.mountDevtools()
    void client.maybeAutoResume().then(
      () => {
        if (!isLifecycleOwnedClient(client)) return
        syncResumeState(client)
        lifecycleAutoResumeArmedRef.current = true
      },
      () => {
        if (!isLifecycleOwnedClient(client)) return
        syncResumeState(client)
        lifecycleAutoResumeArmedRef.current = true
      },
    )

    const handleOnline = () => {
      resumeIfLifecycleOwned(client)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
      }
      if (lifecycleOwnedClientRef.current === client) {
        lifecycleOwnedClientRef.current = null
      }
      lifecycleAutoResumeArmedRef.current = false
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
      const disposal = {
        client,
        timeout: setTimeout(() => {
          client.dispose()
          if (cleanupDisposalRef.current === disposal) {
            cleanupDisposalRef.current = null
          }
        }, 0),
      }
      cleanupDisposalRef.current = disposal
    }
  }, [client, isLifecycleOwnedClient, resumeIfLifecycleOwned, syncResumeState])

  const sendMessage = useCallback(
    async (content: string | MultimodalContent) => {
      try {
        await client.sendMessage(content)
      } finally {
        syncResumeState(client)
      }
    },
    [client, syncResumeState],
  )

  const append = useCallback(
    async (message: ModelMessage | UIMessage) => {
      try {
        await client.append(message)
      } finally {
        syncResumeState(client)
      }
    },
    [client, syncResumeState],
  )

  const reload = useCallback(async () => {
    try {
      await client.reload()
    } finally {
      syncResumeState(client)
    }
  }, [client, syncResumeState])

  const stop = useCallback(() => {
    client.stop()
  }, [client])

  const clear = useCallback(() => {
    client.clear()
    syncResumeState(client)
  }, [client, syncResumeState])

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
      syncResumeState(client)
    },
    [client, syncResumeState],
  )

  const resume = useCallback(
    async (state?: ChatResumeState) => {
      const result = await client.resume(state ?? undefined)
      syncResumeState(client)
      return result
    },
    [client, syncResumeState],
  )

  const resumeInterrupts = useCallback(
    async (resumeItems: Array<RunAgentResumeItem>, state?: ChatResumeState) => {
      const result = await client.resumeInterrupts(
        resumeItems,
        state ?? undefined,
      )
      syncResumeState(client)
      return result
    },
    [client, syncResumeState],
  )

  // The "active" structured-output part is the one on the assistant message
  // that follows the latest user message. No such message exists between
  // sendMessage() and the first chunk, so partial/final naturally read as
  // cleared. Historical parts on earlier assistant messages remain available
  // via `messages` directly.
  //
  // When there is NO user message yet (e.g. `initialMessages` contains only
  // a stale assistant turn or a system prompt) we deliberately return null
  // rather than scanning historical assistants — otherwise a `final` from a
  // previous session would leak into the hook value on first render.
  const renderedMessages = client.getMessages()

  const activeStructuredPart = useMemo<StructuredOutputPart | null>(() => {
    let lastUserIndex = -1
    for (let i = renderedMessages.length - 1; i >= 0; i--) {
      if (renderedMessages[i]?.role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex === -1) return null
    for (let i = renderedMessages.length - 1; i > lastUserIndex; i--) {
      const m = renderedMessages[i]
      if (m?.role !== 'assistant') continue
      const part = m.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )
      if (part) return part
    }
    return null
  }, [renderedMessages])

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

  // The runtime shape unconditionally exposes partial/final; the public
  // return type hides them when no outputSchema was supplied. TS can't
  // structurally narrow across that conditional, so the `as` is the seam.
  // eslint-disable-next-line no-restricted-syntax -- hook return shape diverges from generic UseChatReturn<TTools, TSchema> due to conditional type on TSchema; TS can't structurally narrow
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
    resumeState,
    pendingInterrupts,
    resume,
    resumeInterrupts,
    partial,
    final,
  } as unknown as UseChatReturn<TTools, TSchema>
}
