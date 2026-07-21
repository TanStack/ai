import {
  $,
  noSerialize,
  useComputed$,
  useId,
  useSignal,
  useVisibleTask$,
} from '@qwik.dev/core'
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import type { NoSerialize, QRL, Signal } from '@qwik.dev/core'
import type {
  ChatClientPersistence,
  ChatClientState,
  ChatFetcher,
  ChunkStrategy,
  ConnectionAdapter,
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
  const generatedClientId = useId()
  const clientId = useSignal(options.id || generatedClientId)
  const client = useSignal<
    NoSerialize<ChatClient<TTools, TContext>> | undefined
  >()
  const clientPromise = useSignal<
    NoSerialize<Promise<ChatClient<TTools, TContext>>> | undefined
  >()
  const clientGeneration = useSignal(0)
  type PersistenceOption = ChatClientPersistence<TTools>
  type StreamProcessorOption = {
    chunkStrategy?: ChunkStrategy
  }
  type OnResponseOption = (response?: Response) => void | Promise<void>
  type OnChunkOption = (chunk: StreamChunk) => void
  type OnFinishOption = (message: UIMessage<TTools>) => void
  type OnErrorOption = (error: Error) => void
  type OnCustomEventOption = (
    eventType: string,
    data: unknown,
    context: { toolCallId?: string },
  ) => void
  const initialMessagesOption = useSignal<Array<UIMessage<TTools>> | undefined>(
    options.initialMessages,
  )
  const threadIdOption = useSignal<string | undefined>(options.threadId)
  const persistenceOption = useSignal<
    NoSerialize<PersistenceOption> | undefined
  >(options.persistence ? noSerialize(options.persistence) : undefined)
  const persistenceFactoryOption = useSignal<
    QRL<() => PersistenceOption | Promise<PersistenceOption>> | undefined
  >(() => options.persistence$)
  const bodyOption = useSignal<Record<string, unknown> | undefined>(
    options.body,
  )
  const forwardedPropsOption = useSignal<Record<string, unknown> | undefined>(
    options.forwardedProps,
  )
  const contextOption = useSignal<TContext | undefined>(() => options.context)
  const liveOption = useSignal<boolean | undefined>(options.live)
  const apiOption = useSignal<string | undefined>(options.api)
  const usesApiTransportOption = useSignal(
    !options.connection &&
      !options.fetcher &&
      !options.connection$ &&
      !options.fetcher$,
  )
  const connectionOption = useSignal<
    NoSerialize<ConnectionAdapter> | undefined
  >(options.connection ? noSerialize(options.connection) : undefined)
  const fetcherOption = useSignal<NoSerialize<ChatFetcher> | undefined>(() =>
    options.fetcher ? noSerialize(options.fetcher) : undefined,
  )
  const connectionFactoryOption = useSignal<
    QRL<() => ConnectionAdapter | Promise<ConnectionAdapter>> | undefined
  >(() => options.connection$)
  const fetcherFactoryOption = useSignal<
    QRL<() => ChatFetcher | Promise<ChatFetcher>> | undefined
  >(() => options.fetcher$)
  const devtoolsOption = useSignal(options.devtools)
  const outputKindOption = useSignal<'structured' | 'chat'>(
    options.outputSchema ? 'structured' : 'chat',
  )
  const streamProcessorOption = useSignal<
    NoSerialize<StreamProcessorOption> | undefined
  >(options.streamProcessor ? noSerialize(options.streamProcessor) : undefined)
  const streamProcessorFactoryOption = useSignal<
    | QRL<() => StreamProcessorOption | Promise<StreamProcessorOption>>
    | undefined
  >(() => options.streamProcessor$)
  const toolsOption = useSignal<NoSerialize<TTools> | undefined>(
    options.tools ? noSerialize(options.tools) : undefined,
  )
  const toolsFactoryOption = useSignal<
    QRL<() => TTools | Promise<TTools>> | undefined
  >(() => options.tools$)
  const onResponseQrlOption = useSignal<
    QRL<(response?: Response) => void | Promise<void>> | undefined
  >(() => options.onResponse$)
  const onChunkQrlOption = useSignal<
    QRL<(chunk: StreamChunk) => void | Promise<void>> | undefined
  >(() => options.onChunk$)
  const onFinishQrlOption = useSignal<
    QRL<(message: UIMessage<TTools>) => void | Promise<void>> | undefined
  >(() => options.onFinish$)
  const onErrorQrlOption = useSignal<
    QRL<(error: Error) => void | Promise<void>> | undefined
  >(() => options.onError$)
  const onCustomEventQrlOption = useSignal<
    | QRL<
        (
          eventType: string,
          data: unknown,
          context: { toolCallId?: string },
        ) => void | Promise<void>
      >
    | undefined
  >(() => options.onCustomEvent$)
  const onResponseOption = useSignal<NoSerialize<OnResponseOption> | undefined>(
    () => (options.onResponse ? noSerialize(options.onResponse) : undefined),
  )
  const onChunkOption = useSignal<NoSerialize<OnChunkOption> | undefined>(() =>
    options.onChunk ? noSerialize(options.onChunk) : undefined,
  )
  const onFinishOption = useSignal<NoSerialize<OnFinishOption> | undefined>(
    () => (options.onFinish ? noSerialize(options.onFinish) : undefined),
  )
  const onErrorOption = useSignal<NoSerialize<OnErrorOption> | undefined>(() =>
    options.onError ? noSerialize(options.onError) : undefined,
  )
  const onCustomEventOption = useSignal<
    NoSerialize<OnCustomEventOption> | undefined
  >(() =>
    options.onCustomEvent ? noSerialize(options.onCustomEvent) : undefined,
  )
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

  clientId.value = options.id || generatedClientId
  initialMessagesOption.value = options.initialMessages
  threadIdOption.value = options.threadId
  persistenceOption.value = options.persistence
    ? noSerialize(options.persistence)
    : undefined
  persistenceFactoryOption.value = options.persistence$
  bodyOption.value = options.body
  forwardedPropsOption.value = options.forwardedProps
  contextOption.value = options.context
  liveOption.value = options.live
  apiOption.value = options.api
  usesApiTransportOption.value =
    !options.connection &&
    !options.fetcher &&
    !options.connection$ &&
    !options.fetcher$
  connectionOption.value = options.connection
    ? noSerialize(options.connection)
    : undefined
  fetcherOption.value = options.fetcher
    ? noSerialize(options.fetcher)
    : undefined
  connectionFactoryOption.value = options.connection$
  fetcherFactoryOption.value = options.fetcher$
  devtoolsOption.value = options.devtools
  outputKindOption.value = options.outputSchema ? 'structured' : 'chat'
  streamProcessorOption.value = options.streamProcessor
    ? noSerialize(options.streamProcessor)
    : undefined
  streamProcessorFactoryOption.value = options.streamProcessor$
  toolsOption.value = options.tools ? noSerialize(options.tools) : undefined
  toolsFactoryOption.value = options.tools$
  onResponseQrlOption.value = options.onResponse$
  onChunkQrlOption.value = options.onChunk$
  onFinishQrlOption.value = options.onFinish$
  onErrorQrlOption.value = options.onError$
  onCustomEventQrlOption.value = options.onCustomEvent$
  onResponseOption.value = options.onResponse
    ? noSerialize(options.onResponse)
    : undefined
  onChunkOption.value = options.onChunk
    ? noSerialize(options.onChunk)
    : undefined
  onFinishOption.value = options.onFinish
    ? noSerialize(options.onFinish)
    : undefined
  onErrorOption.value = options.onError
    ? noSerialize(options.onError)
    : undefined
  onCustomEventOption.value = options.onCustomEvent
    ? noSerialize(options.onCustomEvent)
    : undefined

  const initializeClient = $(async () => {
    if (client.value) return client.value
    if (clientPromise.value) return clientPromise.value

    const generation = clientGeneration.value
    const initialization = (async () => {
      const connection = connectionFactoryOption.value
        ? await connectionFactoryOption.value()
        : connectionOption.value
      const fetcher = connection
        ? undefined
        : fetcherFactoryOption.value
          ? await fetcherFactoryOption.value()
          : fetcherOption.value
      const persistence = persistenceFactoryOption.value
        ? await persistenceFactoryOption.value()
        : persistenceOption.value
      const streamProcessor = streamProcessorFactoryOption.value
        ? await streamProcessorFactoryOption.value()
        : streamProcessorOption.value
      const tools = toolsFactoryOption.value
        ? await toolsFactoryOption.value()
        : toolsOption.value

      if (generation !== clientGeneration.value) {
        throw new Error('Chat client initialization was superseded')
      }

      const transport = connection
        ? { connection }
        : fetcher
          ? { fetcher }
          : {
              connection: fetchServerSentEvents(apiOption.value || '/api/chat'),
            }

      const chatClient = new ChatClient<TTools, TContext>({
        devtoolsBridgeFactory: createChatDevtoolsBridge,
        ...transport,
        id: clientId.value,
        ...(initialMessagesOption.value !== undefined && {
          initialMessages: initialMessagesOption.value,
        }),
        ...(persistence !== undefined && {
          persistence,
        }),
        ...(bodyOption.value !== undefined && { body: bodyOption.value }),
        ...(threadIdOption.value !== undefined && {
          threadId: threadIdOption.value,
        }),
        ...(forwardedPropsOption.value !== undefined && {
          forwardedProps: forwardedPropsOption.value,
        }),
        ...(contextOption.value !== undefined && {
          context: contextOption.value,
        }),
        devtools: {
          ...devtoolsOption.value,
          framework: 'qwik',
          hookName: 'useChat',
          outputKind: outputKindOption.value,
        },
        onResponse: async (response) => {
          if (onResponseQrlOption.value) {
            await onResponseQrlOption.value(response)
            return
          }
          await onResponseOption.value?.(response)
        },
        onChunk: (chunk: StreamChunk) => {
          if (onChunkQrlOption.value) {
            void onChunkQrlOption.value(chunk)
            return
          }
          onChunkOption.value?.(chunk)
        },
        onFinish: (message) => {
          if (onFinishQrlOption.value) {
            void onFinishQrlOption.value(message)
            return
          }
          onFinishOption.value?.(message)
        },
        onError: (nextError) => {
          if (onErrorQrlOption.value) {
            void onErrorQrlOption.value(nextError)
            return
          }
          onErrorOption.value?.(nextError)
        },
        tools,
        onCustomEvent: (eventType, data, context) =>
          onCustomEventQrlOption.value
            ? void onCustomEventQrlOption.value(eventType, data, context)
            : onCustomEventOption.value?.(eventType, data, context),
        ...(streamProcessor !== undefined && {
          streamProcessor,
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

      if (generation !== clientGeneration.value) {
        chatClient.dispose()
        throw new Error('Chat client initialization was superseded')
      }

      client.value = noSerialize(chatClient)
      messages.value = chatClient.getMessages()
      error.value = undefined
      status.value = 'ready'

      if (liveOption.value) {
        chatClient.subscribe()
      }

      chatClient.mountDevtools()
      return chatClient
    })()

    clientPromise.value = noSerialize(initialization)
    try {
      return await initialization
    } catch (cause) {
      if (generation === clientGeneration.value) {
        const nextError =
          cause instanceof Error ? cause : new Error(String(cause))
        error.value = nextError
        status.value = 'error'
      }
      throw cause
    } finally {
      if (clientPromise.value === initialization) {
        clientPromise.value = undefined
      }
    }
  })

  useVisibleTask$(({ cleanup, track }) => {
    track(clientId)
    const generation = clientGeneration.value
    void initializeClient().catch(() => {})

    cleanup(() => {
      if (generation !== clientGeneration.value) return
      clientGeneration.value++
      clientPromise.value = undefined
      const chatClient = client.value
      client.value = undefined
      chatClient?.dispose()
    })
  })

  useVisibleTask$(({ track }) => {
    const body = track(bodyOption)
    const forwardedProps = track(forwardedPropsOption)
    const context = track(contextOption)
    const chatClient = client.value

    if (!chatClient) return

    chatClient.updateOptions({
      ...(body !== undefined && { body }),
      ...(forwardedProps !== undefined && { forwardedProps }),
      context,
    })
  })

  useVisibleTask$(async ({ track }) => {
    const toolsFactory = track(toolsFactoryOption)
    const tools = track(toolsOption)
    const chatClient = client.value

    if (!chatClient) return

    const nextTools = toolsFactory ? await toolsFactory() : tools
    if (nextTools !== undefined) {
      chatClient.updateOptions({ tools: nextTools })
    }
  })

  useVisibleTask$(async ({ track }) => {
    const connectionFactory = track(connectionFactoryOption)
    const fetcherFactory = track(fetcherFactoryOption)
    const connection = track(connectionOption)
    const fetcher = track(fetcherOption)
    const chatClient = client.value

    if (!chatClient) return

    if (connectionFactory) {
      chatClient.updateOptions({ connection: await connectionFactory() })
      return
    }

    if (fetcherFactory) {
      chatClient.updateOptions({ fetcher: await fetcherFactory() })
      return
    }

    if (connection) {
      chatClient.updateOptions({ connection })
      return
    }

    if (fetcher) {
      chatClient.updateOptions({ fetcher })
    }
  })

  useVisibleTask$(({ track }) => {
    const isLive = track(liveOption)
    const chatClient = client.value

    if (!chatClient) return

    if (isLive) {
      chatClient.subscribe()
    } else {
      chatClient.unsubscribe()
    }
  })

  useVisibleTask$(({ track }) => {
    const api = track(apiOption)
    const usesApiTransport = track(usesApiTransportOption)
    const chatClient = client.value

    if (!chatClient || !usesApiTransport) return

    chatClient.updateOptions({
      connection: fetchServerSentEvents(api || '/api/chat'),
    })
  })

  const sendMessage = $(async (content: string | MultimodalContent) => {
    await (await initializeClient()).sendMessage(content)
  })

  const append = $(async (message: ModelMessage | UIMessage<TTools>) => {
    await (await initializeClient()).append(message)
  })

  const reload = $(async () => {
    await (await initializeClient()).reload()
  })

  const stop = $(async () => {
    const chatClient = await initializeClient()
    chatClient.stop()
  })

  const clear = $(async () => {
    const chatClient = await initializeClient()
    chatClient.clear()
  })

  const setMessages = $(async (nextMessages: Array<UIMessage<TTools>>) => {
    const chatClient = await initializeClient()
    chatClient.setMessagesManually(nextMessages)
  })

  const addToolResult = $(
    async (result: {
      toolCallId: string
      tool: string
      output: any
      state?: 'output-available' | 'output-error'
      errorText?: string
    }) => {
      await (await initializeClient()).addToolResult(result)
    },
  )

  const addToolApprovalResponse = $(
    async (response: { id: string; approved: boolean }) => {
      await (await initializeClient()).addToolApprovalResponse(response)
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
