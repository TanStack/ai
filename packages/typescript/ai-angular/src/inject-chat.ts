import { DestroyRef, inject, signal } from '@angular/core'
import { ChatClient } from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'

import type { InjectChatOptions, InjectChatReturn, UIMessage } from './types'

/**
 * Creates a chat client bound to the current Angular injection context.
 *
 * This is a signals-first adapter around `ChatClient` from `@tanstack/ai-client`.
 * It exposes chat state as Angular `Signal`s and automatically stops any in-flight
 * streaming request when the current context is destroyed.
 *
 * @example
 * ```ts
 * import { injectChat, fetchServerSentEvents } from '@tanstack/ai-angular'
 *
 * const chat = injectChat({
 *   connection: fetchServerSentEvents('/api/chat'),
 * })
 *
 * chat.sendMessage('Hello')
 * ```
 */
export function injectChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: InjectChatOptions<TTools> = {} as InjectChatOptions<TTools>,
): InjectChatReturn<TTools> {
  // Ensure we bind lifecycle cleanup to the current injection context.
  const destroyRef = inject(DestroyRef)

  // Use caller-provided id if present; otherwise generate a stable-ish id.
  const clientId =
    options.id ||
    `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  // Signals mirror ChatClient internal state.
  const messages = signal<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isLoading = signal(false)
  const error = signal<Error | undefined>(undefined)

  // Create ChatClient instance with callbacks that keep signals in sync.
  // Note: options are captured at creation time (same behavior as other adapters).
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
      messages.set(newMessages)
    },
    onLoadingChange: (newIsLoading: boolean) => {
      isLoading.set(newIsLoading)
    },
    onErrorChange: (newError: Error | undefined) => {
      error.set(newError)
    },
  })

  // Cleanup on destroy: stop any in-flight requests.
  destroyRef.onDestroy(() => {
    client.stop()
  })

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
