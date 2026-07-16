import {
  PluginClient,
  computeStructuredParts,
} from '@tanstack/ai-client/plugin'
import { computed, onMounted, onScopeDispose, readonly, shallowRef } from 'vue'
import type { ShallowRef } from 'vue'
import type { ModelMessage } from '@tanstack/ai'
import type { PluginDefinition } from '@tanstack/ai-plugin-toolkit'
import type {
  PluginClientOptions,
  PluginOptionsMap,
  PluginSystem,
} from '@tanstack/ai-client/plugin'
import type {
  ChatClientState,
  ConnectConnectionAdapter,
  ConnectionStatus,
  GenerationClientState,
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'

/** Per-chat-plugin reactive state mirrored from the underlying ChatClient. */
interface ChatRefs {
  messages: ShallowRef<Array<UIMessage<any>>>
  isLoading: ShallowRef<boolean>
  error: ShallowRef<Error | undefined>
  status: ShallowRef<ChatClientState>
  isSubscribed: ShallowRef<boolean>
  connectionStatus: ShallowRef<ConnectionStatus>
  sessionGenerating: ShallowRef<boolean>
}

/** Per-generation-plugin reactive state mirrored from a GenerationClient. */
interface OneShotRefs {
  result: ShallowRef<unknown>
  isLoading: ShallowRef<boolean>
  error: ShallowRef<Error | undefined>
  status: ShallowRef<GenerationClientState>
}

/**
 * Config keys reserved at the top level of the flat options object. Anything
 * that is NOT one of these keys is treated as a per-plugin options entry keyed
 * by the plugin's declared name. They are excluded from the per-name map at the
 * type level (below) so a plugin literally named `connection`/`id`/`threadId`
 * can never collide with these config keys.
 */
type ReservedOptionKey = 'connection' | 'id' | 'threadId'

/**
 * The FLAT options object accepted by {@link usePlugin}: the reserved config
 * keys at the top level, PLUS one optional entry per declared plugin name whose
 * value is that plugin's client options (`ChatPluginOptions` for chat plugins,
 * `GenerationPluginClientOptions` for generation plugins — see
 * `PluginOptionsMap`). Reserved keys are removed from the per-name map so they
 * can never collide with a plugin whose name happens to match a config key.
 *
 * Mirrors the `@tanstack/ai-react` reference shape:
 *
 * ```ts
 * usePlugin(def, {
 *   connection,                       // required transport
 *   id?, threadId?,                   // optional config
 *   drafting: { forwardedProps },     // chat plugin options
 *   heroImage: { onResult },          // generation plugin options
 * })
 * ```
 */
export type UsePluginOptions<TDef extends PluginDefinition<any>> = {
  connection: ConnectConnectionAdapter
  id?: string
  threadId?: string
} & Omit<PluginOptionsMap<TDef>, ReservedOptionKey>

/**
 * The per-plugin options extracted from the flat options object once the
 * reserved config keys have been removed — i.e. exactly the nested `plugins`
 * map the underlying `PluginClient` consumes.
 */
type PerPluginOptions<TOptions> = Omit<TOptions, ReservedOptionKey>

/**
 * Vue composable wrapping `PluginClient`, composing the existing chat +
 * generation clients behind one endpoint into a single typed system keyed by
 * the plugin's declared names.
 *
 * Options are FLAT: reserved config keys (`connection`/`id`/`threadId`) sit at
 * the top level alongside one optional entry per plugin name. Internally the
 * composable splits the reserved keys back out and feeds the remaining
 * per-plugin entries to `PluginClient` as its nested `plugins` map.
 *
 * Mirrors the `useChat` idiom: the `PluginClient` is built eagerly, once, with
 * reactive state callbacks wired into its constructor — `ChatClient` and
 * `GenerationClient` (the sub-clients `PluginClient` composes) only accept
 * these callbacks via construction, not `updateOptions`, so they must be
 * threaded through up front rather than attached after the fact.
 *
 * @example
 * ```vue
 * <script setup>
 * import { usePlugin } from '@tanstack/ai-vue/plugin'
 * import { fetchServerSentEvents } from '@tanstack/ai-client'
 * // plugin: your definePlugin(...) value
 *
 * const system = usePlugin(plugin, {
 *   connection: fetchServerSentEvents('/api/blog'),
 *   drafting: { forwardedProps: { tone: 'punchy' } },
 *   heroImage: { onResult: (img) => img.url },
 * })
 *
 * // system.drafting.sendMessage('hi')
 * // system.heroImage.run({ prompt: 'a fox' })
 * </script>
 *
 * <template>
 *   <div v-for="message in system.drafting.messages.value" :key="message.id">
 *     {{ message.parts[0]?.content }}
 *   </div>
 * </template>
 * ```
 */
export function usePlugin<
  TDef extends PluginDefinition<any>,
  // Capture the concrete options object so each generation plugin's `onResult`
  // transform flows into that plugin's `result` type.
  TOptions extends UsePluginOptions<TDef>,
>(
  plugin: TDef,
  options: TOptions,
  // The returned system is typed off the NESTED `{ plugins }` shape because the
  // client-side `PluginSystem`/`PluginResultType` helpers read per-plugin
  // options from a nested `plugins` key. We adapt the flat options to that shape
  // both here (type level) and below (runtime) — the flat→nested boundary lives
  // entirely inside this composable.
): PluginSystem<TDef, { plugins: PerPluginOptions<TOptions> }> {
  // Per-plugin reactive state, keyed by plugin name and created lazily the first
  // time the PluginClient constructor asks for a plugin's callbacks — so the
  // callbacks and the assembled surfaces share the same refs.
  const chatRefs = new Map<string, ChatRefs>()
  const oneShotRefs = new Map<string, OneShotRefs>()

  const getChatRefs = (pluginName: string): ChatRefs => {
    let refs = chatRefs.get(pluginName)
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
      chatRefs.set(pluginName, refs)
    }
    return refs
  }

  const getOneShotRefs = (pluginName: string): OneShotRefs => {
    let refs = oneShotRefs.get(pluginName)
    if (!refs) {
      refs = {
        result: shallowRef<unknown>(null),
        isLoading: shallowRef(false),
        error: shallowRef<Error | undefined>(undefined),
        status: shallowRef<GenerationClientState>('idle'),
      }
      oneShotRefs.set(pluginName, refs)
    }
    return refs
  }

  // Split the reserved config keys out of the flat options; every remaining key
  // is a per-plugin options entry keyed by plugin name. Widen to the concrete
  // flat-options type first (a safe upcast, since TOptions extends it) so the
  // rest-destructure yields the concrete per-plugin map instead of an opaque
  // generic `Omit`.
  const base: UsePluginOptions<TDef> = options
  const { connection, id, threadId, ...pluginOptions } = base

  const clientOptions: PluginClientOptions<TDef> = {
    plugin,
    connection,
    id,
    threadId,
    // Flat→nested adaptation: the leftover per-name entries ARE the client's
    // nested `plugins` map. Bridged through `unknown` because for a generic
    // `TDef`, TS can't relate the rest's key set (`plugin names minus reserved
    // keys`) to `PluginOptionsMap`'s (`all plugin names`). The conversion is
    // safe by construction: reserving `connection`/`id`/`threadId` makes it
    // impossible to supply options for a plugin whose name collides with a
    // config key, so this map is exactly `PluginOptionsMap` minus (at most)
    // those never-present optional keys.
    // eslint-disable-next-line no-restricted-syntax -- flat→nested bridge: for a generic `TDef`, TS can't relate the rest's key set (plugin names minus reserved keys) to `PluginOptionsMap`'s (all plugin names); safe by construction (see comment above)
    plugins: pluginOptions as unknown as PluginOptionsMap<TDef>,
    // Build the PluginClient eagerly, once (no memo). Reactive callbacks are
    // passed into the constructor's `callbacks` option — not wired up via
    // `updateOptions` afterwards — because the sub-clients (`ChatClient`,
    // `GenerationClient`) only accept these callbacks at construction time.
    callbacks: {
      chat: (pluginName) => {
        const refs = getChatRefs(pluginName)
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
      oneShot: (pluginName) => {
        const refs = getOneShotRefs(pluginName)
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
        }
      },
    },
  }

  const client = new PluginClient<TDef>(clientOptions)

  onMounted(() => {
    for (const pluginName of client.plugins) {
      client.chat(pluginName)?.mountDevtools()
    }
  })

  // Cleanup on unmount: tears down every chat and one-shot sub-client (stops
  // in-flight requests, unregisters devtools).
  onScopeDispose(() => {
    client.dispose()
  })

  const system: Record<string, unknown> = {}

  for (const pluginName of client.plugins) {
    const chatClient = client.chat(pluginName)
    if (chatClient) {
      const refs = getChatRefs(pluginName)
      const structuredParts = computed(() =>
        computeStructuredParts(refs.messages.value),
      )

      system[pluginName] = {
        messages: readonly(refs.messages),
        sendMessage: async (content: string | MultimodalContent) => {
          await chatClient.sendMessage(content)
          const msgs = chatClient.getMessages()
          const hasStructured =
            msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
            false
          // Cast: TS can't structurally narrow the conditional return of
          // PluginChatSurface['sendMessage'] against this runtime branch,
          // mirroring the assembled-`system` cast at the end of this
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
        // PluginSystem type hides them when the chat plugin's outputSchema is
        // absent, matching useChat's behavior.
        partial: readonly(computed(() => structuredParts.value.partial)),
        final: readonly(computed(() => structuredParts.value.final)),
      }
      continue
    }

    const oneShotClient = client.oneShot(pluginName)
    // `client.plugins` only contains plugins the constructor built a sub-client
    // for, so this is always defined here — but the map lookup is typed as
    // possibly `undefined`, so guard rather than assert.
    if (!oneShotClient) continue

    const refs = getOneShotRefs(pluginName)
    system[pluginName] = {
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
    }
  }

  // The runtime shape (refs nested per plugin) diverges from the declared
  // `PluginSystem` type (plain values) — the same divergence `useChat`
  // accepts for its return, since consumers unwrap refs via `.value`
  // (script) or Vue's template auto-unwrapping.
  // eslint-disable-next-line no-restricted-syntax -- composable return shape (nested refs per plugin) diverges from the framework-agnostic PluginSystem type (plain values); TS can't structurally relate the two
  return system as unknown as PluginSystem<
    TDef,
    { plugins: PerPluginOptions<TOptions> }
  >
}
