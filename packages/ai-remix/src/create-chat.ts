import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import type { Handle } from 'remix/ui'
import type {
  ResolvableChatInterrupt,
  ChatResumeState,
  InferredClientContext,
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

/**
 * Create a chat helper for a Remix component.
 *
 * Call this in setup with the component Handle from `remix/ui`. The helper
 * wraps ChatClient and calls `handle.update()` when the client snapshot
 * changes, so render reads the latest frozen snapshot through getters.
 *
 * `options.threadId` is required. Cleanup runs when `handle.signal` aborts. Do not pass identification in `options.devtools`;
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
 *     threadId: 'support-1',
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
  handle: Pick<Handle, 'update' | 'signal'>,
  options: CreateChatOptions<TTools, TSchema, TContext, TInterrupts>,
) {
  let closed = false

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

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
    threadId: options.threadId,
    ...(options.persistence === true
      ? {
          persistence: true,
          ...(options.history !== undefined && {
            history: options.history,
          }),
        }
      : { persistence: options.persistence }),
    ...(options.initialResumeSnapshot !== undefined && {
      initialResumeSnapshot: options.initialResumeSnapshot,
    }),
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
    ...(options.queue !== undefined && { queue: options.queue }),
    onInterruptStateChange: (nextInterruptState, context) => {
      options.onInterruptStateChange?.(nextInterruptState, context)
    },
  })

  // Render reads the frozen client snapshot through the getters below.
  const unsubscribeSnapshot = client.subscribeSnapshot(commit)

  function close() {
    if (closed) return
    closed = true
    unsubscribeSnapshot()
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

  // Remix has no effects, so read `options.tools` before each call that can
  // start a run. A getter such as `get tools() { return page.tools }` then
  // sends the current tools.
  const syncTools = () => {
    if (options.tools !== undefined) {
      client.updateOptions({ tools: options.tools })
    }
  }

  const sendMessage = async (
    content: string | MultimodalContent,
    sendOptions?: SendMessageOptions,
  ) => {
    syncTools()
    await client.sendMessage(content, undefined, sendOptions)
  }

  const cancelQueued = (id: string) => client.cancelQueued(id)

  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    syncTools()
    await client.append(message)
  }

  const reload = async () => {
    syncTools()
    await client.reload()
  }

  const loadOlderMessages = async () => {
    await client.loadOlderMessages()
  }

  const stop = () => {
    client.stop()
  }

  const clear = () => {
    client.clear()
  }

  const setMessages = (newMessages: ReadonlyArray<UIMessage<TTools>>) => {
    client.setMessagesManually(newMessages)
  }

  const addToolResult = async (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => {
    syncTools()
    await client.addToolResult(result)
  }

  const resolveInterrupts = (
    resolution:
      | boolean
      | ((
          interrupt: ResolvableChatInterrupt<TTools, TInterrupts>,
        ) => undefined),
  ) => {
    syncTools()
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
    syncTools()
    client.retryInterrupts()
  }

  const resumeInterruptsUnsafe = (
    resumeItems: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ) => {
    syncTools()
    return client.resumeInterruptsUnsafe(resumeItems, state)
  }

  function activeStructuredPart(): StructuredOutputPart | null {
    const { messages } = client.getSnapshot()
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
      return client.getSnapshot().messages
    },
    get isLoading() {
      return client.getSnapshot().isLoading
    },
    get hasOlderMessages() {
      return client.getSnapshot().hasOlderMessages
    },
    get error() {
      return client.getSnapshot().error
    },
    get status() {
      return client.getSnapshot().status
    },
    get isSubscribed() {
      return client.getSnapshot().isSubscribed
    },
    get connectionStatus() {
      return client.getSnapshot().connectionStatus
    },
    get sessionGenerating() {
      return client.getSnapshot().sessionGenerating
    },
    get isHydrating() {
      return client.getSnapshot().isHydrating
    },
    get queue() {
      return client.getSnapshot().queue
    },
    get runId() {
      return client.getSnapshot().runId
    },
    get interrupts() {
      return client.getSnapshot().interruptState.interrupts
    },
    get interruptErrors() {
      return client.getSnapshot().interruptState.interruptErrors
    },
    get resuming() {
      return client.getSnapshot().interruptState.resuming
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
    loadOlderMessages,
    stop,
    setMessages,
    clear,
    addToolResult,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
  }
}
