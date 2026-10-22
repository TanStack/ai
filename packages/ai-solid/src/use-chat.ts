import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  untrack,
} from 'solid-js'

import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
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
  // restores the same conversation.

  // Structured-output `partial` / `final` are derived from `messages` —
  // specifically from the structured-output part on the latest assistant
  // message (the one after the most recent user message). Per-turn parts
  // keep history coherent without a separate reset signal.
  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  // Build the client once per threadId. User callbacks read latest options.
  // Every user-provided callback is wrapped so the LATEST `options.xxx` value
  // is read at call time. Direct assignment would freeze the callback to the
  // reference we saw at creation; the wrapper lets reactive `options` or
  // in-place mutations propagate. When the user clears a callback (sets it to
  // undefined), `?.` no-ops.
  const createClient = () => {
    // Build options with conditional spreads for fields whose source
    // type is `T | undefined` but the ChatClient target uses a strict
    // optional (`field?: T`) — `exactOptionalPropertyTypes` rejects
    // assigning `undefined` to those, so we omit the key when absent.
    const transport = options.connection
      ? { connection: options.connection }
      : { fetcher: options.fetcher }
    const instance = new ChatClient<TTools, TContext, TInterrupts>({
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
      // Untracked: a tools change must not rebuild the client. The effect
      // below syncs it instead.
      tools: untrack(() => options.tools),
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
    return instance
  }
  // Rebuild the client only when `threadId` changes. `on` runs `createClient`
  // untracked, so a reactive `forwardedProps` change does not start a
  // new client and drop the transcript. The effects below sync those values.
  const client = createMemo(on(() => options.threadId, createClient))

  // One signal: the snapshot is frozen and replaced on every change. Seeded
  // here so constructor hydration (a sync store) is on the first paint.
  const [snapshot, setSnapshot] = createSignal(client().getSnapshot())
  createEffect(() => {
    const target = client()
    setSnapshot(target.getSnapshot())
    onCleanup(target.subscribeSnapshot(() => setSnapshot(target.getSnapshot())))
  })
  const pick = <TKey extends keyof ReturnType<typeof snapshot>>(key: TKey) =>
    createMemo(() => snapshot()[key])
  const messages = pick('messages')
  const interruptState = pick('interruptState')

  // Sync forwardedProps changes to the client.
  createEffect(() => {
    // Conditional spread: `updateOptions` declares strict-optional
    // fields and rejects explicit `undefined` under EOPT.
    client().updateOptions({
      ...(options.forwardedProps !== undefined && {
        forwardedProps: options.forwardedProps,
      }),
      context: options.context,
      ...(options.queue !== undefined && { queue: options.queue }),
    })
  })

  // Sync tools, so a getter such as `get tools() { return pageTools() }`
  // updates the client.
  createEffect(() => {
    const tools = options.tools
    if (tools !== undefined) client().updateOptions({ tools })
  })

  // Apply initial live mode immediately on hook creation.
  if (options.live) {
    client().subscribe()
  } else {
    client().unsubscribe()
  }

  // First paint must see constructor hydration (sync store / resume snapshot)
  // and the live subscribe above. `createEffect` runs after paint, so the
  // subscribe effect cannot be the first apply.
  setSnapshot(client().getSnapshot())

  createEffect(() => {
    if (options.live) {
      client().subscribe()
    } else {
      client().unsubscribe()
    }
  })

  onMount(() => {
    // START TAILING HERE, not in the constructor. A client is idle until a view
    // attaches it, so a client that gets built and thrown away never opens a
    // connection — an unreachable stream would hold one of the browser's ~6
    // connections per origin until the page reloaded.
    client().attach()
    client().mountDevtools()
  })

  // Cleanup on unmount: stop any in-flight requests.
  onCleanup(() => {
    // Release the connection first: `detach` is the counterpart of the `attach`
    // above, and it keeps the transcript and resume pointer so a later mount can
    // pick the run back up from the durable log.
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
    await client().sendMessage(content, undefined, sendOptions)
  }

  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    await client().append(message)
  }

  const reload = async () => {
    await client().reload()
  }

  const loadOlderMessages = async () => {
    await client().loadOlderMessages()
  }

  const stop = () => {
    client().stop()
  }

  const clear = () => {
    client().clear()
  }

  const setMessagesManually = (
    newMessages: ReadonlyArray<UIMessage<TTools>>,
  ) => {
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

  const cancelQueued = (id: string) => client().cancelQueued(id)

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
  const interruptErrors = () => interruptState().interruptErrors
  const resuming = () => interruptState().resuming

  // The "active" structured-output part is on the assistant message after
  // the latest user message. When no user message exists yet, return null
  // rather than scanning history — otherwise a stale `final` from
  // `initialMessages` would leak into the value on first render.
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
    if (!part || part.status !== 'complete') return null
    return part.data as Final
  })

  // partial / final are runtime-tracked unconditionally; the conditional
  // return type hides them when no `outputSchema` is supplied.
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- primitive return shape diverges from generic UseChatReturn<TTools, TSchema>; TS can't structurally narrow the conditional partial/final fields
  return {
    messages,
    queue: pick('queue'),
    sendMessage,
    append,
    reload,
    stop,
    isLoading: pick('isLoading'),
    hasOlderMessages: pick('hasOlderMessages'),
    loadOlderMessages,
    error: pick('error'),
    status: pick('status'),
    isSubscribed: pick('isSubscribed'),
    connectionStatus: pick('connectionStatus'),
    sessionGenerating: pick('sessionGenerating'),
    isHydrating: pick('isHydrating'),
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    cancelQueued,
    runId: pick('runId'),
    interrupts,
    interruptErrors,
    resuming,
    resolveInterrupts,
    cancelInterrupts,
    retryInterrupts,
    resumeInterruptsUnsafe,
    partial,
    final,
  } as unknown as UseChatReturn<TTools, TSchema, TInterrupts>
}
