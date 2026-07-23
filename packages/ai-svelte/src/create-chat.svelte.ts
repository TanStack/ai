import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { onMount } from 'svelte'
import type {
  ChatClientState,
  ChatInterrupt,
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
  InferSchemaType,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai'
import type {
  CreateChatOptions,
  CreateChatReturn,
  DeepPartial,
  MultimodalContent,
  UIMessage,
} from './types'

const EMPTY_INTERRUPTS = Object.freeze([])
const EMPTY_INTERRUPT_ERRORS = Object.freeze([])

/**
 * Creates a reactive chat instance for Svelte 5.
 *
 * This function wraps the ChatClient from @tanstack/ai-client and exposes
 * reactive state using Svelte 5 runes. The returned object has reactive
 * getters that automatically update when state changes.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createChat, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *
 *   const chat = createChat({
 *     connection: fetchServerSentEvents('/api/chat'),
 *   })
 * </script>
 *
 * <div>
 *   {#each chat.messages as message}
 *     <div>{message.role}: {message.parts[0].content}</div>
 *   {/each}
 *
 *   {#if chat.isLoading}
 *     <button onclick={chat.stop}>Stop</button>
 *   {/if}
 *
 *   <button onclick={() => chat.sendMessage('Hello!')}>Send</button>
 * </div>
 * ```
 */
export function createChat<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
>(
  options: CreateChatOptions<TTools, TSchema, TContext>,
): CreateChatReturn<TTools, TSchema, TContext> {
  // Generate a unique ID for this chat instance
  const clientId =
    options.id ||
    `chat-${Date.now()}-${Math.random().toString(36).substring(7)}`

  // Create reactive state using Svelte 5 runes
  let messages = $state<Array<UIMessage<TTools>>>(options.initialMessages || [])
  let isLoading = $state(false)
  let error = $state<Error | undefined>(undefined)
  let status = $state<ChatClientState>('ready')
  let isSubscribed = $state(false)
  let connectionStatus = $state<ConnectionStatus>('disconnected')
  let sessionGenerating = $state(false)
  let queue = $state<Array<QueuedMessage>>([])
  let resumeState = $state<ChatResumeState | null>(
    options.initialResumeSnapshot?.resumeState ?? null,
  )
  let interruptState = $state.raw<ChatInterruptState<TTools>>({
    interrupts: EMPTY_INTERRUPTS,
    pendingInterrupts: EMPTY_INTERRUPTS,
    interruptErrors: EMPTY_INTERRUPT_ERRORS,
    resuming: false,
  })

  // Structured-output `partial` / `final` are derived from `messages` —
  // specifically from the structured-output part on the latest assistant
  // message (the one after the most recent user message). Per-turn parts
  // keep history coherent without a separate reset signal.
  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  // Create ChatClient instance.
  // Note: Svelte's createChat runs once per instance and `options` is captured
  // by reference. Callbacks are therefore frozen to whatever the caller passed
  // at creation — to swap them dynamically, mutate the options object
  // in-place or call `client.updateOptions(...)` imperatively.
  // Optional fields use conditional spread because the target
  // `ChatClientOptions` declares them as `field?: T` (absent vs. present)
  // rather than `field?: T | undefined`. Under `exactOptionalPropertyTypes`,
  // passing an explicit `undefined` for an absent-only optional is a type
  // error, so we omit the key when the caller's value is undefined.
  const transport = options.connection
    ? { connection: options.connection }
    : { fetcher: options.fetcher }

  const client = new ChatClient<TTools, TContext>({
    devtoolsBridgeFactory: createChatDevtoolsBridge,
    ...transport,
    id: clientId,
    ...(options.initialMessages !== undefined && {
      initialMessages: options.initialMessages,
    }),
    ...(options.persistence !== undefined && {
      persistence: options.persistence,
    }),
    ...(options.initialResumeSnapshot !== undefined && {
      initialResumeSnapshot: options.initialResumeSnapshot,
    }),
    ...(options.body !== undefined && { body: options.body }),
    ...(options.threadId !== undefined && { threadId: options.threadId }),
    ...(options.forwardedProps !== undefined && {
      forwardedProps: options.forwardedProps,
    }),
    ...(options.context !== undefined && { context: options.context }),
    devtools: {
      ...options.devtools,
      framework: 'svelte',
      hookName: 'useChat',
      outputKind: options.outputSchema ? 'structured' : 'chat',
    },
    ...(options.onResponse !== undefined && { onResponse: options.onResponse }),
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
    ...(options.onCustomEvent !== undefined && {
      onCustomEvent: options.onCustomEvent,
    }),
    ...(options.streamProcessor !== undefined && {
      streamProcessor: options.streamProcessor,
    }),
    onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
      messages = newMessages
    },
    onLoadingChange: (newIsLoading: boolean) => {
      isLoading = newIsLoading
      syncResumeState()
    },
    onStatusChange: (newStatus: ChatClientState) => {
      status = newStatus
    },
    onErrorChange: (newError: Error | undefined) => {
      error = newError
    },
    onSubscriptionChange: (nextIsSubscribed: boolean) => {
      isSubscribed = nextIsSubscribed
    },
    onConnectionStatusChange: (nextStatus: ConnectionStatus) => {
      connectionStatus = nextStatus
    },
    onSessionGeneratingChange: (isGenerating: boolean) => {
      sessionGenerating = isGenerating
    },
    ...(options.queue !== undefined && { queue: options.queue }),
    onQueueChange: (nextQueue: Array<QueuedMessage>) => {
      queue = nextQueue
    },
    onResumeStateChange: (nextResumeState) => {
      resumeState = nextResumeState
    },
    onInterruptStateChange: (nextInterruptState) => {
      interruptState = nextInterruptState
      options.onInterruptStateChange?.(nextInterruptState)
    },
  })

  function syncResumeState() {
    resumeState = client.getResumeState()
    interruptState = client.getInterruptState()
  }

  messages = client.getMessages()
  interruptState = client.getInterruptState()

  if (options.live) {
    client.subscribe()
  }

  client.mountDevtools()

  if (typeof window !== 'undefined') {
    try {
      onMount(() => {
        // Delivery-durability resume is transparent: the resumable SSE
        // connection adapter reattaches via the browser's native
        // Last-Event-ID on reconnect. We only seed interrupt (state) resume.
        syncResumeState()
      })
    } catch {
      // Svelte lifecycle hooks are only valid during component initialization.
    }
  }

  // Note: Cleanup is handled by calling stop() directly when needed.
  // Unlike React/Vue/Solid, Svelte 5 runes like $effect can only be used
  // during component initialization, so we don't add automatic cleanup here.
  // Users should call chat.stop() in their component's cleanup if needed.

  // Define methods
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

  const dispose = () => {
    client.dispose()
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
    resolution: boolean | ((interrupt: ChatInterrupt<TTools>) => undefined),
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

  /**
   * @deprecated Use `updateForwardedProps` instead.
   * Both populate the same wire payload.
   */
  const updateBody = (newBody: Record<string, any>) => {
    client.updateOptions({ body: newBody })
  }

  const updateForwardedProps = (newForwardedProps: Record<string, any>) => {
    client.updateOptions({ forwardedProps: newForwardedProps })
  }

  const updateContext = (newContext: TContext) => {
    client.updateOptions({ context: newContext })
  }

  // The "active" structured-output part is the one on the assistant message
  // after the latest user message. When no user message exists yet (e.g.
  // `initialMessages` carries only a stale assistant turn), we return null
  // rather than scanning history — otherwise a `final` from a previous
  // session would leak in on first render. Uses `$derived.by` so the
  // multi-line scan re-runs whenever `messages` changes.
  const activeStructuredPart: StructuredOutputPart | null = $derived.by(() => {
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
  })

  const partial: Partial = $derived.by(() => {
    if (!activeStructuredPart) return {} as Partial
    const v = activeStructuredPart.partial ?? activeStructuredPart.data
    return (v ?? {}) as Partial
  })

  const final: Final | null = $derived(
    activeStructuredPart && activeStructuredPart.status === 'complete'
      ? (activeStructuredPart.data as Final)
      : null,
  )

  // Return the chat interface with reactive getters
  // Using getters allows Svelte to track reactivity without needing $ prefix
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- rune return shape diverges from generic CreateChatReturn<TTools, TSchema, TContext> due to TSchema conditional partial/final fields; TS can't structurally narrow.
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
    get resumeState() {
      return resumeState
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
      return partial
    },
    get final() {
      return final
    },
    sendMessage,
    cancelQueued,
    append,
    reload,
    stop,
    dispose,
    setMessages,
    clear,
    addToolResult,
    addToolApprovalResponse,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
    resumeInterrupts,
    updateBody,
    updateForwardedProps,
    updateContext,
  } as unknown as CreateChatReturn<TTools, TSchema, TContext>
}
