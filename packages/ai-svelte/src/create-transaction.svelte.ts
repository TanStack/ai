import {
  TransactionClient,
  computeStructuredParts,
} from '@tanstack/ai-client/transaction'
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
import type { TransactionDefinition } from '@tanstack/ai/transaction'
import type { ModelMessage } from '@tanstack/ai'
import type { MultimodalContent, UIMessage } from './types'

/** Reactive chat-verb state mirrored from the underlying ChatClient. */
interface ChatState {
  messages: Array<UIMessage<any>>
  isLoading: boolean
  error: Error | undefined
  status: ChatClientState
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
}

/** Reactive one-shot-verb state mirrored from a GenerationClient. */
interface OneShotState {
  result: unknown
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
  subRuns: Array<TransactionSubRun>
}

const makeInitialChatState = (): ChatState => ({
  messages: [],
  isLoading: false,
  error: undefined,
  status: 'ready',
  isSubscribed: false,
  connectionStatus: 'disconnected',
  sessionGenerating: false,
})

const makeInitialOneShotState = (): OneShotState => ({
  result: null,
  isLoading: false,
  error: undefined,
  status: 'idle',
  subRuns: [],
})

/**
 * Creates a reactive transaction instance for Svelte 5.
 *
 * This function wraps the `TransactionClient` from `@tanstack/ai-client` and
 * exposes reactive state using Svelte 5 runes, one surface per declared verb
 * (any number of chat verbs plus any one-shot verbs). The returned object
 * exposes reactive getters that automatically update when state changes.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createTransaction, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *   // myTransaction: your defineTransaction(...) value
 *
 *   const txn = createTransaction(myTransaction, {
 *     connection: fetchServerSentEvents('/api/blog'),
 *   })
 * </script>
 *
 * <div>
 *   {#each txn.primaryChat.messages as message}
 *     <div>{message.role}: {message.parts[0].content}</div>
 *   {/each}
 *
 *   <button onclick={() => txn.primaryChat.sendMessage('Hello!')}>Send</button>
 *   <button onclick={() => txn.banner.run({ prompt: 'a fox' })}>
 *     Generate banner
 *   </button>
 * </div>
 * ```
 */
export function createTransaction<
  TDef extends TransactionDefinition<any>,
  // Capture the options object so per-verb `onResult` transforms flow into
  // each one-shot verb's `result` type.
  TOptions extends Omit<
    TransactionClientOptions<TDef>,
    'transaction' | 'callbacks'
  > = Omit<TransactionClientOptions<TDef>, 'transaction' | 'callbacks'>,
>(
  transaction: TDef,
  options: TOptions,
): TransactionSystem<TDef, TOptions> & { dispose: () => void } {
  // Reactive state per chat verb, keyed by verb name. Initialized eagerly
  // for every declared verb, since `transaction.verbs` is fixed at creation
  // time (mirrors `TransactionClient`'s own constructor, which iterates the
  // same array).
  const chatStates = $state<Record<string, ChatState>>({})
  // Reactive state per one-shot verb, keyed by verb name.
  const oneShotStates = $state<Record<string, OneShotState>>({})
  for (const verbName of transaction.verbs) {
    if (transaction.verbKinds[verbName] === 'chat') {
      chatStates[verbName] = makeInitialChatState()
    } else {
      oneShotStates[verbName] = makeInitialOneShotState()
    }
  }

  // Return (and lazily create) the reactive state slot for a verb, avoiding
  // a non-null assertion at each call site below.
  const ensureChatState = (verbName: string): ChatState => {
    let state = chatStates[verbName]
    if (!state) {
      state = makeInitialChatState()
      chatStates[verbName] = state
    }
    return state
  }
  const ensureOneShotState = (verbName: string): OneShotState => {
    let state = oneShotStates[verbName]
    if (!state) {
      state = makeInitialOneShotState()
      oneShotStates[verbName] = state
    }
    return state
  }

  // Create the TransactionClient eagerly, once. Reactive callbacks are
  // passed into the constructor (the only place ChatClient/GenerationClient
  // accept them) rather than via `updateOptions`, mirroring `createChat`.
  const client = new TransactionClient<TDef>({
    ...options,
    transaction,
    callbacks: {
      chat: (verbName) => ({
        onMessagesChange: (newMessages) => {
          ensureChatState(verbName).messages = newMessages
        },
        onLoadingChange: (newIsLoading) => {
          ensureChatState(verbName).isLoading = newIsLoading
        },
        onErrorChange: (newError) => {
          ensureChatState(verbName).error = newError
        },
        onStatusChange: (newStatus) => {
          ensureChatState(verbName).status = newStatus
        },
        onSubscriptionChange: (nextIsSubscribed) => {
          ensureChatState(verbName).isSubscribed = nextIsSubscribed
        },
        onConnectionStatusChange: (nextStatus) => {
          ensureChatState(verbName).connectionStatus = nextStatus
        },
        onSessionGeneratingChange: (isGenerating) => {
          ensureChatState(verbName).sessionGenerating = isGenerating
        },
      }),
      oneShot: (verbName) => ({
        onResultChange: (result) => {
          ensureOneShotState(verbName).result = result
        },
        onLoadingChange: (isLoading) => {
          ensureOneShotState(verbName).isLoading = isLoading
        },
        onErrorChange: (error) => {
          ensureOneShotState(verbName).error = error
        },
        onStatusChange: (status) => {
          ensureOneShotState(verbName).status = status
        },
        onSubRunsChange: (subRuns) => {
          ensureOneShotState(verbName).subRuns = subRuns
        },
      }),
    },
  })

  // Note: No auto-cleanup in Svelte — call `dispose()` in your component's
  // cleanup if needed. Unlike React/Vue/Solid, Svelte 5 runes like $effect
  // can only be used during component initialization.
  const dispose = () => {
    client.dispose()
  }

  // Build the returned system: one entry per declared verb, plus a
  // top-level `dispose`. Uses getters so Svelte tracks the underlying
  // `$state` without a `$` prefix.
  const system: Record<string, unknown> = {}

  for (const verbName of client.verbs) {
    const chatClient = client.chat(verbName)
    if (chatClient) {
      ensureChatState(verbName).messages = chatClient.getMessages()

      // Derived structured-output `partial`/`final`, recomputed whenever
      // this verb's messages change (mirrors `useTransaction`'s `useMemo`).
      const structuredParts = $derived(
        computeStructuredParts(chatStates[verbName]?.messages ?? []),
      )

      system[verbName] = {
        get messages() {
          return chatStates[verbName]?.messages ?? []
        },
        get isLoading() {
          return chatStates[verbName]?.isLoading ?? false
        },
        get error() {
          return chatStates[verbName]?.error
        },
        get status() {
          return chatStates[verbName]?.status ?? 'ready'
        },
        get isSubscribed() {
          return chatStates[verbName]?.isSubscribed ?? false
        },
        get connectionStatus() {
          return chatStates[verbName]?.connectionStatus ?? 'disconnected'
        },
        get sessionGenerating() {
          return chatStates[verbName]?.sessionGenerating ?? false
        },
        // Runtime shape unconditionally exposes partial/final; the public
        // TransactionSystem type hides them when the chat verb's
        // outputSchema is absent, matching useChat's behavior.
        get partial() {
          return structuredParts.partial
        },
        get final() {
          return structuredParts.final
        },
        sendMessage: async (content: string | MultimodalContent) => {
          await chatClient.sendMessage(content)
          const msgs = chatClient.getMessages()
          const hasStructured =
            msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
            false
          // Cast: TS can't structurally narrow the conditional return of
          // TransactionChatSurface['sendMessage'] against this runtime
          // branch, mirroring the assembled-`system` cast at the end of
          // this function.
          return (
            hasStructured ? computeStructuredParts(msgs).final : msgs
          ) as any
        },
        append: (message: ModelMessage | UIMessage<any>) =>
          chatClient.append(message),
        reload: () => chatClient.reload(),
        stop: () => chatClient.stop(),
        clear: () => chatClient.clear(),
        setMessages: (newMessages: Array<UIMessage<any>>) =>
          chatClient.setMessagesManually(newMessages),
        addToolResult: (result: {
          toolCallId: string
          tool: string
          output: any
          state?: 'output-available' | 'output-error'
          errorText?: string
        }) => chatClient.addToolResult(result),
        addToolApprovalResponse: (response: {
          id: string
          approved: boolean
        }) => chatClient.addToolApprovalResponse(response),
      }
      continue
    }

    const oneShotClient = client.oneShot(verbName)
    if (!oneShotClient) continue
    system[verbName] = {
      run: async (input: any) => {
        await oneShotClient.generate(input)
        return oneShotClient.getResult()
      },
      get result() {
        return oneShotStates[verbName]?.result ?? null
      },
      get isLoading() {
        return oneShotStates[verbName]?.isLoading ?? false
      },
      get error() {
        return oneShotStates[verbName]?.error
      },
      get status() {
        return oneShotStates[verbName]?.status ?? 'idle'
      },
      stop: () => {
        oneShotClient.stop()
      },
      reset: () => {
        oneShotClient.reset()
      },
      get subRuns() {
        return oneShotStates[verbName]?.subRuns ?? []
      },
    }
  }

  system.dispose = dispose

  // eslint-disable-next-line no-restricted-syntax -- built dynamically from a runtime `transaction.verbs` array; the static TransactionSystem<TDef, TOptions> shape can't be verified structurally here, plus the added `dispose` field.
  return system as unknown as TransactionSystem<TDef, TOptions> & {
    dispose: () => void
  }
}
