import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { onMount } from 'svelte'
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
} from '@tanstack/ai'
import type {
  CreateChatOptions,
  CreateChatReturn,
  DeepPartial,
  MultimodalContent,
  UIMessage,
} from './types'

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
 *     threadId: 'support-1',
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
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
>(
  options: CreateChatOptions<TTools, TSchema, TContext, TInterrupts>,
): CreateChatReturn<TTools, TSchema, TContext, TInterrupts> {
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

  // The hook's identity is its `threadId`.
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
    ...(options.interrupts !== undefined && {
      interrupts: options.interrupts,
    }),
    ...(options.onCustomEvent !== undefined && {
      onCustomEvent: options.onCustomEvent,
    }),
    ...(options.streamProcessor !== undefined && {
      streamProcessor: options.streamProcessor,
    }),
    ...(options.queue !== undefined && { queue: options.queue }),
    onInterruptStateChange: (nextInterruptState, context) => {
      options.onInterruptStateChange?.(nextInterruptState, context)
    },
  })

  // One raw rune: the snapshot is frozen and replaced on every change.
  let snapshot = $state.raw(client.getSnapshot())
  const unsubscribeSnapshot = client.subscribeSnapshot(() => {
    snapshot = client.getSnapshot()
  })

  if (options.live) {
    client.subscribe()
  }

  client.mountDevtools()

  if (typeof window !== 'undefined') {
    try {
      // Sync tools, so a getter such as `get tools() { return page.tools }`
      // updates the client.
      $effect.pre(() => {
        const tools = options.tools
        if (tools !== undefined) client.updateOptions({ tools })
      })
    } catch {
      // Effects are only valid during component initialization.
    }
    try {
      onMount(() => {
        // Delivery-durability resume is transparent: the resumable SSE
        // connection adapter reattaches via the browser's native
        // Last-Event-ID on reconnect. We only seed interrupt (state) resume.
        client.attach()
        // ONLY THE VIEW ON SCREEN HOLDS A STREAM. `onMount`'s returned function
        // runs when the component is destroyed, which is the one automatic
        // teardown Svelte gives us here — and it is enough, because a connection
        // is all that must go. A page can own many chats and a browser allows
        // only ~6 connections per origin, so one long-lived stream per chat
        // starves every other request once a few views have been open.
        //
        // `detach` keeps the transcript and the resume pointer, so re-entering
        // the view picks the run back up from the durable log.
        return () => {
          unsubscribeSnapshot()
          client.detach()
        }
      })
    } catch {
      // Svelte lifecycle hooks are only valid during component initialization.
    }
  }

  // Note: `dispose()` remains manual — it releases devtools and marks the client
  // dead, which only the owner can decide. The CONNECTION is released
  // automatically by the `onMount` teardown above.

  // Define methods
  const sendMessage = async (
    content: string | MultimodalContent,
    sendOptions?: SendMessageOptions,
  ) => {
    await client.sendMessage(content, undefined, sendOptions)
  }

  const cancelQueued = (id: string) => client.cancelQueued(id)

  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    await client.append(message)
  }

  const reload = async () => {
    await client.reload()
  }

  const loadOlderMessages = async () => {
    await client.loadOlderMessages()
  }

  const stop = () => {
    client.stop()
  }

  const dispose = () => {
    unsubscribeSnapshot()
    client.dispose()
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
    await client.addToolResult(result)
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
    const messages = snapshot.messages
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
      return snapshot.messages
    },
    get isLoading() {
      return snapshot.isLoading
    },
    get hasOlderMessages() {
      return snapshot.hasOlderMessages
    },
    get error() {
      return snapshot.error
    },
    get status() {
      return snapshot.status
    },
    get isSubscribed() {
      return snapshot.isSubscribed
    },
    get connectionStatus() {
      return snapshot.connectionStatus
    },
    get sessionGenerating() {
      return snapshot.sessionGenerating
    },
    get isHydrating() {
      return snapshot.isHydrating
    },
    get queue() {
      return snapshot.queue
    },
    get runId() {
      return snapshot.runId
    },
    get interrupts() {
      return snapshot.interruptState.interrupts
    },
    get interruptErrors() {
      return snapshot.interruptState.interruptErrors
    },
    get resuming() {
      return snapshot.interruptState.resuming
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
    loadOlderMessages,
    stop,
    dispose,
    setMessages,
    clear,
    addToolResult,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
    updateForwardedProps,
    updateContext,
  } as unknown as CreateChatReturn<TTools, TSchema, TContext, TInterrupts>
}
