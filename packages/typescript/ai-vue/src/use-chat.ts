import { ChatClient } from '@tanstack/ai-client'
import { parsePartialJSON } from '@tanstack/ai'
import { onScopeDispose, readonly, shallowRef, useId, watch } from 'vue'
import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai'
import type { ChatClientState, ConnectionStatus } from '@tanstack/ai-client'
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
>(
  options: UseChatOptions<TTools, TSchema> = {} as UseChatOptions<
    TTools,
    TSchema
  >,
): UseChatReturn<TTools, TSchema> {
  const hookId = useId() // Available in Vue 3.5+
  const clientId = options.id || hookId

  const messages = shallowRef<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isLoading = shallowRef(false)
  const error = shallowRef<Error | undefined>(undefined)
  const status = shallowRef<ChatClientState>('ready')
  const isSubscribed = shallowRef(false)
  const connectionStatus = shallowRef<ConnectionStatus>('disconnected')
  const sessionGenerating = shallowRef(false)

  // Structured-output state. Runtime always tracks them — the conditional
  // return type hides them from callers that didn't supply `outputSchema`.
  type Partial = DeepPartial<InferSchemaType<NonNullable<TSchema>>>
  type Final = InferSchemaType<NonNullable<TSchema>>
  const partial = shallowRef<Partial>({} as Partial)
  const final = shallowRef<Final | null>(null)
  // Raw JSON accumulator — synchronous inside onChunk; no need to re-render
  // every delta solely to track the buffer.
  let rawJson = ''

  // Create ChatClient instance with callbacks to sync state.
  // Every user-provided callback is wrapped so the LATEST `options.xxx` value
  // is read at call time. Direct assignment would freeze the callback to the
  // reference we saw at setup time; the wrapper lets reactive `options` or
  // in-place mutations propagate. When the user clears a callback (sets it to
  // undefined), `?.` no-ops — unlike `client.updateOptions`, which silently
  // skips undefined and leaves the old callback installed.
  const client = new ChatClient({
    connection: options.connection,
    id: clientId,
    initialMessages: options.initialMessages,
    body: options.body,
    forwardedProps: options.forwardedProps,
    onResponse: (response) => options.onResponse?.(response),
    onChunk: (chunk: StreamChunk) => {
      // Internal structured-output tracking — runs before the user callback
      // so user code observes the same state. No-op when no schema is set.
      if (options.outputSchema !== undefined) {
        if (chunk.type === 'RUN_STARTED') {
          rawJson = ''
          partial.value = {} as Partial
          final.value = null
        } else if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
          rawJson += chunk.delta
          const progressive = parsePartialJSON(rawJson)
          if (progressive && typeof progressive === 'object') {
            partial.value = progressive as Partial
          }
        } else if (
          chunk.type === 'CUSTOM' &&
          chunk.name === 'structured-output.complete'
        ) {
          const value = chunk.value as { object: unknown }
          final.value = value.object as Final
        }
      }
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
    streamProcessor: options.streamProcessor,
    onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
      messages.value = newMessages
    },
    onLoadingChange: (newIsLoading: boolean) => {
      isLoading.value = newIsLoading
    },
    onStatusChange: (newStatus: ChatClientState) => {
      status.value = newStatus
    },
    onErrorChange: (newError: Error | undefined) => {
      error.value = newError
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

  // Sync body / forwardedProps changes to the client.
  // Both populate the same wire payload; `forwardedProps` is preferred
  // and `body` is deprecated but still supported.
  watch(
    () => [options.body, options.forwardedProps] as const,
    ([newBody, newForwardedProps]) => {
      client.updateOptions({
        body: newBody,
        forwardedProps: newForwardedProps,
      })
    },
  )

  watch(
    () => options.live,
    (live) => {
      if (live) {
        client.subscribe()
      } else {
        client.unsubscribe()
      }
    },
    { immediate: true },
  )

  // Cleanup on unmount: stop any in-flight requests
  // Note: client.stop() is safe to call even if nothing is in progress
  onScopeDispose(() => {
    if (options.live) {
      client.unsubscribe()
    } else {
      client.stop()
    }
  })

  // Callback options are read through `options.xxx` at call time, so reactive
  // or mutated options propagate without recreating the client.

  const sendMessage = async (content: string | MultimodalContent) => {
    await client.sendMessage(content)
  }

  const append = async (message: ModelMessage | UIMessage<TTools>) => {
    await client.append(message)
  }

  const reload = async () => {
    await client.reload()
  }

  const stop = () => {
    client.stop()
  }

  const clear = () => {
    client.clear()
  }

  const setMessagesManually = (newMessages: Array<UIMessage<TTools>>) => {
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
  }

  // partial / final are runtime-tracked unconditionally; the conditional
  // return type (UseChatReturn<TTools, TSchema>) hides them from callers that
  // didn't supply `outputSchema`.
  return {
    messages: readonly(messages),
    sendMessage,
    append,
    reload,
    stop,
    isLoading: readonly(isLoading),
    error: readonly(error),
    status: readonly(status),
    isSubscribed: readonly(isSubscribed),
    connectionStatus: readonly(connectionStatus),
    sessionGenerating: readonly(sessionGenerating),
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    addToolApprovalResponse,
    partial: readonly(partial),
    final: readonly(final),
  } as unknown as UseChatReturn<TTools, TSchema>
}
