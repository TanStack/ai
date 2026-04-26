import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
} from 'solid-js'

import { ChatClient } from '@tanstack/ai-client'
import type { ChatClientState, ConnectionStatus } from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type {
  MultimodalContent,
  UIMessage,
  UseChatOptions,
  UseChatReturn,
} from './types'

export function useChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: UseChatOptions<TTools> = {} as UseChatOptions<TTools>,
): UseChatReturn<TTools> {
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

  // Create ChatClient instance with callbacks to sync state.
  // Every user-provided callback is wrapped so the LATEST `options.xxx` value
  // is read at call time. Direct assignment would freeze the callback to the
  // reference we saw at creation; the wrapper lets reactive `options` or
  // in-place mutations propagate. When the user clears a callback (sets it to
  // undefined), `?.` no-ops.
  const client = createMemo(() => {
    return new ChatClient({
      connection: options.connection,
      id: clientId,
      initialMessages: options.initialMessages,
      body: options.body,
      onResponse: (response) => options.onResponse?.(response),
      onChunk: (chunk) => options.onChunk?.(chunk),
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

  // Sync body changes to the client
  // This allows dynamic body values (like model selection) to be updated without recreating the client
  createEffect(() => {
    const currentBody = options.body
    client().updateOptions({ body: currentBody })
  })

  // Sync initial messages on mount only
  // Note: initialMessages are passed to ChatClient constructor, but we also
  // set them here to ensure React state is in sync
  createEffect(() => {
    if (options.initialMessages && options.initialMessages.length > 0) {
      // Only set if current messages are empty (initial state)
      if (messages().length === 0) {
        client().setMessagesManually(options.initialMessages)
      }
    }
  }) // Only run on mount - initialMessages are handled by ChatClient constructor

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

  // Cleanup on unmount: stop any in-flight requests.
  onCleanup(() => {
    if (options.live) {
      client().unsubscribe()
    } else {
      client().stop()
    }
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
  }
}
