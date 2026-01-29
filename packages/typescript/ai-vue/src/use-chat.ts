import { ChatClient } from '@tanstack/ai-client'
import { onScopeDispose, readonly, shallowRef, useId, watch } from 'vue'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type { UIMessage, UseChatOptions, UseChatReturn } from './types'

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

  // Create ChatClient instance with callbacks to sync state
  const client = new ChatClient({
    connection: options.connection,
    id: clientId,
    initialMessages: options.initialMessages,
    body: options.body,
    onResponse: options.onResponse,
    onChunk: options.onChunk,
    onFinish: options.onFinish,
    onError: options.onError,
    tools: options.tools,
    streamProcessor: options.streamProcessor,
    onMessagesChange: (newMessages: Array<UIMessage<TTools>>) => {
      messages.value = newMessages
    },
    onLoadingChange: (newIsLoading: boolean) => {
      isLoading.value = newIsLoading
    },
    onErrorChange: (newError: Error | undefined) => {
      error.value = newError
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

  // Cleanup on unmount: stop any in-flight requests
  // Note: client.stop() is safe to call even if nothing is in progress
  onScopeDispose(() => {
    client.stop()
  })

  // Note: Callback options (onResponse, onChunk, onFinish, onError, onToolCall)
  // are captured at client creation time. Changes to these callbacks require
  // remounting the component or changing the connection to recreate the client.

  const sendMessage = async (content: string) => {
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
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    addToolApprovalResponse,
  }
}
