import {
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
} from 'solid-js'

import {
  TransactionClient,
  computeStructuredParts,
} from '@tanstack/ai-client/transaction'
import type {
  ChatClientState,
  ConnectionStatus,
  GenerationClientState,
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'
import type {
  TransactionClientOptions,
  TransactionSubRun,
  TransactionSystem,
} from '@tanstack/ai-client/transaction'
import type { ModelMessage } from '@tanstack/ai'
import type { TransactionDefinition } from '@tanstack/ai/transaction'

/** Reactive chat-verb sub-state, mirrored from that verb's `ChatClient` callbacks. */
interface ChatState {
  messages: Array<UIMessage<any>>
  isLoading: boolean
  error: Error | undefined
  status: ChatClientState
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
}

/** Reactive one-shot-verb sub-state, mirrored from a `GenerationClient`'s callbacks. */
interface OneShotState {
  result: unknown
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
  subRuns: Array<TransactionSubRun>
}

const defaultChatState: ChatState = {
  messages: [],
  isLoading: false,
  error: undefined,
  status: 'ready',
  isSubscribed: false,
  connectionStatus: 'disconnected',
  sessionGenerating: false,
}

const defaultOneShotState: OneShotState = {
  result: null,
  isLoading: false,
  error: undefined,
  status: 'idle',
  subRuns: [],
}

/**
 * Solid hook wrapping `TransactionClient`, composing the existing chat +
 * generation clients behind one endpoint into a single typed system keyed by
 * the transaction's declared verbs.
 *
 * Mirrors the `useChat` idiom: state lives in `createSignal`s, the client is
 * built once in a `createMemo` (`clientId` is a stable per-hook id), and every
 * reactive callback is threaded into the `TransactionClient` constructor via
 * its `callbacks` option — `ChatClient` and `GenerationClient` only accept
 * these callbacks at construction time, not through `updateOptions`.
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
  const hookId = createUniqueId()
  const clientId = options.id || hookId

  const [chatState, setChatState] = createSignal<Record<string, ChatState>>({})
  const [oneShotState, setOneShotState] = createSignal<
    Record<string, OneShotState>
  >({})

  const patchChatState = (verb: string, patch: Partial<ChatState>) => {
    setChatState((s) => ({
      ...s,
      [verb]: { ...(s[verb] ?? defaultChatState), ...patch },
    }))
  }
  const patchOneShotState = (verb: string, patch: Partial<OneShotState>) => {
    setOneShotState((s) => ({
      ...s,
      [verb]: { ...(s[verb] ?? defaultOneShotState), ...patch },
    }))
  }

  // Build the TransactionClient with every reactive callback wired through the
  // constructor's `callbacks` option (ChatClient/GenerationClient only accept
  // these at construction time).
  const client = createMemo(() => {
    return new TransactionClient<TDef>({
      ...options,
      transaction,
      id: clientId,
      callbacks: {
        chat: (verb) => ({
          onMessagesChange: (messages) => patchChatState(verb, { messages }),
          onLoadingChange: (isLoading) => patchChatState(verb, { isLoading }),
          onErrorChange: (error) => patchChatState(verb, { error }),
          onStatusChange: (status) => patchChatState(verb, { status }),
          onSubscriptionChange: (isSubscribed) =>
            patchChatState(verb, { isSubscribed }),
          onConnectionStatusChange: (connectionStatus) =>
            patchChatState(verb, { connectionStatus }),
          onSessionGeneratingChange: (sessionGenerating) =>
            patchChatState(verb, { sessionGenerating }),
        }),
        oneShot: (verb) => ({
          onResultChange: (result) => patchOneShotState(verb, { result }),
          onLoadingChange: (isLoading) =>
            patchOneShotState(verb, { isLoading }),
          onErrorChange: (error) => patchOneShotState(verb, { error }),
          onStatusChange: (status) => patchOneShotState(verb, { status }),
          onSubRunsChange: (subRuns) => patchOneShotState(verb, { subRuns }),
        }),
      },
    })
  })

  // Sync initial chat state now that the client (and its per-verb chat
  // sub-clients) exists — mirrors useChat's `setMessages(client().getMessages())`.
  for (const verb of client().verbs) {
    const chatClient = client().chat(verb)
    if (chatClient) {
      patchChatState(verb, {
        messages: chatClient.getMessages(),
        isLoading: chatClient.getIsLoading(),
        error: chatClient.getError(),
        status: chatClient.getStatus(),
        isSubscribed: chatClient.getIsSubscribed(),
        connectionStatus: chatClient.getConnectionStatus(),
        sessionGenerating: chatClient.getSessionGenerating(),
      })
    }
  }

  onMount(() => {
    for (const verb of client().verbs) {
      client().chat(verb)?.mountDevtools()
    }
  })

  // Cleanup on unmount: tear down every chat and one-shot sub-client.
  onCleanup(() => {
    client().dispose()
  })

  // Narrowing helpers: verb presence is guaranteed by construction (a surface
  // for `verb` is only built below when the transaction actually declares it),
  // but the sub-client getters are typed as `T | undefined`, so reads go
  // through an explicit check rather than a non-null assertion.
  const requireChatClient = (verb: string) => {
    const chatClient = client().chat(verb)
    if (chatClient === undefined) {
      throw new Error(
        `useTransaction: "${verb}" is not a chat verb on this transaction`,
      )
    }
    return chatClient
  }

  const requireOneShotClient = (verb: string) => {
    const oneShotClient = client().oneShot(verb)
    if (oneShotClient === undefined) {
      throw new Error(
        `useTransaction: "${verb}" is not a one-shot verb on this transaction`,
      )
    }
    return oneShotClient
  }

  // Built dynamically per declared verb below; the object shape can't be
  // statically checked against the mapped `TransactionSystem` type, so it's
  // assembled as `Record<string, any>` and cast once at the end.
  const system: Record<string, any> = {}

  for (const verb of client().verbs) {
    if (client().chat(verb)) {
      system[verb] = {
        get messages() {
          return chatState()[verb]?.messages ?? defaultChatState.messages
        },
        get isLoading() {
          return chatState()[verb]?.isLoading ?? false
        },
        get error() {
          return chatState()[verb]?.error
        },
        get status() {
          return chatState()[verb]?.status ?? 'ready'
        },
        get isSubscribed() {
          return chatState()[verb]?.isSubscribed ?? false
        },
        get connectionStatus() {
          return chatState()[verb]?.connectionStatus ?? 'disconnected'
        },
        get sessionGenerating() {
          return chatState()[verb]?.sessionGenerating ?? false
        },
        // Runtime shape unconditionally exposes partial/final; the public
        // TransactionSystem type hides them when the chat verb's outputSchema
        // is absent, matching useChat's behavior.
        get partial() {
          return computeStructuredParts(chatState()[verb]?.messages ?? [])
            .partial
        },
        get final() {
          return computeStructuredParts(chatState()[verb]?.messages ?? []).final
        },
        sendMessage: async (content: string | MultimodalContent) => {
          const chatClient = requireChatClient(verb)
          await chatClient.sendMessage(content)
          const msgs = chatClient.getMessages()
          const hasStructured =
            msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
            false
          // Cast: TS can't structurally narrow the conditional return of
          // TransactionChatSurface['sendMessage'] against this runtime branch,
          // mirroring the assembled-`system` cast at the end of this hook.
          return (
            hasStructured ? computeStructuredParts(msgs).final : msgs
          ) as any
        },
        append: async (message: ModelMessage | UIMessage<any>) => {
          await requireChatClient(verb).append(message)
        },
        reload: async () => {
          await requireChatClient(verb).reload()
        },
        stop: () => {
          requireChatClient(verb).stop()
        },
        clear: () => {
          requireChatClient(verb).clear()
        },
        setMessages: (messages: Array<UIMessage<any>>) => {
          requireChatClient(verb).setMessagesManually(messages)
        },
        addToolResult: async (result: {
          toolCallId: string
          tool: string
          output: any
          state?: 'output-available' | 'output-error'
          errorText?: string
        }) => {
          await requireChatClient(verb).addToolResult(result)
        },
        addToolApprovalResponse: async (response: {
          id: string
          approved: boolean
        }) => {
          await requireChatClient(verb).addToolApprovalResponse(response)
        },
      }
      continue
    }

    if (!client().oneShot(verb)) continue
    system[verb] = {
      get result() {
        return oneShotState()[verb]?.result ?? null
      },
      get isLoading() {
        return oneShotState()[verb]?.isLoading ?? false
      },
      get error() {
        return oneShotState()[verb]?.error
      },
      get status() {
        return oneShotState()[verb]?.status ?? 'idle'
      },
      get subRuns() {
        return oneShotState()[verb]?.subRuns ?? defaultOneShotState.subRuns
      },
      run: async (input: Record<string, any>) => {
        const oneShotClient = requireOneShotClient(verb)
        await oneShotClient.generate(input)
        return oneShotClient.getResult()
      },
      stop: () => {
        requireOneShotClient(verb).stop()
      },
      reset: () => {
        requireOneShotClient(verb).reset()
      },
    }
  }

  // eslint-disable-next-line no-restricted-syntax -- built dynamically per declared verb; TS can't structurally verify the assembled object against the mapped TransactionSystem type
  return system as unknown as TransactionSystem<TDef, TOptions>
}
