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
  ConnectionStatus,
  InferredClientContext,
  StructuredOutputPart,
} from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
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
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
>(
  options: UseChatOptions<TTools, TSchema, TContext> = {} as UseChatOptions<
    TTools,
    TSchema,
    TContext
  >,
): UseChatReturn<TTools, TSchema> {
  const hookId = createUniqueId()
  const clientId = options.id || hookId

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

  // Structured-output `partial` / `final` are derived from `messages` —
  // specifically from the structured-output part on the latest assistant
  // message (the one after the most recent user message). Per-turn parts
  // keep history coherent without a separate reset signal.
  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  // Create ChatClient instance with callbacks to sync state.
  // Every user-provided callback is wrapped so the LATEST `options.xxx` value
  // is read at call time. Direct assignment would freeze the callback to the
  // reference we saw at creation; the wrapper lets reactive `options` or
  // in-place mutations propagate. When the user clears a callback (sets it to
  // undefined), `?.` no-ops.
  const client = createMemo(() => {
    // Build options with conditional spreads for fields whose source
    // type is `T | undefined` but the ChatClient target uses a strict
    // optional (`field?: T`) — `exactOptionalPropertyTypes` rejects
    // assigning `undefined` to those, so we omit the key when absent.
    const transport = options.connection
      ? { connection: options.connection }
      : { fetcher: options.fetcher }
    return new ChatClient<TTools, TContext>({
      devtoolsBridgeFactory: createChatDevtoolsBridge,
      ...transport,
      id: clientId,
      ...(options.initialMessages !== undefined && {
        initialMessages: options.initialMessages,
      }),
      ...(options.persistence !== undefined && {
        persistence: options.persistence,
      }),
      body: options.body,
      ...(options.threadId !== undefined && { threadId: options.threadId }),
      ...(options.forwardedProps !== undefined && {
        forwardedProps: options.forwardedProps,
      }),
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
    })
    // Only recreate when clientId changes
    // Connection and other options are captured at creation time
  }, [clientId])

  setMessages(client().getMessages())

  // Sync body / forwardedProps changes to the client.
  // Both populate the same wire payload; `forwardedProps` is preferred
  // and `body` is deprecated but still supported.
  createEffect(() => {
    // Conditional spread: `updateOptions` declares strict-optional
    // fields and rejects explicit `undefined` under EOPT.
    client().updateOptions({
      ...(options.body !== undefined && { body: options.body }),
      ...(options.forwardedProps !== undefined && {
        forwardedProps: options.forwardedProps,
      }),
      context: options.context,
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
    client().mountDevtools()
  })

  // Cleanup on unmount: stop any in-flight requests.
  onCleanup(() => {
    if (options.live) {
      client().unsubscribe()
    } else {
      client().stop()
    }
    client().dispose()
  })

  // Callback options are read through `options.xxx` at call time, so reactive
  // or mutated options propagate without recreating the client.

  const sendMessage = async (content: string | MultimodalContent) => {
    await client().sendMessage(content)
  }

  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    await client().append(message)
  }

  const reload = async () => {
    await client().reload()
  }

  const stop = () => {
    client().stop()
  }

  const clear = () => {
    client().clear()
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
  }

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
  // eslint-disable-next-line no-restricted-syntax -- primitive return shape diverges from generic UseChatReturn<TTools, TSchema>; TS can't structurally narrow the conditional partial/final fields
  return {
    messages,
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
    partial,
    final,
  } as unknown as UseChatReturn<TTools, TSchema>
}
