import {
  AssistantClient,
  computeStructuredParts,
} from '@tanstack/ai-client/assistant'
import { computed, onMounted, onScopeDispose, readonly, shallowRef } from 'vue'
import type { ModelMessage } from '@tanstack/ai'
import type { AssistantDefinition } from '@tanstack/ai/assistant'
import type {
  AssistantClientOptions,
  AssistantSystem,
  OneShotCapabilityName,
} from '@tanstack/ai-client/assistant'
import type {
  AnyClientTool,
  ChatClientState,
  ConnectionStatus,
  GenerationClientState,
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'

/** Per-capability one-shot generation state, tracked in a single record ref. */
interface OneShotState {
  result: unknown
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
}

const DEFAULT_ONE_SHOT_STATE: OneShotState = {
  result: null,
  isLoading: false,
  error: undefined,
  status: 'idle',
}

/**
 * Vue composable for `AssistantDefinition`-based assistants: one composed
 * system exposing a typed surface per declared capability (`chat` plus any
 * one-shot capabilities like `image`, `speech`, `transcription`, etc.),
 * sharing a single connection.
 *
 * Mirrors the `useChat` idiom: the `AssistantClient` is built eagerly, once,
 * with reactive state callbacks wired into its constructor — `ChatClient`
 * and `GenerationClient` (the sub-clients `AssistantClient` composes) only
 * accept these callbacks via construction, not `updateOptions`, so they must
 * be threaded through up front rather than attached after the fact.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useAssistant } from '@tanstack/ai-vue'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * // assistant: your defineAssistant(...) value
 *
 * const system = useAssistant(assistant, {
 *   connection: fetchServerSentEvents('/api/assistant'),
 * })
 * </script>
 *
 * <template>
 *   <div v-for="message in system.chat.messages.value" :key="message.id">
 *     {{ message.parts[0]?.content }}
 *   </div>
 * </template>
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
  // Chat sub-client state.
  const chatMessages = shallowRef<Array<UIMessage<TChatTools>>>([])
  const chatIsLoading = shallowRef(false)
  const chatError = shallowRef<Error | undefined>(undefined)
  const chatStatus = shallowRef<ChatClientState>('ready')
  const chatIsSubscribed = shallowRef(false)
  const chatConnectionStatus = shallowRef<ConnectionStatus>('disconnected')
  const chatSessionGenerating = shallowRef(false)

  // One-shot capability state, keyed by capability name. A single record ref
  // (rather than one ref per capability) keeps the update path uniform
  // regardless of how many one-shot capabilities the assistant declares.
  const oneShotState = shallowRef<Record<string, OneShotState>>({})

  const updateOneShot = (capability: string, patch: Partial<OneShotState>) => {
    const previous = oneShotState.value[capability] ?? DEFAULT_ONE_SHOT_STATE
    oneShotState.value = {
      ...oneShotState.value,
      [capability]: { ...previous, ...patch },
    }
  }

  // Build the AssistantClient eagerly, once (no memo). Reactive callbacks are
  // passed into the constructor's `callbacks` option — not wired up via
  // `updateOptions` afterwards — because the sub-clients (`ChatClient`,
  // `GenerationClient`) only accept these callbacks at construction time.
  const client = new AssistantClient<TDef, TChatTools>({
    ...options,
    assistant,
    callbacks: {
      chat: {
        onMessagesChange: (messages) => {
          chatMessages.value = messages
        },
        onLoadingChange: (isLoading) => {
          chatIsLoading.value = isLoading
        },
        onErrorChange: (error) => {
          chatError.value = error
        },
        onStatusChange: (status) => {
          chatStatus.value = status
        },
        onSubscriptionChange: (isSubscribed) => {
          chatIsSubscribed.value = isSubscribed
        },
        onConnectionStatusChange: (connectionStatus) => {
          chatConnectionStatus.value = connectionStatus
        },
        onSessionGeneratingChange: (sessionGenerating) => {
          chatSessionGenerating.value = sessionGenerating
        },
      },
      oneShot: (capability) => ({
        onResultChange: (result) => updateOneShot(capability, { result }),
        onLoadingChange: (isLoading) =>
          updateOneShot(capability, { isLoading }),
        onErrorChange: (error) => updateOneShot(capability, { error }),
        onStatusChange: (status) => updateOneShot(capability, { status }),
      }),
    },
  })

  onMounted(() => {
    client.chat?.mountDevtools()
  })

  // Cleanup on unmount: tears down the chat sub-client and every one-shot
  // sub-client (stops in-flight requests, unregisters devtools).
  onScopeDispose(() => {
    client.dispose()
  })

  const structuredParts = computed(() =>
    computeStructuredParts(chatMessages.value),
  )

  const system: Record<string, unknown> = {}

  for (const capability of client.capabilities) {
    if (capability === 'chat') {
      const chatClient = client.chat
      // `client.capabilities` only contains 'chat' when the AssistantClient
      // constructor actually built the chat sub-client, so this is always
      // defined here — but the field type stays optional, so guard rather
      // than assert.
      if (!chatClient) continue

      system.chat = {
        messages: readonly(chatMessages),
        sendMessage: async (content: string | MultimodalContent) => {
          await chatClient.sendMessage(content)
          const msgs = chatClient.getMessages()
          const hasStructured =
            msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
            false
          // Cast: TS can't structurally narrow the conditional return of
          // AssistantChatSurface['sendMessage'] against this runtime branch,
          // mirroring the assembled-`system` cast at the end of this composable.
          return (
            hasStructured ? computeStructuredParts(msgs).final : msgs
          ) as any
        },
        append: async (message: ModelMessage | UIMessage<TChatTools>) => {
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
        setMessages: (messages: Array<UIMessage<TChatTools>>) => {
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
        isLoading: readonly(chatIsLoading),
        error: readonly(chatError),
        status: readonly(chatStatus),
        isSubscribed: readonly(chatIsSubscribed),
        connectionStatus: readonly(chatConnectionStatus),
        sessionGenerating: readonly(chatSessionGenerating),
        // Runtime shape unconditionally exposes partial/final; the public
        // AssistantSystem type hides them when the chat capability's
        // outputSchema is absent, matching useChat's behavior.
        partial: readonly(computed(() => structuredParts.value.partial)),
        final: readonly(computed(() => structuredParts.value.final)),
      }
      continue
    }

    const oneShotCapability = capability as OneShotCapabilityName
    const oneShotClient = client.get(oneShotCapability)
    // Same reasoning as `chatClient` above: declared in `capabilities`
    // implies the sub-client was constructed, but the map lookup is
    // typed as possibly `undefined`.
    if (!oneShotClient) continue

    system[capability] = {
      generate: async (input: Record<string, any>) => {
        await oneShotClient.generate(input)
        return oneShotClient.getResult()
      },
      result: computed(() => oneShotState.value[capability]?.result ?? null),
      isLoading: computed(
        () => oneShotState.value[capability]?.isLoading ?? false,
      ),
      error: computed(() => oneShotState.value[capability]?.error),
      status: computed(() => oneShotState.value[capability]?.status ?? 'idle'),
      stop: () => {
        oneShotClient.stop()
      },
      reset: () => {
        oneShotClient.reset()
      },
    }
  }

  // The runtime shape (refs nested per capability) diverges from the
  // declared `AssistantSystem` type (plain values) — the same divergence
  // `useChat` accepts for its return, since consumers unwrap refs via
  // `.value` (script) or Vue's template auto-unwrapping.
  // eslint-disable-next-line no-restricted-syntax -- composable return shape (nested refs per capability) diverges from the framework-agnostic AssistantSystem type (plain values); TS can't structurally relate the two
  return system as unknown as AssistantSystem<TDef, TChatTools>
}
