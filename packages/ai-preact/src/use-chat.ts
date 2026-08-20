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
  ResolvableChatInterrupt,
  ChatInterruptState,
  ChatResumeState,
  ConnectionStatus,
  InferredClientContext,
  QueuedMessage,
  SendMessageOptions,
} from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InterruptDefinition,
  ModelMessage,
  RunAgentResumeItem,
} from '@tanstack/ai'

import type {
  MultimodalContent,
  UIMessage,
  UseChatOptions,
  UseChatReturn,
} from './types'

const EMPTY_INTERRUPTS = Object.freeze([])
const EMPTY_INTERRUPT_ERRORS = Object.freeze([])

export function useChat<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
>(
  options: UseChatOptions<TTools, TContext, TInterrupts>,
): UseChatReturn<TTools, TInterrupts> {
  // The hook's identity is its `threadId`. Reload with the same `threadId`
  // restores the same conversation. `hookId` is only a recreation key when no
  // `threadId` is given. It is never sent on the wire.
  const hookId = useId()
  const clientId = options.threadId ?? hookId

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
  const [queue, setQueue] = useState<Array<QueuedMessage>>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [interruptState, setInterruptState] = useState<
    ChatInterruptState<TTools, TInterrupts>
  >(() => ({
    interrupts: EMPTY_INTERRUPTS,
    pendingInterrupts: EMPTY_INTERRUPTS,
    interruptErrors: EMPTY_INTERRUPT_ERRORS,
    resuming: false,
  }))

  // Track current messages in a ref to preserve them when client is recreated
  const messagesRef = useRef<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isFirstMountRef = useRef(true)
  const activeClientRef = useRef<ChatClient | null>(null)
  const cleanupInvalidationRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const cleanupDisposalRef = useRef<{
    client: ChatClient
    timeout: ReturnType<typeof setTimeout>
  } | null>(null)
  const optionsRef =
    useRef<UseChatOptions<TTools, TContext, TInterrupts>>(options)

  optionsRef.current = options

  const syncResumeState = useCallback((target: ChatClient | null) => {
    if (!target) return
    setRunId(target.getCurrentRunId())
    setInterruptState(target.getInterruptState())
  }, [])

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const { client, initialization } = useMemo(() => {
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

    const instanceHolder: {
      current: ChatClient<TTools, TContext, TInterrupts> | undefined
    } = { current: undefined }
    const getActiveInstance = () => {
      const currentInstance = instanceHolder.current
      if (!currentInstance || activeClientRef.current !== currentInstance) {
        return undefined
      }
      return currentInstance
    }
    // ChatClient may publish while its constructor is running or while async
    // persistence resolves before commit. Preserve those exact notifications
    // until this render commits; invoking them here would run state setters and
    // user callbacks for a render that may never mount.
    const initializationState = {
      ready: false,
      callbacks: [] as Array<() => void>,
    }
    const runOrQueueForActiveInstance = (callback: () => void) => {
      if (!initializationState.ready) {
        initializationState.callbacks.push(callback)
        return
      }
      const currentInstance = instanceHolder.current
      if (!currentInstance || activeClientRef.current !== currentInstance)
        return
      callback()
    }
    const instance = new ChatClient<TTools, TContext, TInterrupts>({
      devtoolsBridgeFactory: createChatDevtoolsBridge,
      ...transport,
      initialMessages: messagesToUse,
      ...(initialOptions.body !== undefined && { body: initialOptions.body }),
      ...(typeof initialOptions.threadId === 'string' &&
      initialOptions.persistence
        ? {
            persistence: initialOptions.persistence,
            threadId: initialOptions.threadId,
          }
        : {
            ...(initialOptions.threadId !== undefined && {
              threadId: initialOptions.threadId,
            }),
          }),
      ...(initialOptions.forwardedProps !== undefined && {
        forwardedProps: initialOptions.forwardedProps,
      }),
      ...(initialOptions.byok !== undefined && { byok: initialOptions.byok }),
      byokProvider: () => optionsRef.current.byokProvider?.(),
      ...(initialOptions.initialResumeSnapshot !== undefined && {
        initialResumeSnapshot: initialOptions.initialResumeSnapshot,
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
        if (!getActiveInstance()) return
        return optionsRef.current.onResponse?.(response)
      },
      onChunk: (chunk) => {
        runOrQueueForActiveInstance(() => {
          optionsRef.current.onChunk?.(chunk)
        })
      },
      onFinish: (message) => {
        runOrQueueForActiveInstance(() => {
          optionsRef.current.onFinish?.(message)
        })
      },
      onError: (err) => {
        runOrQueueForActiveInstance(() => {
          optionsRef.current.onError?.(err)
        })
      },
      onCustomEvent: (eventType, data, context) => {
        runOrQueueForActiveInstance(() => {
          optionsRef.current.onCustomEvent?.(eventType, data, context)
        })
      },
      ...(initialOptions.tools !== undefined && {
        tools: initialOptions.tools,
      }),
      ...(initialOptions.interrupts !== undefined && {
        interrupts: initialOptions.interrupts,
      }),
      ...(options.streamProcessor !== undefined && {
        streamProcessor: options.streamProcessor,
      }),
      onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
        runOrQueueForActiveInstance(() => {
          setMessages(newMessages)
        })
      },
      onLoadingChange: (newIsLoading: boolean) => {
        runOrQueueForActiveInstance(() => {
          const currentInstance = getActiveInstance()
          if (!currentInstance) return
          setIsLoading(newIsLoading)
          syncResumeState(currentInstance)
        })
      },
      onStatusChange: (newStatus: ChatClientState) => {
        runOrQueueForActiveInstance(() => {
          setStatus(newStatus)
        })
      },
      onErrorChange: (newError: Error | undefined) => {
        runOrQueueForActiveInstance(() => {
          setError(newError)
        })
      },
      onSubscriptionChange: (nextIsSubscribed: boolean) => {
        runOrQueueForActiveInstance(() => {
          setIsSubscribed(nextIsSubscribed)
        })
      },
      onConnectionStatusChange: (nextStatus: ConnectionStatus) => {
        runOrQueueForActiveInstance(() => {
          setConnectionStatus(nextStatus)
        })
      },
      onSessionGeneratingChange: (isGenerating: boolean) => {
        runOrQueueForActiveInstance(() => {
          setSessionGenerating(isGenerating)
        })
      },
      ...(optionsRef.current.queue !== undefined && {
        queue: optionsRef.current.queue,
      }),
      onQueueChange: (nextQueue: Array<QueuedMessage>) => {
        runOrQueueForActiveInstance(() => {
          setQueue(nextQueue)
        })
      },
      onRunIdChange: (nextRunId) => {
        runOrQueueForActiveInstance(() => {
          setRunId(nextRunId)
        })
      },
      onResumeStateChange: (_nextResumeState, nextPendingInterrupts) => {
        runOrQueueForActiveInstance(() => {
          setInterruptState((current) => ({
            ...current,
            interrupts: nextPendingInterrupts,
            pendingInterrupts: nextPendingInterrupts,
          }))
        })
      },
      onInterruptStateChange: (nextInterruptState, context) => {
        runOrQueueForActiveInstance(() => {
          setInterruptState(nextInterruptState)
          optionsRef.current.onInterruptStateChange?.(
            nextInterruptState,
            context,
          )
        })
      },
    })
    instanceHolder.current = instance
    return { client: instance, initialization: initializationState }
  }, [clientId, syncResumeState])

  useEffect(() => {
    activeClientRef.current = client
    try {
      // Keep initialization closed while draining so callbacks published by a
      // queued callback are appended and delivered in the same commit.
      while (initialization.callbacks.length > 0) {
        if (activeClientRef.current !== client) {
          initialization.callbacks.length = 0
          break
        }
        initialization.callbacks.shift()?.()
      }
    } finally {
      // A throw from a queued user callback must not leave the queue closed.
      initialization.ready = true
    }
  }, [client, initialization])

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
      ...(options.queue !== undefined && { queue: options.queue }),
    })
  }, [
    client,
    options.body,
    options.forwardedProps,
    options.context,
    options.queue,
  ])

  useEffect(() => {
    if (options.live) {
      client.subscribe()
    } else {
      client.unsubscribe()
    }
  }, [client, options.live])

  // ONLY THE VIEW ON SCREEN HOLDS A STREAM. See the same effect in
  // `@tanstack/ai-react`. A page can own many chats and a browser allows only ~6
  // connections per origin, so one long-lived stream per chat starves everything
  // else once a handful of views have been open. `attach` is idempotent and
  // `detach` keeps the transcript and the resume pointer, so a remount picks the
  // run straight back up from the durable log.
  //
  // Immediate, unlike the deferred disposal below, which a remount can skip —
  // correct for disposal, useless for a connection.
  useEffect(() => {
    client.attach()
    return () => {
      client.detach()
    }
  }, [client])

  // Cleanup on unmount: stop any in-flight requests
  // Note: We only cleanup when client changes or component unmounts.
  // DO NOT include isLoading in dependencies - that would cause the cleanup
  // to run when isLoading changes, aborting continuation requests.
  useEffect(() => {
    if (cleanupDisposalRef.current?.client === client) {
      clearTimeout(cleanupDisposalRef.current.timeout)
      cleanupDisposalRef.current = null
    }
    if (cleanupInvalidationRef.current) {
      clearTimeout(cleanupInvalidationRef.current)
      cleanupInvalidationRef.current = null
    }
    client.mountDevtools()
    // Delivery-durability resume is transparent: the resumable SSE connection
    // adapter reattaches via the browser's native Last-Event-ID on reconnect.
    // We only seed interrupt (state) resume from the client here.
    syncResumeState(client)

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
  }, [client, syncResumeState])

  // All callback options are read through optionsRef at call time, so fresh
  // closures from each render are picked up without recreating the client.
  const sendMessage = useCallback(
    async (
      content: string | MultimodalContent,
      sendOptions?: SendMessageOptions,
    ) => {
      try {
        await client.sendMessage(content, undefined, sendOptions)
      } finally {
        syncResumeState(client)
      }
    },
    [client, syncResumeState],
  )

  const cancelQueued = useCallback(
    (id: string) => {
      client.cancelQueued(id)
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
      syncResumeState(client)
    },
    [client, syncResumeState],
  )

  const resumeInterrupts = useCallback(
    async (resumeItems: Array<RunAgentResumeItem>, state?: ChatResumeState) => {
      const result = await client.resumeInterrupts(resumeItems, state)
      syncResumeState(client)
      return result
    },
    [client, syncResumeState],
  )

  const resolveInterrupts = useCallback(
    (
      resolution:
        | boolean
        | ((
            interrupt: ResolvableChatInterrupt<TTools, TInterrupts>,
          ) => undefined),
    ) => {
      if (typeof resolution === 'boolean') {
        client.resolveInterrupts(resolution)
      } else {
        client.resolveInterrupts(resolution)
      }
    },
    [client],
  )

  const cancelInterrupts = useCallback(() => {
    client.cancelInterrupts()
  }, [client])

  const retryInterrupts = useCallback(() => {
    client.retryInterrupts()
  }, [client])

  const resumeInterruptsUnsafe = useCallback(
    (resumeItems: Array<RunAgentResumeItem>, state?: ChatResumeState) =>
      client.resumeInterruptsUnsafe(resumeItems, state),
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
    queue,
    cancelQueued,
    runId,
    interrupts: interruptState.interrupts,
    pendingInterrupts: interruptState.pendingInterrupts,
    interruptErrors: interruptState.interruptErrors,
    resuming: interruptState.resuming,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
    resumeInterrupts,
  }
}
