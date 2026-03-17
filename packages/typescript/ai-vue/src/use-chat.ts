import { ChatClient } from '@tanstack/ai-client'
import { onScopeDispose, readonly, shallowRef, useId, watch } from 'vue'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type { ChatClientState, ConnectionStatus } from '@tanstack/ai-client'
import type {
  MultimodalContent,
  UIMessage,
  UseChatOptions,
  UseChatReturn,
} from './types'

export function useChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: UseChatOptions<TTools> = {} as UseChatOptions<TTools>,
): UseChatReturn<TTools> {
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

  // Create ChatClient instance with callbacks to sync state
  const client = new ChatClient({
    connection: options.connection,
    id: clientId,
    initialMessages: options.initialMessages,
    body: options.body,
    onResponse: options.onResponse,
    onChunk: options.onChunk,
    onFinish: (message) => {
      options.onFinish?.(message)
    },
    onError: (err) => {
      options.onError?.(err)
    },
    tools: options.tools,
    onCustomEvent: options.onCustomEvent,
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

  // Sync body changes to the client
  // This allows dynamic body values (like model selection) to be updated without recreating the client
  watch(
    () => options.body,
    (newBody) => {
      client.updateOptions({ body: newBody })
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

  // Note: Callback options (onResponse, onChunk, onFinish, onError, onToolCall)
  // are captured at client creation time. Changes to these callbacks require
  // remounting the component or changing the connection to recreate the client.

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
  }
}
