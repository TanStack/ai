import {
  TransactionClient,
  computeStructuredParts,
} from '@tanstack/ai-client/transaction'
import { computed, onMounted, onScopeDispose, readonly, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import type { ModelMessage } from '@tanstack/ai'
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
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'

/** Per-chat-verb reactive state mirrored from the underlying ChatClient. */
interface ChatRefs {
  messages: ShallowRef<Array<UIMessage<any>>>
  isLoading: ShallowRef<boolean>
  error: ShallowRef<Error | undefined>
  status: ShallowRef<ChatClientState>
  isSubscribed: ShallowRef<boolean>
  connectionStatus: ShallowRef<ConnectionStatus>
  sessionGenerating: ShallowRef<boolean>
}

/** Per-one-shot-verb reactive state mirrored from a GenerationClient. */
interface OneShotRefs {
  result: ShallowRef<unknown>
  isLoading: ShallowRef<boolean>
  error: ShallowRef<Error | undefined>
  status: ShallowRef<GenerationClientState>
  subRuns: ShallowRef<Array<TransactionSubRun>>
}

/**
 * Vue composable wrapping `TransactionClient`, composing the existing chat +
 * generation clients behind one endpoint into a single typed system keyed by
 * the transaction's declared verbs.
 *
 * Mirrors the `useChat` idiom: the `TransactionClient` is built eagerly,
 * once, with reactive state callbacks wired into its constructor —
 * `ChatClient` and `GenerationClient` (the sub-clients `TransactionClient`
 * composes) only accept these callbacks via construction, not
 * `updateOptions`, so they must be threaded through up front rather than
 * attached after the fact.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useTransaction } from '@tanstack/ai-vue/transaction'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * // transaction: your defineTransaction(...) value
 *
 * const txn = useTransaction(transaction, {
 *   connection: fetchServerSentEvents('/api/blog'),
 * })
 *
 * // txn.primaryChat.sendMessage('hi')
 * // txn.banner.run({ prompt: 'a fox' })
 * // txn.blogPost.subRuns — live sub-run state during a transaction run
 * </script>
 *
 * <template>
 *   <div v-for="message in txn.primaryChat.messages.value" :key="message.id">
 *     {{ message.parts[0]?.content }}
 *   </div>
 * </template>
 * ```
 */
export function useTransaction<
  TDef extends TransactionDefinition<any>,
  // Capture the options so per-verb `onResult` transforms flow into each
  // one-shot verb's `result` type.
  TOptions extends Omit<
    TransactionClientOptions<TDef>,
    'transaction' | 'callbacks'
  >,
>(transaction: TDef, options: TOptions): TransactionSystem<TDef, TOptions> {
  // Per-verb reactive state, keyed by verb name and created lazily the first
  // time the TransactionClient constructor asks for a verb's callbacks — so
  // the callbacks and the assembled surfaces share the same refs.
  const chatRefs = new Map<string, ChatRefs>()
  const oneShotRefs = new Map<string, OneShotRefs>()

  const getChatRefs = (verb: string): ChatRefs => {
    let refs = chatRefs.get(verb)
    if (!refs) {
      refs = {
        messages: shallowRef<Array<UIMessage<any>>>([]),
        isLoading: shallowRef(false),
        error: shallowRef<Error | undefined>(undefined),
        status: shallowRef<ChatClientState>('ready'),
        isSubscribed: shallowRef(false),
        connectionStatus: shallowRef<ConnectionStatus>('disconnected'),
        sessionGenerating: shallowRef(false),
      }
      chatRefs.set(verb, refs)
    }
    return refs
  }

  const getOneShotRefs = (verb: string): OneShotRefs => {
    let refs = oneShotRefs.get(verb)
    if (!refs) {
      refs = {
        result: shallowRef<unknown>(null),
        isLoading: shallowRef(false),
        error: shallowRef<Error | undefined>(undefined),
        status: shallowRef<GenerationClientState>('idle'),
        subRuns: shallowRef<Array<TransactionSubRun>>([]),
      }
      oneShotRefs.set(verb, refs)
    }
    return refs
  }

  // Build the TransactionClient eagerly, once (no memo). Reactive callbacks
  // are passed into the constructor's `callbacks` option — not wired up via
  // `updateOptions` afterwards — because the sub-clients (`ChatClient`,
  // `GenerationClient`) only accept these callbacks at construction time.
  const client = new TransactionClient<TDef>({
    ...options,
    transaction,
    callbacks: {
      chat: (verb) => {
        const refs = getChatRefs(verb)
        return {
          onMessagesChange: (messages) => {
            refs.messages.value = messages
          },
          onLoadingChange: (isLoading) => {
            refs.isLoading.value = isLoading
          },
          onErrorChange: (error) => {
            refs.error.value = error
          },
          onStatusChange: (status) => {
            refs.status.value = status
          },
          onSubscriptionChange: (isSubscribed) => {
            refs.isSubscribed.value = isSubscribed
          },
          onConnectionStatusChange: (connectionStatus) => {
            refs.connectionStatus.value = connectionStatus
          },
          onSessionGeneratingChange: (sessionGenerating) => {
            refs.sessionGenerating.value = sessionGenerating
          },
        }
      },
      oneShot: (verb) => {
        const refs = getOneShotRefs(verb)
        return {
          onResultChange: (result) => {
            refs.result.value = result
          },
          onLoadingChange: (isLoading) => {
            refs.isLoading.value = isLoading
          },
          onErrorChange: (error) => {
            refs.error.value = error
          },
          onStatusChange: (status) => {
            refs.status.value = status
          },
          onSubRunsChange: (subRuns) => {
            refs.subRuns.value = subRuns
          },
        }
      },
    },
  })

  onMounted(() => {
    for (const verbName of client.verbs) {
      client.chat(verbName)?.mountDevtools()
    }
  })

  // Cleanup on unmount: tears down every chat and one-shot sub-client (stops
  // in-flight requests, unregisters devtools).
  onScopeDispose(() => {
    client.dispose()
  })

  const system: Record<string, unknown> = {}

  for (const verbName of client.verbs) {
    const chatClient = client.chat(verbName)
    if (chatClient) {
      const refs = getChatRefs(verbName)
      const structuredParts = computed(() =>
        computeStructuredParts(refs.messages.value),
      )

      system[verbName] = {
        messages: readonly(refs.messages),
        sendMessage: async (content: string | MultimodalContent) => {
          await chatClient.sendMessage(content)
          const msgs = chatClient.getMessages()
          const hasStructured =
            msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
            false
          // Cast: TS can't structurally narrow the conditional return of
          // TransactionChatSurface['sendMessage'] against this runtime
          // branch, mirroring the assembled-`system` cast at the end of this
          // composable.
          return (
            hasStructured ? computeStructuredParts(msgs).final : msgs
          ) as any
        },
        append: async (message: ModelMessage | UIMessage<any>) => {
          await chatClient.append(message)
        },
        reload: async () => {
          await chatClient.reload()
        },
        stop: () => {
          chatClient.stop()
        },
        clear: () => {
          chatClient.clear()
        },
        setMessages: (messages: Array<UIMessage<any>>) => {
          chatClient.setMessagesManually(messages)
        },
        addToolResult: async (result: {
          toolCallId: string
          tool: string
          output: any
          state?: 'output-available' | 'output-error'
          errorText?: string
        }) => {
          await chatClient.addToolResult(result)
        },
        addToolApprovalResponse: async (response: {
          id: string
          approved: boolean
        }) => {
          await chatClient.addToolApprovalResponse(response)
        },
        isLoading: readonly(refs.isLoading),
        error: readonly(refs.error),
        status: readonly(refs.status),
        isSubscribed: readonly(refs.isSubscribed),
        connectionStatus: readonly(refs.connectionStatus),
        sessionGenerating: readonly(refs.sessionGenerating),
        // Runtime shape unconditionally exposes partial/final; the public
        // TransactionSystem type hides them when the chat verb's
        // outputSchema is absent, matching useChat's behavior.
        partial: readonly(computed(() => structuredParts.value.partial)),
        final: readonly(computed(() => structuredParts.value.final)),
      }
      continue
    }

    const oneShotClient = client.oneShot(verbName)
    // `client.verbs` only contains verbs the constructor built a sub-client
    // for, so this is always defined here — but the map lookup is typed as
    // possibly `undefined`, so guard rather than assert.
    if (!oneShotClient) continue

    const refs = getOneShotRefs(verbName)
    system[verbName] = {
      run: async (input: Record<string, any>) => {
        await oneShotClient.generate(input)
        return oneShotClient.getResult()
      },
      result: readonly(refs.result),
      isLoading: readonly(refs.isLoading),
      error: readonly(refs.error),
      status: readonly(refs.status),
      stop: () => {
        oneShotClient.stop()
      },
      reset: () => {
        oneShotClient.reset()
      },
      subRuns: readonly(refs.subRuns),
    }
  }

  // The runtime shape (refs nested per verb) diverges from the declared
  // `TransactionSystem` type (plain values) — the same divergence `useChat`
  // accepts for its return, since consumers unwrap refs via `.value`
  // (script) or Vue's template auto-unwrapping.
  // eslint-disable-next-line no-restricted-syntax -- composable return shape (nested refs per verb) diverges from the framework-agnostic TransactionSystem type (plain values); TS can't structurally relate the two
  return system as unknown as TransactionSystem<TDef, TOptions>
}
