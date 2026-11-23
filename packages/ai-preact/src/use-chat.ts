import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { useSyncExternalStore } from 'preact/compat'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import type {
  ResolvableChatInterrupt,
  ChatResumeState,
  InferredClientContext,
  SendMessageOptions,
} from '@tanstack/ai-client'
import type {
  AnyActivityTypeDefinition,
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

export function useChat<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
  const TActivities extends ReadonlyArray<AnyActivityTypeDefinition> =
    readonly [],
>(
  options: UseChatOptions<TTools, TContext, TInterrupts, TActivities>,
): UseChatReturn<TTools, TInterrupts, TActivities> {
  // The hook's identity is its `threadId`. Reload with the same `threadId`
  // restores the same conversation.
  const clientId = options.threadId

  // Typed activity messages do not fit a plain `ChatClient`.
  const subscribedClientRef = useRef<ChatClient<any, any, any, any> | null>(
    null,
  )
  const activeClientRef = useRef<ChatClient<any, any, any, any> | null>(null)
  const cleanupInvalidationRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const cleanupDisposalRef = useRef<{
    client: ChatClient<any, any, any, any>
    timeout: ReturnType<typeof setTimeout>
  } | null>(null)
  const optionsRef =
    useRef<UseChatOptions<TTools, TContext, TInterrupts, TActivities>>(options)

  optionsRef.current = options

  const { client, initialization } = useMemo(() => {
    const messagesToUse = options.initialMessages || []

    // Build options with conditional spreads for fields whose source
    // type is `T | undefined` but the ChatClient target uses a strict
    // optional (`field?: T`) — `exactOptionalPropertyTypes` rejects
    // assigning `undefined` to those, so we omit the key when absent.
    const initialOptions = optionsRef.current
    const transport = initialOptions.connection
      ? { connection: initialOptions.connection }
      : { fetcher: initialOptions.fetcher }

    const instanceHolder: {
      current:
        | ChatClient<TTools, TContext, TInterrupts, TActivities>
        | undefined
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
    const instance = new ChatClient<TTools, TContext, TInterrupts, TActivities>(
      {
        devtoolsBridgeFactory: createChatDevtoolsBridge,
        ...transport,
        initialMessages: messagesToUse,
        threadId: initialOptions.threadId,
        ...(initialOptions.outputSchema !== undefined && {
          outputSchema: initialOptions.outputSchema,
        }),
        ...(initialOptions.persistence === true
          ? {
              persistence: true,
              ...(initialOptions.history !== undefined && {
                history: initialOptions.history,
              }),
            }
          : { persistence: initialOptions.persistence }),
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
        ...(optionsRef.current.queue !== undefined && {
          queue: optionsRef.current.queue,
        }),
        onInterruptStateChange: (nextInterruptState, context) => {
          runOrQueueForActiveInstance(() => {
            optionsRef.current.onInterruptStateChange?.(
              nextInterruptState,
              context,
            )
          })
        },
      },
    )
    instanceHolder.current = instance
    return { client: instance, initialization: initializationState }
  }, [clientId])

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

  const snapshot = useSyncExternalStore(
    client.subscribeSnapshot,
    client.getSnapshot,
  )

  // Sync forwardedProps changes to the client.
  useEffect(() => {
    // Conditional spread: `updateOptions` declares strict-optional
    // fields and rejects explicit `undefined` under EOPT.
    client.updateOptions({
      ...(options.forwardedProps !== undefined && {
        forwardedProps: options.forwardedProps,
      }),
      context: options.context,
      ...(options.queue !== undefined && { queue: options.queue }),
    })
  }, [client, options.forwardedProps, options.context, options.queue])

  useEffect(() => {
    if (options.tools !== undefined) {
      client.updateOptions({ tools: options.tools })
    }
  }, [client, options.tools])

  useEffect(() => {
    if (options.live) {
      client.subscribe()
      subscribedClientRef.current = client
    } else if (subscribedClientRef.current === client) {
      client.unsubscribe()
      subscribedClientRef.current = null
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

  // Cleanup on unmount or client swap: detach happened synchronously above,
  // and deferred disposal tears down the client without calling `stop()` so
  // durable runs and pending interrupts survive navigation and thread switches.
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

    return () => {
      cleanupInvalidationRef.current = setTimeout(() => {
        if (activeClientRef.current === client) {
          activeClientRef.current = null
        }
        cleanupInvalidationRef.current = null
      }, 0)
      const disposal = {
        client,
        timeout: setTimeout(() => {
          if (subscribedClientRef.current === client) {
            client.unsubscribe()
            subscribedClientRef.current = null
          }
          client.dispose()
          if (cleanupDisposalRef.current === disposal) {
            cleanupDisposalRef.current = null
          }
        }, 0),
      }
      cleanupDisposalRef.current = disposal
    }
  }, [client])

  // All callback options are read through optionsRef at call time, so fresh
  // closures from each render are picked up without recreating the client.
  const sendMessage = useCallback(
    async (
      content: string | MultimodalContent,
      sendOptions?: SendMessageOptions,
    ) => {
      await client.sendMessage(content, undefined, sendOptions)
    },
    [client],
  )

  const cancelQueued = useCallback(
    (id: string) => {
      client.cancelQueued(id)
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

  const loadOlderMessages = useCallback(async () => {
    await client.loadOlderMessages()
  }, [client])

  const stop = useCallback(() => {
    client.stop()
  }, [client])

  const clear = useCallback(() => {
    client.clear()
  }, [client])

  const setMessagesManually = useCallback(
    (newMessages: ReadonlyArray<UIMessage<TTools>>) => {
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

  const respondToSandboxApproval = useCallback(
    (approvalId: string, granted: boolean) =>
      client.respondToSandboxApproval(approvalId, granted),
    [client],
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

  const renderedMessages = snapshot.messages

  return {
    messages: renderedMessages,
    sendMessage,
    append,
    reload,
    stop,
    isLoading: snapshot.isLoading,
    hasOlderMessages: snapshot.hasOlderMessages,
    loadOlderMessages,
    error: snapshot.error,
    status: snapshot.status,
    isSubscribed: snapshot.isSubscribed,
    connectionStatus: snapshot.connectionStatus,
    sessionGenerating: snapshot.sessionGenerating,
    isHydrating: snapshot.isHydrating,
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    respondToSandboxApproval,
    queue: snapshot.queue,
    cancelQueued,
    runId: snapshot.runId,
    interrupts: snapshot.interruptState.interrupts,
    interruptErrors: snapshot.interruptState.interruptErrors,
    resuming: snapshot.interruptState.resuming,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
  }
}
