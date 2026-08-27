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

    const initialOptions = optionsRef.current
    const transport = initialOptions.connection
      ? { connection: initialOptions.connection }
      : { fetcher: initialOptions.fetcher }

    const instanceHolder: {
      current: ChatClient<TTools, TContext, TInterrupts> | undefined
    } = { current: undefined }
    const getActiveInstance = () => {
      const currentInstance = instanceHolder.current
      if (!currentInstance) return undefined
      if (activeClientRef.current !== currentInstance) {
        return undefined
      }
      return currentInstance
    }
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
      if (!currentInstance) return
      if (activeClientRef.current !== currentInstance) return
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

  useEffect(() => {
    client.attach()
    return () => {
      client.detach()
    }
  }, [client])

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
    syncResumeState(client)

    return () => {
      cleanupInvalidationRef.current = setTimeout(() => {
        if (activeClientRef.current === client) {
          activeClientRef.current = null
        }
        cleanupInvalidationRef.current = null
      }, 0)
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
