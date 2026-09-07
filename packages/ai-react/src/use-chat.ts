import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import type {
  AnyClientTool,
  InferSchemaType,
  InterruptDefinition,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai/client'
import type {
  ChatClientPersistence,
  ResolvableChatInterrupt,
  ChatResumeState,
  InferredClientContext,
  SendMessageOptions,
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
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
>(
  options: UseChatOptions<TTools, TSchema, TContext, TInterrupts>,
): UseChatReturn<TTools, TSchema, TInterrupts> {
  // The hook's identity is its `threadId`. Reload with the same `threadId`
  // restores the same conversation. `hookId` is only a React recreation key
  // when no `threadId` is given. It is never sent on the wire.
  const hookId = useId()
  const clientId = options.threadId ?? hookId

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  const subscribedRef = useRef(false)
  const activeClientRef = useRef<ChatClient | null>(null)
  const cleanupInvalidationRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const cleanupDisposalRef = useRef<{
    client: ChatClient
    timeout: ReturnType<typeof setTimeout>
  } | null>(null)

  // Track current options in a ref to avoid recreating client when options change
  const optionsRef =
    useRef<UseChatOptions<TTools, TSchema, TContext, TInterrupts>>(options)
  optionsRef.current = options

  // Create ChatClient once per clientId. User callbacks read latest options.
  const { client, initialization, serverSnapshot, startPersistenceHydration } =
    useMemo(() => {
      const messagesToUse = options.initialMessages || []

      // Build options with conditional spreads for fields whose source
      // type is `T | undefined` but the ChatClient target uses a strict
      // optional (`field?: T`) — `exactOptionalPropertyTypes` rejects
      // assigning `undefined` to those, so we omit the key when absent.
      const initialOptions = optionsRef.current
      let persistence = initialOptions.persistence
      let releasePersistenceHydration = () => {}
      if (persistence && typeof persistence === 'object') {
        const source = persistence
        let hydrationStarted = false
        let releaseRead: (() => void) | undefined
        let hydrationPromise:
          | Promise<
              Awaited<ReturnType<ChatClientPersistence<TTools>['getItem']>>
            >
          | undefined
        const gatedPersistence: ChatClientPersistence<TTools> = {
          getItem(id) {
            if (!hydrationPromise) {
              hydrationPromise = new Promise((resolve, reject) => {
                let readStarted = false
                releaseRead = () => {
                  if (readStarted) return
                  readStarted = true
                  try {
                    resolve(source.getItem.call(source, id))
                  } catch (error) {
                    reject(error)
                  }
                }
              })
            }
            if (hydrationStarted) releaseRead?.()
            return hydrationPromise
          },
          setItem(id, state) {
            return source.setItem.call(source, id, state)
          },
          removeItem(id) {
            return source.removeItem.call(source, id)
          },
        }
        persistence = gatedPersistence
        releasePersistenceHydration = () => {
          if (hydrationStarted) return
          hydrationStarted = true
          releaseRead?.()
        }
      }
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
      // Queue user callbacks until this instance is the committed client.
      // Invoking them here would run onChunk/onFinish/onError for a client
      // React may abandon. Browser persistence is gated until attach so the
      // first paint stays on initialMessages / initialResumeSnapshot.
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
        ...(typeof initialOptions.threadId === 'string' && persistence
          ? {
              persistence,
              threadId: initialOptions.threadId,
            }
          : {
              ...(initialOptions.threadId !== undefined && {
                threadId: initialOptions.threadId,
              }),
            }),
        ...(initialOptions.body !== undefined && { body: initialOptions.body }),
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
          framework: 'react',
          hookName: 'useChat',
          outputKind: initialOptions.outputSchema ? 'structured' : 'chat',
        },
        onResponse: (response) => {
          // ChatClient awaits this return value. Queuing would drop the promise.
          if (!getActiveInstance()) return
          return optionsRef.current.onResponse?.(response)
        },
        onChunk: (chunk: StreamChunk) => {
          runOrQueueForActiveInstance(() => {
            optionsRef.current.onChunk?.(chunk)
          })
        },
        onFinish: (message: UIMessage<TTools>) => {
          runOrQueueForActiveInstance(() => {
            optionsRef.current.onFinish?.(message)
          })
        },
        onError: (error: Error) => {
          runOrQueueForActiveInstance(() => {
            optionsRef.current.onError?.(error)
          })
        },
        ...(initialOptions.tools !== undefined && {
          tools: initialOptions.tools,
        }),
        ...(initialOptions.interrupts !== undefined && {
          interrupts: initialOptions.interrupts,
        }),
        onCustomEvent: (eventType, data, context) => {
          runOrQueueForActiveInstance(() => {
            optionsRef.current.onCustomEvent?.(eventType, data, context)
          })
        },
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
      })
      instanceHolder.current = instance
      const capturedServerSnapshot = instance.getSnapshot()
      return {
        client: instance,
        initialization: initializationState,
        serverSnapshot: capturedServerSnapshot,
        startPersistenceHydration: releasePersistenceHydration,
      }
    }, [clientId])

  const getServerSnapshot = useCallback(() => serverSnapshot, [serverSnapshot])

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
    getServerSnapshot,
  )

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
    if (options.queue !== undefined) {
      client.updateOptions({ queue: options.queue })
    }
  }, [client, options.queue])

  useEffect(() => {
    if (options.live) {
      client.subscribe()
      subscribedRef.current = true
    } else if (subscribedRef.current) {
      // Only tear down a subscription we actually started. Calling
      // `unsubscribe()` on initial mount (when `live` was never enabled) would
      // abort an in-flight delivery resume — `resumeInFlightRun` is kicked off
      // in the client constructor, and `unsubscribe()` cancels the shared
      // in-flight stream — so a mid-stream reload would drop its rejoin before
      // it delivers a single chunk. This is exactly why a reload froze instead
      // of continuing.
      client.unsubscribe()
      subscribedRef.current = false
    }
  }, [client, options.live])

  // ONLY THE VIEW ON SCREEN HOLDS A STREAM.
  //
  // A page can own many chats — 40 sandboxes, 40 conversations — and a browser
  // allows only ~6 connections per origin. One long-lived stream per chat reaches
  // that ceiling after a handful of views, and every request after it QUEUES:
  // measured, an in-page fetch took over two minutes while the same request from
  // outside the browser took 17ms. So the connection follows the view.
  //
  // Immediate, not deferred: the deferred teardown below can be skipped when the
  // same client remounts, which is right for disposal but useless for a
  // connection. `attach` is idempotent and `detach` keeps the transcript and the
  // resume pointer, so a Strict Mode remount is just detach-then-attach and the
  // run is picked straight back up from the durable log.
  useEffect(() => {
    client.attach()
    startPersistenceHydration()
    return () => {
      client.detach()
    }
  }, [client, startPersistenceHydration])

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
      // Soft cleanup only: do NOT stop/unsubscribe here. React Strict Mode
      // remounts fire this cleanup then re-attach the same client one tick
      // later; calling `stop()` would abort a constructor rejoin
      // (`resumeInFlightRun`) and can wipe the durable resume pointer before
      // the first chunk. Real teardown lives in the deferred dispose path
      // below, which only runs when the client is not remounted.
      // Subscribe/unsubscribe on `options.live` is still owned by the
      // dedicated effect above for live toggles.
      const disposal = {
        client,
        timeout: setTimeout(() => {
          if (optionsRef.current.live) {
            client.unsubscribe()
          } else {
            client.stop()
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

  const resumeInterrupts = useCallback(
    async (resumeItems: Array<RunAgentResumeItem>, state?: ChatResumeState) => {
      return await client.resumeInterrupts(resumeItems, state ?? undefined)
    },
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
  const renderedMessages = snapshot.messages

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
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- hook return shape diverges from generic UseChatReturn<TTools, TSchema> due to conditional type on TSchema; TS can't structurally narrow
  return {
    messages: renderedMessages,
    sendMessage,
    append,
    reload,
    stop,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
    status: snapshot.status,
    isSubscribed: snapshot.isSubscribed,
    connectionStatus: snapshot.connectionStatus,
    sessionGenerating: snapshot.sessionGenerating,
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    addToolApprovalResponse,
    queue: snapshot.queue,
    cancelQueued,
    runId: snapshot.runId,
    interrupts: snapshot.interruptState.interrupts,
    pendingInterrupts: snapshot.interruptState.pendingInterrupts,
    interruptErrors: snapshot.interruptState.interruptErrors,
    resuming: snapshot.interruptState.resuming,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
    resumeInterrupts,
    partial,
    final,
  } as unknown as UseChatReturn<TTools, TSchema, TInterrupts>
}
