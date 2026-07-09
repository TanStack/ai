import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import {
  DestroyRef,
  Injector,
  afterNextRender,
  assertInInjectionContext,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core'
import { toReactive } from './internal/to-reactive'
import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai'
import type {
  ChatClientState,
  ConnectionStatus,
  InferredClientContext,
  StructuredOutputPart,
} from '@tanstack/ai-client'
import type {
  DeepPartial,
  InjectChatOptions,
  InjectChatResult,
  MultimodalContent,
  UIMessage,
} from './types'

let nextId = 0

export function injectChat<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
>(
  options: InjectChatOptions<
    TTools,
    TSchema,
    TContext
  > = {} as InjectChatOptions<TTools, TSchema, TContext>,
): InjectChatResult<TTools, TSchema> {
  assertInInjectionContext(injectChat)

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  const destroyRef = inject(DestroyRef)
  const injector = inject(Injector)
  const clientId = options.id || `injectChat-${nextId++}`

  const messages = signal<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isLoading = signal(false)
  const error = signal<Error | undefined>(undefined)
  const status = signal<ChatClientState>('ready')
  const isSubscribed = signal(false)
  const connectionStatus = signal<ConnectionStatus>('disconnected')
  const sessionGenerating = signal(false)

  // Reactive option sources. Plain values become constant computeds.
  const bodySource =
    options.body !== undefined ? toReactive(options.body) : undefined
  const forwardedPropsSource =
    options.forwardedProps !== undefined
      ? toReactive(options.forwardedProps)
      : undefined
  const contextSource =
    options.context !== undefined ? toReactive(options.context) : undefined
  const liveSource =
    options.live !== undefined ? toReactive(options.live) : undefined

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
    ...(bodySource !== undefined && { body: bodySource() }),
    ...(options.threadId !== undefined && { threadId: options.threadId }),
    ...(forwardedPropsSource !== undefined && {
      forwardedProps: forwardedPropsSource(),
    }),
    ...(contextSource !== undefined && { context: contextSource() }),
    devtools: {
      ...options.devtools,
      framework: 'angular',
      hookName: 'injectChat',
      outputKind: options.outputSchema ? 'structured' : 'chat',
    },
    onResponse: (response) => options.onResponse?.(response),
    onChunk: (chunk: StreamChunk) => options.onChunk?.(chunk),
    onFinish: (message) => options.onFinish?.(message),
    onError: (err) => options.onError?.(err),
    onResumeStateChange: (resumeState, pendingInterrupts) => {
      options.onResumeStateChange?.(resumeState, pendingInterrupts)
    },
    tools: options.tools,
    onCustomEvent: (eventType, data, context) =>
      options.onCustomEvent?.(eventType, data, context),
    ...(options.streamProcessor !== undefined && {
      streamProcessor: options.streamProcessor,
    }),
    onMessagesChange: (m: Array<UIMessage<TTools>>) => messages.set(m),
    onLoadingChange: (v: boolean) => isLoading.set(v),
    onStatusChange: (v: ChatClientState) => status.set(v),
    onErrorChange: (v: Error | undefined) => error.set(v),
    onSubscriptionChange: (v: boolean) => isSubscribed.set(v),
    onConnectionStatusChange: (v: ConnectionStatus) => connectionStatus.set(v),
    onSessionGeneratingChange: (v: boolean) => sessionGenerating.set(v),
  })

  messages.set(client.getMessages())

  // Sync reactive body / forwardedProps / context to the client.
  if (bodySource || forwardedPropsSource || contextSource) {
    effect(
      () => {
        const newBody = bodySource?.()
        const newForwardedProps = forwardedPropsSource?.()
        const newContext = contextSource?.()
        client.updateOptions({
          ...(newBody !== undefined && { body: newBody }),
          ...(newForwardedProps !== undefined && {
            forwardedProps: newForwardedProps,
          }),
          ...(newContext !== undefined && { context: newContext }),
        })
      },
      { injector },
    )
  }

  // Subscribe / unsubscribe based on reactive `live`.
  if (liveSource) {
    effect(
      () => {
        if (liveSource()) {
          client.subscribe()
        } else {
          client.unsubscribe()
        }
      },
      { injector },
    )
  }

  afterNextRender(
    () => {
      client.mountDevtools()
      // Delivery-durability resume is transparent: the resumable SSE
      // connection adapter reattaches via the browser's native Last-Event-ID
      // on reconnect. No client-side auto-resume wiring is needed.
    },
    { injector },
  )

  destroyRef.onDestroy(() => {
    if (liveSource?.()) {
      client.unsubscribe()
    } else {
      client.stop()
    }
    client.dispose()
  })

  // Active structured-output part = the one on the assistant message after the
  // latest user message. Ported from ai-vue/src/use-chat.ts.
  const activeStructuredPart = computed<StructuredOutputPart | null>(() => {
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

  const partial = computed<Partial>(() => {
    const part = activeStructuredPart()
    if (!part) return {} as Partial
    const v = part.partial ?? part.data
    return (v ?? {}) as Partial
  })

  const final = computed<Final | null>(() => {
    const part = activeStructuredPart()
    if (!part || part.status !== 'complete') return null
    return part.data as Final
  })

  const sendMessage = async (content: string | MultimodalContent) => {
    await client.sendMessage(content)
  }
  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    await client.append(message)
  }
  const reload = async () => {
    await client.reload()
  }
  const stop = () => client.stop()
  const clear = () => client.clear()
  const setMessages = (m: Array<UIMessage<TTools>>) =>
    client.setMessagesManually(m)
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
  }

  // eslint-disable-next-line no-restricted-syntax -- return shape diverges from conditional InjectChatResult<TTools, TSchema>; TS can't structurally narrow the TSchema-gated partial/final signals
  return {
    messages: messages.asReadonly(),
    sendMessage,
    append,
    reload,
    stop,
    isLoading: isLoading.asReadonly(),
    error: error.asReadonly(),
    status: status.asReadonly(),
    isSubscribed: isSubscribed.asReadonly(),
    connectionStatus: connectionStatus.asReadonly(),
    sessionGenerating: sessionGenerating.asReadonly(),
    setMessages,
    clear,
    addToolResult,
    addToolApprovalResponse,
    partial,
    final,
  } as unknown as InjectChatResult<TTools, TSchema>
}
