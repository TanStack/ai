import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import type { Handle } from 'remix/ui'
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
} from '@tanstack/ai/client'
import type {
  CreateChatOptions,
  CreateChatReturn,
  DeepPartial,
  MultimodalContent,
  UIMessage,
} from './types.ts'

const EMPTY_INTERRUPTS = Object.freeze([])
const EMPTY_INTERRUPT_ERRORS = Object.freeze([])

/**
 * Create a chat helper for a Remix component.
 *
 * Call this in setup with the component Handle from `remix/ui`. The helper
 * wraps ChatClient and stores chat state in local variables. ChatClient state
 * callbacks write those variables and then call `handle.update()`, so render
 * reads the latest snapshot through getters.
 *
 * The default thread id is `options.threadId ?? handle.id`. Cleanup runs when
 * `handle.signal` aborts. Do not pass identification in `options.devtools`;
 * the helper sets `framework: 'remix'` and `hookName: 'createChat'`.
 *
 * @param handle Remix component handle from setup.
 * @param options Chat client options. Pass `connection` or `fetcher`.
 *
 * @example
 * ```tsx
 * import { createChat } from '@tanstack/ai-remix'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * import type { Handle } from 'remix/ui'
 *
 * function Chat(handle: Handle) {
 *   const chat = createChat(handle, {
 *     connection: fetchServerSentEvents('/api/chat'),
 *   })
 *   return () => (
 *     <div>
 *       {chat.messages.map((message) => (
 *         <div>{message.role}</div>
 *       ))}
 *       <button on={{ click: () => chat.sendMessage('Hello') }}>Send</button>
 *     </div>
 *   )
 * }
 * ```
 *
 * @see {@link CreateChatReturn}
 */
export function createChat<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
>(
  handle: Handle,
  options: CreateChatOptions<TTools, TSchema, TContext, TInterrupts>,
) {
  let messages = options.initialMessages || []
  let isLoading = false
  let error: Error | undefined
  let status: ChatClientState = 'ready'
  let isSubscribed = false
  let connectionStatus: ConnectionStatus = 'disconnected'
  let sessionGenerating = false
  let queue: Array<QueuedMessage> = []
  let runId: string | null = null
  let interruptState: ChatInterruptState<TTools, TInterrupts> = {
    interrupts: EMPTY_INTERRUPTS,
    pendingInterrupts: EMPTY_INTERRUPTS,
    interruptErrors: EMPTY_INTERRUPT_ERRORS,
    resuming: false,
  }
  let closed = false

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  const threadId = options.threadId ?? handle.id
  const transport = options.connection
    ? { connection: options.connection }
    : { fetcher: options.fetcher }

  function commit() {
    if (closed) return
    void handle.update()
  }

  const client = new ChatClient<TTools, TContext, TInterrupts>({
    devtoolsBridgeFactory: createChatDevtoolsBridge,
    ...transport,
    ...(options.initialMessages !== undefined && {
      initialMessages: options.initialMessages,
    }),
    ...(options.persistence
      ? {
          persistence: options.persistence,
          threadId,
        }
      : { threadId }),
    ...(options.initialResumeSnapshot !== undefined && {
      initialResumeSnapshot: options.initialResumeSnapshot,
    }),
    ...(options.body !== undefined && { body: options.body }),
    ...(options.forwardedProps !== undefined && {
      forwardedProps: options.forwardedProps,
    }),
    ...(options.byok !== undefined && { byok: options.byok }),
    byokProvider: () => options.byokProvider?.(),
    ...(options.context !== undefined && { context: options.context }),
    devtools: {
      ...options.devtools,
      framework: 'remix',
      hookName: 'createChat',
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
    ...(options.tools !== undefined && { tools: options.tools }),
    ...(options.interrupts !== undefined && {
      interrupts: options.interrupts,
    }),
    onCustomEvent: (eventType, data, context) =>
      options.onCustomEvent?.(eventType, data, context),
    ...(options.streamProcessor !== undefined && {
      streamProcessor: options.streamProcessor,
    }),
    onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
      messages = newMessages
      commit()
    },
    onLoadingChange: (newIsLoading: boolean) => {
      isLoading = newIsLoading
      syncResumeState()
      commit()
    },
    onStatusChange: (newStatus: ChatClientState) => {
      status = newStatus
      commit()
    },
    onErrorChange: (newError: Error | undefined) => {
      error = newError
      commit()
    },
    onSubscriptionChange: (nextIsSubscribed: boolean) => {
      isSubscribed = nextIsSubscribed
      commit()
    },
    onConnectionStatusChange: (nextStatus: ConnectionStatus) => {
      connectionStatus = nextStatus
      commit()
    },
    onSessionGeneratingChange: (isGenerating: boolean) => {
      sessionGenerating = isGenerating
      commit()
    },
    ...(options.queue !== undefined && { queue: options.queue }),
    onQueueChange: (nextQueue: Array<QueuedMessage>) => {
      queue = nextQueue
      commit()
    },
    onRunIdChange: (nextRunId) => {
      runId = nextRunId
      commit()
    },
    onInterruptStateChange: (nextInterruptState, context) => {
      interruptState = nextInterruptState
      options.onInterruptStateChange?.(nextInterruptState, context)
      commit()
    },
  })

  function syncResumeState() {
    runId = client.getCurrentRunId()
    interruptState = client.getInterruptState()
  }

  messages = client.getMessages()
  interruptState = client.getInterruptState()
  runId = client.getCurrentRunId()

  function close() {
    if (closed) return
    closed = true
    client.detach()
    if (options.live) {
      client.unsubscribe()
    } else {
      client.stop()
    }
    client.dispose()
  }

  if (handle.signal.aborted) {
    close()
  } else {
    handle.signal.addEventListener('abort', close, { once: true })
    if (options.live) {
      client.subscribe()
    }
    client.attach()
    client.mountDevtools()
  }

  const sendMessage = async (
    content: string | MultimodalContent,
    sendOptions?: SendMessageOptions,
  ) => {
    try {
      await client.sendMessage(content, undefined, sendOptions)
    } finally {
      syncResumeState()
    }
  }

  const cancelQueued = (id: string) => client.cancelQueued(id)

  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    try {
      await client.append(message)
    } finally {
      syncResumeState()
    }
  }

  const reload = async () => {
    try {
      await client.reload()
    } finally {
      syncResumeState()
    }
  }

  const stop = () => {
    client.stop()
  }

  const clear = () => {
    client.clear()
    syncResumeState()
  }

  const setMessages = (newMessages: Array<UIMessage<TTools>>) => {
    client.setMessagesManually(newMessages)
  }

  const addToolResult = async (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => {
    await client.addToolResult(result)
  }

  /** @deprecated Use a bound `tool-approval` interrupt and `interrupt.resolveInterrupt`. */
  const addToolApprovalResponse = async (response: {
    id: string
    approved: boolean
  }) => {
    await client.addToolApprovalResponse(response)
    syncResumeState()
  }

  const resumeInterrupts = async (
    resumeItems: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ) => {
    const result = await client.resumeInterrupts(resumeItems, state)
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
      client.resolveInterrupts(resolution)
    } else {
      client.resolveInterrupts(resolution)
    }
  }

  const cancelInterrupts = () => {
    client.cancelInterrupts()
  }

  const retryInterrupts = () => {
    client.retryInterrupts()
  }

  const resumeInterruptsUnsafe = (
    resumeItems: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ) => client.resumeInterruptsUnsafe(resumeItems, state)

  function activeStructuredPart(): StructuredOutputPart | null {
    let lastUserIndex = -1
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'user') {
        lastUserIndex = i
        break
      }
    }
    if (lastUserIndex === -1) return null
    for (let i = messages.length - 1; i > lastUserIndex; i--) {
      const m = messages[i]
      if (m?.role !== 'assistant') continue
      const part = m.parts.find(
        (p): p is StructuredOutputPart => p.type === 'structured-output',
      )
      if (part) return part
    }
    return null
  }

  return {
    get messages() {
      return messages
    },
    get isLoading() {
      return isLoading
    },
    get error() {
      return error
    },
    get status() {
      return status
    },
    get isSubscribed() {
      return isSubscribed
    },
    get connectionStatus() {
      return connectionStatus
    },
    get sessionGenerating() {
      return sessionGenerating
    },
    get queue() {
      return queue
    },
    get runId() {
      return runId
    },
    get interrupts() {
      return interruptState.interrupts
    },
    get pendingInterrupts() {
      return interruptState.interrupts
    },
    get interruptErrors() {
      return interruptState.interruptErrors
    },
    get resuming() {
      return interruptState.resuming
    },
    get partial() {
      const part = activeStructuredPart()
      if (!part) return {} as Partial
      const v = part.partial ?? part.data
      return (v ?? {}) as Partial
    },
    get final() {
      const part = activeStructuredPart()
      if (!part || part.status !== 'complete') return null
      return part.data as Final
    },
    sendMessage,
    cancelQueued,
    append,
    reload,
    stop,
    setMessages,
    clear,
    addToolResult,
    addToolApprovalResponse,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
    resumeInterrupts,
  }
}
