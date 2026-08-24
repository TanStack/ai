import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'octane'
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
  ChatClientState,
  ResolvableChatInterrupt,
  ChatInterruptState,
  ChatResumeState,
  ConnectionStatus,
  InferredClientContext,
  QueuedMessage,
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

const EMPTY_INTERRUPTS = Object.freeze([])
const EMPTY_INTERRUPT_ERRORS = Object.freeze([])

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

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  // Track the rendered snapshot so a replacement client only synchronizes
  // state when its messages actually differ.
  const messagesRef = useRef<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const subscribedRef = useRef(false)
  const activeClientRef = useRef<ChatClient | null>(null)
  const seenClientRef = useRef<ChatClient | null>(null)

  // Update ref synchronously during render so it's always current when useMemo runs.
  messagesRef.current = messages

  // Track current options in a ref to avoid recreating client when options change
  const optionsRef =
    useRef<UseChatOptions<TTools, TSchema, TContext, TInterrupts>>(options)
  optionsRef.current = options

  // Create ChatClient instance with callbacks to sync state
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
    // persistence resolves before commit. Preserve those notifications until
    // this render commits.
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
      ...(initialOptions.body !== undefined && { body: initialOptions.body }),
      ...(initialOptions.forwardedProps !== undefined && {
        forwardedProps: initialOptions.forwardedProps,
      }),
      ...(initialOptions.initialResumeSnapshot !== undefined && {
        initialResumeSnapshot: initialOptions.initialResumeSnapshot,
      }),
      ...(initialOptions.context !== undefined && {
        context: initialOptions.context,
      }),
      devtools: {
        ...initialOptions.devtools,
        // OCTANE DIVERGENCE: identify this binding as Octane (not 'react') in TanStack AI Devtools.
        // Spread AFTER caller metadata so callers cannot override identification.
        framework: 'octane',
        hookName: 'useChat',
        outputKind: initialOptions.outputSchema ? 'structured' : 'chat',
      },
      onResponse: (response) => {
        // ChatClient awaits this return value. Dropping it would skip the promise.
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

  useEffect(() => {
    const applySnapshot = () => {
      const next = client.getSnapshot()
      setMessages(next.messages)
      setIsLoading(next.isLoading)
      setError(next.error)
      setStatus(next.status)
      setIsSubscribed(next.isSubscribed)
      setConnectionStatus(next.connectionStatus)
      setSessionGenerating(next.sessionGenerating)
      setQueue(next.queue)
      setRunId(next.runId)
      setInterruptState(next.interruptState)
    }
    applySnapshot()
    return client.subscribeSnapshot(applySnapshot)
  }, [client])

  // OCTANE DIVERGENCE: upstream captures the initial transport. ChatClient
  // owns transport swaps, including aborting an active request and
  // resubscribing when needed, so keep its conversation state stable while
  // applying the latest transport. Skip the first run for each client — it
  // already has this transport from the constructor, and a no-op swap can
  // abort constructor rejoin / interrupt resume.
  useEffect(() => {
    if (seenClientRef.current !== client) {
      seenClientRef.current = client
      return
    }
    const transport = options.connection
      ? { connection: options.connection }
      : { fetcher: options.fetcher }
    client.updateOptions(transport)
  }, [client, options.connection, options.fetcher])

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
      // in-flight stream.
      client.unsubscribe()
      subscribedRef.current = false
    }
  }, [client, options.live])

  // Octane has no StrictMode double-invoke, so attach and dispose are
  // immediate (Vue-style), not React's deferred setTimeout dispose.
  useEffect(() => {
    client.attach()
    client.mountDevtools()
    return () => {
      client.detach()
      if (optionsRef.current.live) {
        client.unsubscribe()
      } else {
        client.stop()
      }
      client.dispose()
      if (activeClientRef.current === client) {
        activeClientRef.current = null
      }
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
    partial,
    final,
  } as unknown as UseChatReturn<TTools, TSchema, TInterrupts>
}
