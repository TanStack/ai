import { createEffect, createMemo, createSignal, untrack } from 'solid-js'

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
  const createClient = (threadId: string) => {
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
      threadId,
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
  // Only the thread id replaces the client. Other reactive options are
  // synchronized below without discarding the transcript.
  const client = createMemo(
    () => {
      const threadId = options.threadId
      return untrack(() => createClient(threadId))
    },
    { transparent: true },
  )

  // Seed from the constructor snapshot; setup must not write Solid 2 signals.
  const [snapshot, setSnapshot] = createSignal(
    untrack(() => client().getSnapshot()),
  )
  createEffect(client, (target) => {
    const update = () => {
      setSnapshot(() => target.getSnapshot())
    }
    const unsubscribe = target.subscribeSnapshot(update)
    // Catch changes between construction and subscribing before attaching.
    update()
    target.attach()
    target.mountDevtools()
    return () => {
      unsubscribe()
      target.detach()
      target.unsubscribe()
      target.dispose()
    }
  })
  const pick = <TKey extends keyof ReturnType<typeof snapshot>>(key: TKey) =>
    createMemo(() => snapshot()[key])
  const messages = pick('messages')
  const interruptState = pick('interruptState')

  // Solid 2 tracks only the compute half; updateOptions runs in apply.
  createEffect(
    () => ({
      target: client(),
      forwardedProps: options.forwardedProps,
      context: options.context,
      queue: options.queue,
    }),
    ({ target, forwardedProps, context, queue }) => {
      target.updateOptions({
        ...(forwardedProps !== undefined && { forwardedProps }),
        context,
        ...(queue !== undefined && { queue }),
      })
    },
  )
  createEffect(
    () => ({ target: client(), tools: options.tools }),
    ({ target, tools }) => {
      if (tools !== undefined) target.updateOptions({ tools })
    },
  )
  createEffect(
    () => ({ target: client(), live: options.live }),
    ({ target, live }) => {
      if (live) target.subscribe()
      else target.unsubscribe()
    },
  )

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
