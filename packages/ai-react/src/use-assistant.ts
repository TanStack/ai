import {
  AssistantClient,
  computeStructuredParts,
} from '@tanstack/ai-client/assistant'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { AssistantDefinition } from '@tanstack/ai/assistant'
import type { AnyClientTool } from '@tanstack/ai/client'
import type {
  AssistantClientOptions,
  AssistantSystem,
  OneShotCapabilityName,
} from '@tanstack/ai-client/assistant'
import type {
  ChatClientState,
  ConnectionStatus,
  GenerationClientState,
} from '@tanstack/ai-client'

/** Reactive chat-capability state mirrored from the underlying ChatClient. */
interface ChatState {
  messages: Array<any>
  isLoading: boolean
  error: Error | undefined
  status: ChatClientState
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
}

/** Reactive one-shot-capability state mirrored from a GenerationClient. */
interface OneShotState {
  result: any
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
}

const initialChatState: ChatState = {
  messages: [],
  isLoading: false,
  error: undefined,
  status: 'ready',
  isSubscribed: false,
  connectionStatus: 'disconnected',
  sessionGenerating: false,
}

const initialOneShotState: OneShotState = {
  result: null,
  isLoading: false,
  error: undefined,
  status: 'idle',
}

/**
 * React hook wrapping `AssistantClient`, composing the existing chat +
 * generation clients behind one endpoint into a single typed system keyed by
 * the assistant's declared capabilities.
 *
 * @example
 * ```tsx
 * const system = useAssistant(assistant, {
 *   connection: fetchServerSentEvents('/api/assistant'),
 * })
 *
 * await system.chat.sendMessage('hi')
 * await system.image.generate({ prompt: 'a fox' })
 * ```
 */
export function useAssistant<
  TDef extends AssistantDefinition<any>,
  TChatTools extends ReadonlyArray<AnyClientTool> = [],
>(
  assistant: TDef,
  options: Omit<
    AssistantClientOptions<TDef, TChatTools>,
    'assistant' | 'callbacks'
  >,
): AssistantSystem<TDef, TChatTools> {
  const hookId = useId()
  const clientId = options.id ?? hookId

  const optionsRef = useRef(options)
  optionsRef.current = options
  const activeClientRef = useRef<AssistantClient<TDef, TChatTools> | null>(null)

  const [chatState, setChatState] = useState<ChatState>(initialChatState)
  const [oneShotState, setOneShotState] = useState<
    Record<string, OneShotState>
  >({})

  const client = useMemo(() => {
    const initial = optionsRef.current

    const instance = new AssistantClient<TDef, TChatTools>({
      assistant,
      connection: initial.connection,
      id: clientId,
      threadId: initial.threadId,
      chat: initial.chat,
      callbacks: {
        chat: {
          onMessagesChange: (m) => {
            if (activeClientRef.current !== instance) return
            setChatState((s) => ({ ...s, messages: m }))
          },
          onLoadingChange: (v) => {
            if (activeClientRef.current !== instance) return
            setChatState((s) => ({ ...s, isLoading: v }))
          },
          onErrorChange: (v) => {
            if (activeClientRef.current !== instance) return
            setChatState((s) => ({ ...s, error: v }))
          },
          onStatusChange: (v) => {
            if (activeClientRef.current !== instance) return
            setChatState((s) => ({ ...s, status: v }))
          },
          onSubscriptionChange: (v) => {
            if (activeClientRef.current !== instance) return
            setChatState((s) => ({ ...s, isSubscribed: v }))
          },
          onConnectionStatusChange: (v) => {
            if (activeClientRef.current !== instance) return
            setChatState((s) => ({ ...s, connectionStatus: v }))
          },
          onSessionGeneratingChange: (v) => {
            if (activeClientRef.current !== instance) return
            setChatState((s) => ({ ...s, sessionGenerating: v }))
          },
        },
        oneShot: (cap) => ({
          onResultChange: (r) => {
            if (activeClientRef.current !== instance) return
            setOneShotState((s) => ({
              ...s,
              [cap]: { ...(s[cap] ?? initialOneShotState), result: r },
            }))
          },
          onLoadingChange: (v) => {
            if (activeClientRef.current !== instance) return
            setOneShotState((s) => ({
              ...s,
              [cap]: { ...(s[cap] ?? initialOneShotState), isLoading: v },
            }))
          },
          onErrorChange: (v) => {
            if (activeClientRef.current !== instance) return
            setOneShotState((s) => ({
              ...s,
              [cap]: { ...(s[cap] ?? initialOneShotState), error: v },
            }))
          },
          onStatusChange: (v) => {
            if (activeClientRef.current !== instance) return
            setOneShotState((s) => ({
              ...s,
              [cap]: { ...(s[cap] ?? initialOneShotState), status: v },
            }))
          },
        }),
      },
    })
    activeClientRef.current = instance
    return instance
    // Client is intentionally keyed only on clientId, mirroring useChat.
  }, [clientId])

  useEffect(() => {
    activeClientRef.current = client
    return () => {
      if (activeClientRef.current === client) {
        activeClientRef.current = null
      }
      client.dispose()
    }
  }, [client])

  const { partial, final } = useMemo(
    () => computeStructuredParts(chatState.messages),
    [chatState.messages],
  )

  const system = useMemo(() => {
    const out: Record<string, unknown> = {}

    for (const cap of client.capabilities) {
      if (cap === 'chat') {
        const c = client.chat
        if (!c) continue
        out.chat = {
          messages: chatState.messages,
          sendMessage: async (content: any) => {
            await c.sendMessage(content)
            const msgs = c.getMessages()
            const hasStructured =
              msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
              false
            // Cast: TS can't structurally narrow the conditional return of
            // AssistantChatSurface['sendMessage'] against this runtime branch,
            // mirroring the assembled-`system` cast below.
            return (
              hasStructured ? computeStructuredParts(msgs).final : msgs
            ) as any
          },
          append: (message: any) => c.append(message),
          reload: () => c.reload(),
          stop: () => c.stop(),
          clear: () => c.clear(),
          setMessages: (messages: any) => c.setMessagesManually(messages),
          addToolResult: (result: any) => c.addToolResult(result),
          addToolApprovalResponse: (response: any) =>
            c.addToolApprovalResponse(response),
          isLoading: chatState.isLoading,
          error: chatState.error,
          status: chatState.status,
          isSubscribed: chatState.isSubscribed,
          connectionStatus: chatState.connectionStatus,
          sessionGenerating: chatState.sessionGenerating,
          // Runtime shape unconditionally exposes partial/final; the public
          // AssistantSystem type hides them when the chat capability's
          // outputSchema is absent, matching useChat's behavior.
          partial,
          final,
        }
        continue
      }

      const g = client.get(cap as OneShotCapabilityName)
      if (!g) continue
      const slice = oneShotState[cap] ?? initialOneShotState
      out[cap] = {
        generate: async (input: any) => {
          await g.generate(input)
          return g.getResult()
        },
        result: slice.result,
        isLoading: slice.isLoading,
        error: slice.error,
        status: slice.status,
        stop: () => g.stop(),
        reset: () => g.reset(),
      }
    }

    return out as AssistantSystem<TDef, TChatTools>
  }, [client, chatState, oneShotState, partial, final])

  return system
}
