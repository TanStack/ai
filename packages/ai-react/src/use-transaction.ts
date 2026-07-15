import {
  TransactionClient,
  computeStructuredParts,
} from '@tanstack/ai-client/transaction'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { TransactionDefinition } from '@tanstack/ai/transaction'
import type {
  TransactionClientOptions,
  TransactionSubRun,
  TransactionSystem,
} from '@tanstack/ai-client/transaction'
import type {
  ChatClientState,
  ConnectionStatus,
  GenerationClientState,
} from '@tanstack/ai-client'

/** Reactive chat-verb state mirrored from the underlying ChatClient. */
interface ChatState {
  messages: Array<any>
  isLoading: boolean
  error: Error | undefined
  status: ChatClientState
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
}

/** Reactive one-shot-verb state mirrored from a GenerationClient. */
interface OneShotState {
  result: any
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
  subRuns: Array<TransactionSubRun>
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
  subRuns: [],
}

/**
 * React hook wrapping `TransactionClient`, composing the existing chat +
 * generation clients behind one endpoint into a single typed system keyed by
 * the transaction's declared verbs.
 *
 * @example
 * ```tsx
 * const txn = useTransaction(blogTransaction, {
 *   connection: fetchServerSentEvents('/api/blog'),
 * })
 *
 * await txn.primaryChat.sendMessage('hi')
 * await txn.banner.run({ prompt: 'a fox' })
 * txn.blogPost.subRuns // live sub-run state during a transaction run
 * ```
 */
export function useTransaction<
  TDef extends TransactionDefinition<any>,
  // Capture the options object so per-verb `onResult` transforms flow into
  // each one-shot verb's `result` type.
  TOptions extends Omit<
    TransactionClientOptions<TDef>,
    'transaction' | 'callbacks'
  >,
>(transaction: TDef, options: TOptions): TransactionSystem<TDef, TOptions> {
  const hookId = useId()
  const clientId = options.id ?? hookId

  const optionsRef = useRef(options)
  optionsRef.current = options
  const activeClientRef = useRef<TransactionClient<TDef> | null>(null)

  const [chatState, setChatState] = useState<Record<string, ChatState>>({})
  const [oneShotState, setOneShotState] = useState<
    Record<string, OneShotState>
  >({})

  const client = useMemo(() => {
    const initial = optionsRef.current

    const setChatSlice = (
      instance: TransactionClient<TDef>,
      verb: string,
      patch: Partial<ChatState>,
    ) => {
      if (activeClientRef.current !== instance) return
      setChatState((s) => ({
        ...s,
        [verb]: { ...(s[verb] ?? initialChatState), ...patch },
      }))
    }
    const setOneShotSlice = (
      instance: TransactionClient<TDef>,
      verb: string,
      patch: Partial<OneShotState>,
    ) => {
      if (activeClientRef.current !== instance) return
      setOneShotState((s) => ({
        ...s,
        [verb]: { ...(s[verb] ?? initialOneShotState), ...patch },
      }))
    }

    const instance: TransactionClient<TDef> = new TransactionClient<TDef>({
      ...initial,
      transaction,
      id: clientId,
      callbacks: {
        chat: (verb) => ({
          onMessagesChange: (m) =>
            setChatSlice(instance, verb, { messages: m }),
          onLoadingChange: (v) =>
            setChatSlice(instance, verb, { isLoading: v }),
          onErrorChange: (v) => setChatSlice(instance, verb, { error: v }),
          onStatusChange: (v) => setChatSlice(instance, verb, { status: v }),
          onSubscriptionChange: (v) =>
            setChatSlice(instance, verb, { isSubscribed: v }),
          onConnectionStatusChange: (v) =>
            setChatSlice(instance, verb, { connectionStatus: v }),
          onSessionGeneratingChange: (v) =>
            setChatSlice(instance, verb, { sessionGenerating: v }),
        }),
        oneShot: (verb) => ({
          onResultChange: (r) => setOneShotSlice(instance, verb, { result: r }),
          onLoadingChange: (v) =>
            setOneShotSlice(instance, verb, { isLoading: v }),
          onErrorChange: (v) => setOneShotSlice(instance, verb, { error: v }),
          onStatusChange: (v) => setOneShotSlice(instance, verb, { status: v }),
          onSubRunsChange: (subRuns) =>
            setOneShotSlice(instance, verb, { subRuns }),
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

  const system = useMemo(() => {
    const out: Record<string, unknown> = {}

    for (const verb of client.verbs) {
      const c = client.chat(verb)
      if (c) {
        const slice = chatState[verb] ?? initialChatState
        const { partial, final } = computeStructuredParts(slice.messages)
        out[verb] = {
          messages: slice.messages,
          sendMessage: async (content: any) => {
            await c.sendMessage(content)
            const msgs = c.getMessages()
            const hasStructured =
              msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
              false
            // Cast: TS can't structurally narrow the conditional return of
            // TransactionChatSurface['sendMessage'] against this runtime
            // branch, mirroring the assembled-`system` cast below.
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
          isLoading: slice.isLoading,
          error: slice.error,
          status: slice.status,
          isSubscribed: slice.isSubscribed,
          connectionStatus: slice.connectionStatus,
          sessionGenerating: slice.sessionGenerating,
          // Runtime shape unconditionally exposes partial/final; the public
          // TransactionSystem type hides them when the chat verb's
          // outputSchema is absent, matching useChat's behavior.
          partial,
          final,
        }
        continue
      }

      const g = client.oneShot(verb)
      if (!g) continue
      const slice = oneShotState[verb] ?? initialOneShotState
      out[verb] = {
        run: async (input: any) => {
          await g.generate(input)
          return g.getResult()
        },
        result: slice.result,
        isLoading: slice.isLoading,
        error: slice.error,
        status: slice.status,
        stop: () => g.stop(),
        reset: () => g.reset(),
        subRuns: slice.subRuns,
      }
    }

    return out as TransactionSystem<TDef, TOptions>
  }, [client, chatState, oneShotState])

  return system
}
