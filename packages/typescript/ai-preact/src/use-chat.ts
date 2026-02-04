import { ChatClient } from '@tanstack/ai-client'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks'
import type { ChatClientState } from '@tanstack/ai-client'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'

import type { UIMessage, UseChatOptions, UseChatReturn } from './types'

export function useChat<TTools extends ReadonlyArray<AnyClientTool> = any>(
  options: UseChatOptions<TTools>,
): UseChatReturn<TTools> {
  const hookId = useId()
  const clientId = options.id || hookId

  const [messages, setMessages] = useState<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [status, setStatus] = useState<ChatClientState>('ready')

  // Track current messages in a ref to preserve them when client is recreated
  const messagesRef = useRef<Array<UIMessage<TTools>>>(
    options.initialMessages || [],
  )
  const isFirstMountRef = useRef(true)
  const optionsRef = useRef<UseChatOptions<TTools>>(options)

  optionsRef.current = options

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const client = useMemo(() => {
    // On first mount, use initialMessages. On subsequent recreations, preserve existing messages.
    const messagesToUse = isFirstMountRef.current
      ? options.initialMessages || []
      : messagesRef.current

    isFirstMountRef.current = false

    return new ChatClient({
      connection: optionsRef.current.connection,
      id: clientId,
      initialMessages: messagesToUse,
      body: optionsRef.current.body,
      onResponse: optionsRef.current.onResponse,
      onChunk: optionsRef.current.onChunk,
      onFinish: (message) => {
        optionsRef.current.onFinish?.(message)
      },
      onError: (err) => {
        optionsRef.current.onError?.(err)
      },
      tools: optionsRef.current.tools,
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
    })
  }, [clientId])

  // Sync body changes to the client
  // This allows dynamic body values (like model selection) to be updated without recreating the client
  useEffect(() => {
    client.updateOptions({ body: options.body })
  }, [client, options.body])

  // Sync initial messages on mount only
  // Note: initialMessages are passed to ChatClient constructor, but we also
  // set them here to ensure Preact state is in sync
  useEffect(() => {
    if (
      options.initialMessages &&
      options.initialMessages.length &&
      !messages.length
    ) {
      client.setMessagesManually(options.initialMessages)
    }
  }, [])

  // Cleanup on unmount: stop any in-flight requests
  // Note: We only cleanup when client changes or component unmounts.
  // DO NOT include isLoading in dependencies - that would cause the cleanup
  // to run when isLoading changes, aborting continuation requests.
  useEffect(() => {
    return () => {
      client.stop()
    }
  }, [client])

  // Note: Callback options (onResponse, onChunk, onFinish, onError, onToolCall)
  // are captured at client creation time. Changes to these callbacks require
  // remounting the component or changing the connection to recreate the client.
  const sendMessage = useCallback(
    async (content: string) => {
      await client.sendMessage(content)
    },
    [client],
  )

  const append = useCallback(
    async (message: ModelMessage | UIMessage) => {
      await client.append(message)
    },
    [client],
  )

  const reload = useCallback(async () => {
    await client.reload()
  }, [client])

  const stop = useCallback(() => {
    client.stop()
  }, [client])

  const clear = useCallback(() => {
    client.clear()
  }, [client])

  const setMessagesManually = useCallback(
    (newMessages: Array<UIMessage<TTools>>) => {
      client.setMessagesManually(newMessages)
    },
    [client],
  )

  const addToolResult = useCallback(
    async (result: {
      toolCallId: string
      tool: string
      output: any
      state?: 'output-available' | 'output-error'
      errorText?: string
    }) => {
      await client.addToolResult(result)
    },
    [client],
  )

  const addToolApprovalResponse = useCallback(
    async (response: { id: string; approved: boolean }) => {
      await client.addToolApprovalResponse(response)
    },
    [client],
  )

  return {
    messages,
    sendMessage,
    append,
    reload,
    stop,
    isLoading,
    error,
    status,
    setMessages: setMessagesManually,
    clear,
    addToolResult,
    addToolApprovalResponse,
  }
}
