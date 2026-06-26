import {
  $,
  noSerialize,
  useComputed$,
  useSignal,
  useVisibleTask$,
} from '@qwik.dev/core'
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import type { NoSerialize, Signal } from '@qwik.dev/core'
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

function latestStructuredPart<TTools extends ReadonlyArray<AnyClientTool>>(
  messages: Array<UIMessage<TTools>>,
): StructuredOutputPart | null {
  let lastUserIndex = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      lastUserIndex = i
      break
    }
  }

  if (lastUserIndex === -1) return null

  for (let i = messages.length - 1; i > lastUserIndex; i--) {
    const message = messages[i]
    if (message?.role !== 'assistant') continue
    const part = message.parts.find(
      (item): item is StructuredOutputPart => item.type === 'structured-output',
    )
    if (part) return part
  }

  return null
}

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
  const clientId =
    options.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const client = useSignal<
    NoSerialize<ChatClient<TTools, TContext>> | undefined
  >()
  const messages = useSignal<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isLoading = useSignal(false)
  const error = useSignal<Error | undefined>()
  const status = useSignal<ChatClientState>('ready')
  const isSubscribed = useSignal(false)
  const connectionStatus = useSignal<ConnectionStatus>('disconnected')
  const sessionGenerating = useSignal(false)

  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>

  useVisibleTask$(({ cleanup }) => {
    const transport = options.connection
      ? { connection: options.connection }
      : options.fetcher
        ? { fetcher: options.fetcher }
        : { connection: fetchServerSentEvents(options.api || '/api/chat') }

    const chatClient = new ChatClient<TTools, TContext>({
      devtoolsBridgeFactory: createChatDevtoolsBridge,
      ...transport,
      id: clientId,
      ...(options.initialMessages !== undefined && {
        initialMessages: options.initialMessages,
      }),
      ...(options.persistence !== undefined && {
        persistence: options.persistence,
      }),
      ...(options.body !== undefined && { body: options.body }),
      ...(options.threadId !== undefined && { threadId: options.threadId }),
      ...(options.forwardedProps !== undefined && {
        forwardedProps: options.forwardedProps,
      }),
      ...(options.context !== undefined && { context: options.context }),
      devtools: {
        ...options.devtools,
        framework: 'qwik',
        hookName: 'useChat',
        outputKind: options.outputSchema ? 'structured' : 'chat',
      },
      onResponse: (response) => options.onResponse?.(response),
      onChunk: (chunk: StreamChunk) => options.onChunk?.(chunk),
      onFinish: (message) => options.onFinish?.(message),
      onError: (nextError) => options.onError?.(nextError),
      tools: options.tools,
      onCustomEvent: (eventType, data, context) =>
        options.onCustomEvent?.(eventType, data, context),
      ...(options.streamProcessor !== undefined && {
        streamProcessor: options.streamProcessor,
      }),
      onMessagesChange: (nextMessages: Array<UIMessage<TTools>>) => {
        messages.value = nextMessages
      },
      onLoadingChange: (nextIsLoading: boolean) => {
        isLoading.value = nextIsLoading
      },
      onStatusChange: (nextStatus: ChatClientState) => {
        status.value = nextStatus
      },
      onErrorChange: (nextError: Error | undefined) => {
        error.value = nextError
      },
      onSubscriptionChange: (nextIsSubscribed: boolean) => {
        isSubscribed.value = nextIsSubscribed
      },
      onConnectionStatusChange: (nextStatus: ConnectionStatus) => {
        connectionStatus.value = nextStatus
      },
      onSessionGeneratingChange: (isGenerating: boolean) => {
        sessionGenerating.value = isGenerating
      },
    })

    client.value = noSerialize(chatClient)
    messages.value = chatClient.getMessages()

    if (options.live) {
      chatClient.subscribe()
    }

    chatClient.mountDevtools()

    cleanup(() => {
      if (options.live) {
        chatClient.unsubscribe()
      } else {
        chatClient.stop()
      }
      chatClient.dispose()
      client.value = undefined
    })
  })

  const sendMessage = $(async (content: string | MultimodalContent) => {
    await client.value?.sendMessage(content)
  })

  const append = $(async (message: ModelMessage | UIMessage<TTools>) => {
    await client.value?.append(message)
  })

  const reload = $(async () => {
    await client.value?.reload()
  })

  const stop = $(() => {
    client.value?.stop()
  })

  const clear = $(() => {
    client.value?.clear()
  })

  const setMessages = $((nextMessages: Array<UIMessage<TTools>>) => {
    client.value?.setMessagesManually(nextMessages)
  })

  const addToolResult = $(
    async (result: {
      toolCallId: string
      tool: string
      output: any
      state?: 'output-available' | 'output-error'
      errorText?: string
    }) => {
      await client.value?.addToolResult(result)
    },
  )

  const addToolApprovalResponse = $(
    async (response: { id: string; approved: boolean }) => {
      await client.value?.addToolApprovalResponse(response)
    },
  )

  const activeStructuredPart = useComputed$(() =>
    latestStructuredPart(messages.value),
  )

  const partial = useComputed$<Partial>(() => {
    const part = activeStructuredPart.value
    if (!part) return {} as Partial
    const value = part.partial ?? part.data
    return (value ?? {}) as Partial
  })

  const final = useComputed$<Final | null>(() => {
    const part = activeStructuredPart.value
    if (!part || part.status !== 'complete') return null
    return part.data as Final
  })

  // eslint-disable-next-line no-restricted-syntax -- primitive return shape diverges from generic UseChatReturn<TTools, TSchema>; TS can't structurally narrow the conditional partial/final fields
  return {
    messages: messages as Signal<Array<UIMessage<TTools, any>>>,
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
    setMessages,
    clear,
    addToolResult,
    addToolApprovalResponse,
    partial,
    final,
  } as unknown as UseChatReturn<TTools, TSchema>
}
