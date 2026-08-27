import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
} from 'solid-js'

import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
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
  AnyClientTool,
  InterruptDefinition,
  InferSchemaType,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai'
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
  options: UseChatOptions<
    TTools,
    TSchema,
    TContext,
    TInterrupts
  > = {} as UseChatOptions<TTools, TSchema, TContext, TInterrupts>,
): UseChatReturn<TTools, TSchema, TInterrupts> {
  const hookId = createUniqueId()
  const clientId = options.threadId ?? hookId

  const [messages, setMessages] = createSignal<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<Error | undefined>(undefined)
  const [status, setStatus] = createSignal<ChatClientState>('ready')
  const [isSubscribed, setIsSubscribed] = createSignal(false)
  const [connectionStatus, setConnectionStatus] =
    createSignal<ConnectionStatus>('disconnected')
  const [sessionGenerating, setSessionGenerating] = createSignal(false)
  const [queue, setQueue] = createSignal<Array<QueuedMessage>>([])
  const [runId, setRunId] = createSignal<string | null>(null)
  const [interruptState, setInterruptState] = createSignal<
    ChatInterruptState<TTools, TInterrupts>
  >({
    interrupts: EMPTY_INTERRUPTS,
    pendingInterrupts: EMPTY_INTERRUPTS,
    interruptErrors: EMPTY_INTERRUPT_ERRORS,
    resuming: false,
  })

  const syncResumeState = () => {
    setRunId(client().getCurrentRunId())
    setInterruptState(client().getInterruptState())
  }

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  const client = createMemo(() => {
    const transport = options.connection
      ? { connection: options.connection }
      : { fetcher: options.fetcher }
    return new ChatClient<TTools, TContext, TInterrupts>({
      devtoolsBridgeFactory: createChatDevtoolsBridge,
      ...transport,
      ...(options.initialMessages !== undefined && {
        initialMessages: options.initialMessages,
      }),
      ...(typeof options.threadId === 'string' && options.persistence
        ? {
            persistence: options.persistence,
            threadId: options.threadId,
          }
        : {
            ...(options.threadId !== undefined && {
              threadId: options.threadId,
            }),
          }),
      ...(options.initialResumeSnapshot !== undefined && {
        initialResumeSnapshot: options.initialResumeSnapshot,
      }),
      body: options.body,
      ...(options.forwardedProps !== undefined && {
        forwardedProps: options.forwardedProps,
      }),
      ...(options.byok !== undefined && { byok: options.byok }),
      byokProvider: () => options.byokProvider?.(),
      ...(options.context !== undefined && { context: options.context }),
      devtools: {
        ...options.devtools,
        framework: 'solid',
        hookName: 'useChat',
        outputKind: options.outputSchema ? 'structured' : 'chat',
      },
      onResponse: (response) => options.onResponse?.(response),
      onChunk: (chunk: StreamChunk) => {
        options.onChunk?.(chunk)
      },
      onFinish: (message) => {
        options.onFinish?.(message)
      },
      onError: (err) => {
        options.onError?.(err)
      },
      tools: options.tools,
      ...(options.interrupts !== undefined && {
        interrupts: options.interrupts,
      }),
      onCustomEvent: (eventType, data, context) =>
        options.onCustomEvent?.(eventType, data, context),
      ...(options.streamProcessor !== undefined && {
        streamProcessor: options.streamProcessor,
      }),
      onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
        setMessages(newMessages)
      },
      onLoadingChange: (newIsLoading: boolean) => {
        setIsLoading(newIsLoading)
        syncResumeState()
      },
      onStatusChange: (newStatus: ChatClientState) => {
        setStatus(newStatus)
      },
      onErrorChange: (newError: Error | undefined) => {
        setError(newError)
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
      ...(options.queue !== undefined && { queue: options.queue }),
      onQueueChange: (nextQueue: Array<QueuedMessage>) => {
        setQueue(nextQueue)
      },
      onRunIdChange: (nextRunId) => {
        setRunId(nextRunId)
      },
      onResumeStateChange: (_nextResumeState, nextPendingInterrupts) => {
        setInterruptState((current) => ({
          ...current,
          interrupts: nextPendingInterrupts,
          pendingInterrupts: nextPendingInterrupts,
        }))
      },
      onInterruptStateChange: (nextInterruptState, context) => {
        setInterruptState(nextInterruptState)
        options.onInterruptStateChange?.(nextInterruptState, context)
      },
    })
    // Only recreate when clientId changes
    // Connection and other options are captured at creation time
  }, [clientId])

  setMessages(client().getMessages())
  syncResumeState()

  createEffect(() => {
    // Conditional spread: `updateOptions` declares strict-optional
    // fields and rejects explicit `undefined` under EOPT.
    client().updateOptions({
      ...(options.body !== undefined && { body: options.body }),
      ...(options.forwardedProps !== undefined && {
        forwardedProps: options.forwardedProps,
      }),
      context: options.context,
      ...(options.queue !== undefined && { queue: options.queue }),
    })
  })

  // Apply initial live mode immediately on hook creation.
  if (options.live) {
    client().subscribe()
  } else {
    client().unsubscribe()
  }

  createEffect(() => {
    if (options.live) {
      client().subscribe()
    } else {
      client().unsubscribe()
    }
  })

  onMount(() => {
    client().attach()
    client().mountDevtools()
    syncResumeState()
  })

  // Cleanup on unmount: stop any in-flight requests.
  onCleanup(() => {
    client().detach()
    if (options.live) {
      client().unsubscribe()
    } else {
      client().stop()
    }
    client().dispose()
  })

  // Callback options are read through `options.xxx` at call time, so reactive
  // or mutated options propagate without recreating the client.

  const sendMessage = async (
    content: string | MultimodalContent,
    sendOptions?: SendMessageOptions,
  ) => {
    try {
      await client().sendMessage(content, undefined, sendOptions)
    } finally {
      syncResumeState()
    }
  }

  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    try {
      await client().append(message)
    } finally {
      syncResumeState()
    }
  }

  const reload = async () => {
    try {
      await client().reload()
    } finally {
      syncResumeState()
    }
  }

  const stop = () => {
    client().stop()
  }

  const clear = () => {
    client().clear()
    syncResumeState()
  }

  const setMessagesManually = (newMessages: Array<UIMessage<TTools>>) => {
    client().setMessagesManually(newMessages)
  }

  const addToolResult = async (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => {
    await client().addToolResult(result)
  }

  const addToolApprovalResponse = async (response: {
    id: string
    approved: boolean
  }) => {
    await client().addToolApprovalResponse(response)
    syncResumeState()
  }

  const cancelQueued = (id: string) => client().cancelQueued(id)

  const resumeInterrupts = async (
    resumeItems: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ) => {
    const result = await client().resumeInterrupts(resumeItems, state)
    syncResumeState()
    return result
  }

  const resolveInterrupts = (
    resolution:
      | boolean
      | ((
          interrupt: ResolvableChatInterrupt<TTools, TInterrupts>,
        ) => undefined),
  ) => {
    if (typeof resolution === 'boolean') {
      client().resolveInterrupts(resolution)
    } else {
      client().resolveInterrupts(resolution)
    }
  }

  const cancelInterrupts = () => {
    client().cancelInterrupts()
  }

  const retryInterrupts = () => {
    client().retryInterrupts()
  }

  const resumeInterruptsUnsafe = (
    resumeItems: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ) => client().resumeInterruptsUnsafe(resumeItems, state)

  const interrupts = () => interruptState().interrupts
  const pendingInterrupts = () => interruptState().pendingInterrupts
  const interruptErrors = () => interruptState().interruptErrors
  const resuming = () => interruptState().resuming

  const activeStructuredPart = createMemo<StructuredOutputPart | null>(() => {
    const list = messages()
    let lastUserIndex = -1
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex === -1) return null
    for (let i = list.length - 1; i > lastUserIndex; i--) {
      const m = list[i]
      if (m?.role !== 'assistant') continue
      const part = m.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )
      if (part) return part
    }
    return null
  })

  const partial = createMemo<Partial>(() => {
    const part = activeStructuredPart()
    if (!part) return {} as Partial
    const v = part.partial ?? part.data
    return (v ?? {}) as Partial
  })

  const final = createMemo<Final | null>(() => {
    const part = activeStructuredPart()
    if (!part) return null
    if (part.status !== 'complete') return null
    return part.data as Final
  })

  // partial / final are runtime-tracked unconditionally; the conditional
  // return type hides them when no `outputSchema` is supplied.
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- primitive return shape diverges from generic UseChatReturn<TTools, TSchema>; TS can't structurally narrow the conditional partial/final fields
  return {
    messages,
    queue,
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
    cancelQueued,
    runId,
    interrupts,
    pendingInterrupts,
    interruptErrors,
    resuming,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
    resumeInterrupts,
    partial,
    final,
  } as unknown as UseChatReturn<TTools, TSchema, TInterrupts>
}
