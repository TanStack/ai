import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
} from 'solid-js'
import { ChatClient } from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type { UIMessage, UseChatOptions, UseChatReturn } from './types'

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

  // Create ChatClient instance with callbacks to sync state
  // Note: Options are captured at client creation time.
  // The connection adapter can use functions for dynamic values (url, headers, etc.)
  // which are evaluated lazily on each request.
  const client = createMemo(() => {
    return new ChatClient({
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
        setMessages(newMessages)
      },
      onLoadingChange: (newIsLoading: boolean) => {
        setIsLoading(newIsLoading)
      },
      onErrorChange: (newError: Error | undefined) => {
        setError(newError)
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

  // Cleanup on unmount: stop any in-flight requests
  // Note: We use createEffect with a cleanup return to handle component unmount.
  // The cleanup only runs on disposal (unmount), not on signal changes.
  createEffect(() => {
    return () => {
      // Stop any active generation when component unmounts
      client().stop()
    }
  })

  // Note: Callback options (onResponse, onChunk, onFinish, onError, onToolCall)
  // are captured at client creation time. Changes to these callbacks require
  // remounting the component or changing the connection to recreate the client.

  const sendMessage = async (content: string) => {
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
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    addToolApprovalResponse,
  }
}
