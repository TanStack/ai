import {
  PluginClient,
  computeStructuredParts,
} from '@tanstack/ai-client/plugin'
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
} from '@tanstack/ai-client'
import type { PluginDefinition } from '@tanstack/ai/plugin'
import type { ModelMessage } from '@tanstack/ai'
import type { MultimodalContent, UIMessage } from './types'

/** Reactive chat-plugin state mirrored from the underlying ChatClient. */
interface ChatState {
  messages: Array<UIMessage<any>>
  isLoading: boolean
  error: Error | undefined
  status: ChatClientState
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
}

/** Reactive one-shot-plugin state mirrored from a GenerationClient. */
interface OneShotState {
  result: unknown
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
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
})

/**
 * Config keys reserved at the top level of the flat options object. Anything
 * that is NOT one of these keys is treated as a per-plugin options entry keyed
 * by the plugin's declared name. They are excluded from the per-name map at the
 * type level (below) so a plugin literally named `connection`/`id`/`threadId`
 * can never collide with these config keys.
 */
type ReservedOptionKey = 'connection' | 'id' | 'threadId'

/**
 * The FLAT options object accepted by {@link createPlugin}: the reserved config
 * keys at the top level, PLUS one optional entry per declared plugin name whose
 * value is that plugin's client options (`ChatPluginOptions` for chat plugins,
 * `GenerationPluginClientOptions` for generation plugins — see
 * `PluginOptionsMap`). Reserved keys are removed from the per-name map so they
 * can never collide with a plugin whose name happens to match a config key.
 *
 * This mirrors the reference shape shared with the other framework packages
 * (react/solid/vue):
 *
 * ```ts
 * createPlugin(def, {
 *   connection,                       // required transport
 *   id?, threadId?,                   // optional config
 *   drafting: { forwardedProps },     // chat plugin options
 *   heroImage: { onResult },          // generation plugin options
 * })
 * ```
 */
export type CreatePluginOptions<TDef extends PluginDefinition<any>> = {
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
 * Creates a reactive plugin instance for Svelte 5.
 *
 * This function wraps the `PluginClient` from `@tanstack/ai-client` and exposes
 * reactive state using Svelte 5 runes, one surface per declared plugin (any
 * number of chat plugins plus any one-shot/generation plugins). The returned
 * object exposes reactive getters that automatically update when state changes.
 *
 * Options are FLAT: reserved config keys (`connection`/`id`/`threadId`) sit at
 * the top level alongside one optional entry per plugin name. Internally the
 * function splits the reserved keys back out and feeds the remaining per-plugin
 * entries to `PluginClient` as its nested `plugins` map.
 *
 * @example
 * ```svelte
 * <script>
 *   import { createPlugin, fetchServerSentEvents } from '@tanstack/ai-svelte'
 *   // myPlugin: your definePlugin(...) value
 *
 *   const plugin = createPlugin(myPlugin, {
 *     connection: fetchServerSentEvents('/api/blog'),
 *     drafting: { forwardedProps: { tone: 'punchy' } },
 *     heroImage: { onResult: (img) => img.url },
 *   })
 * </script>
 *
 * <div>
 *   {#each plugin.primaryChat.messages as message}
 *     <div>{message.role}: {message.parts[0].content}</div>
 *   {/each}
 *
 *   <button onclick={() => plugin.primaryChat.sendMessage('Hello!')}>Send</button>
 *   <button onclick={() => plugin.heroImage.run({ prompt: 'a fox' })}>
 *     Generate banner
 *   </button>
 * </div>
 * ```
 */
export function createPlugin<
  TDef extends PluginDefinition<any>,
  // Capture the concrete options object so each generation plugin's `onResult`
  // transform flows into that plugin's `result` type.
  TOptions extends CreatePluginOptions<TDef> = CreatePluginOptions<TDef>,
>(
  plugin: TDef,
  options: TOptions,
  // The returned system is typed off the NESTED `{ plugins }` shape because the
  // client-side `PluginSystem`/`PluginResultType` helpers read per-plugin
  // options from a nested `plugins` key. We adapt the flat options to that shape
  // both here (type level) and below (runtime) — the flat→nested boundary lives
  // entirely inside this function.
): PluginSystem<TDef, { plugins: PerPluginOptions<TOptions> }> & {
  dispose: () => void
} {
  // Split the reserved config keys out of the flat options; every remaining
  // key is a per-plugin options entry keyed by plugin name.
  const { connection, id, threadId, ...pluginOptions } = options

  // Reactive state per chat plugin, keyed by plugin name. Initialized eagerly
  // for every declared plugin, since `plugin.plugins` is fixed at creation
  // time (mirrors `PluginClient`'s own constructor, which iterates the same
  // array).
  const chatStates = $state<Record<string, ChatState>>({})
  // Reactive state per one-shot plugin, keyed by plugin name.
  const oneShotStates = $state<Record<string, OneShotState>>({})
  for (const pluginName of plugin.plugins) {
    if (plugin.pluginKinds[pluginName] === 'chat') {
      chatStates[pluginName] = makeInitialChatState()
    } else {
      oneShotStates[pluginName] = makeInitialOneShotState()
    }
  }

  // Return (and lazily create) the reactive state slot for a plugin, avoiding
  // a non-null assertion at each call site below.
  const ensureChatState = (pluginName: string): ChatState => {
    let state = chatStates[pluginName]
    if (!state) {
      state = makeInitialChatState()
      chatStates[pluginName] = state
    }
    return state
  }
  const ensureOneShotState = (pluginName: string): OneShotState => {
    let state = oneShotStates[pluginName]
    if (!state) {
      state = makeInitialOneShotState()
      oneShotStates[pluginName] = state
    }
    return state
  }

  // Create the PluginClient eagerly, once. Reactive callbacks are passed into
  // the constructor (the only place ChatClient/GenerationClient accept them)
  // rather than via `updateOptions`, mirroring `createChat`.
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
    plugins: pluginOptions as unknown as PluginOptionsMap<TDef>,
    callbacks: {
      chat: (pluginName) => ({
        onMessagesChange: (newMessages) => {
          ensureChatState(pluginName).messages = newMessages
        },
        onLoadingChange: (newIsLoading) => {
          ensureChatState(pluginName).isLoading = newIsLoading
        },
        onErrorChange: (newError) => {
          ensureChatState(pluginName).error = newError
        },
        onStatusChange: (newStatus) => {
          ensureChatState(pluginName).status = newStatus
        },
        onSubscriptionChange: (nextIsSubscribed) => {
          ensureChatState(pluginName).isSubscribed = nextIsSubscribed
        },
        onConnectionStatusChange: (nextStatus) => {
          ensureChatState(pluginName).connectionStatus = nextStatus
        },
        onSessionGeneratingChange: (isGenerating) => {
          ensureChatState(pluginName).sessionGenerating = isGenerating
        },
      }),
      oneShot: (pluginName) => ({
        onResultChange: (result) => {
          ensureOneShotState(pluginName).result = result
        },
        onLoadingChange: (isLoading) => {
          ensureOneShotState(pluginName).isLoading = isLoading
        },
        onErrorChange: (error) => {
          ensureOneShotState(pluginName).error = error
        },
        onStatusChange: (status) => {
          ensureOneShotState(pluginName).status = status
        },
      }),
    },
  }

  const client = new PluginClient<TDef>(clientOptions)

  // Note: No auto-cleanup in Svelte — call `dispose()` in your component's
  // cleanup if needed. Unlike React/Vue/Solid, Svelte 5 runes like $effect
  // can only be used during component initialization.
  const dispose = () => {
    client.dispose()
  }

  // Build the returned system: one entry per declared plugin, plus a
  // top-level `dispose`. Uses getters so Svelte tracks the underlying
  // `$state` without a `$` prefix.
  const system: Record<string, unknown> = {}

  for (const pluginName of client.plugins) {
    const chatClient = client.chat(pluginName)
    if (chatClient) {
      ensureChatState(pluginName).messages = chatClient.getMessages()

      // Derived structured-output `partial`/`final`, recomputed whenever
      // this plugin's messages change (mirrors `usePlugin`'s `useMemo`).
      const structuredParts = $derived(
        computeStructuredParts(chatStates[pluginName]?.messages ?? []),
      )

      system[pluginName] = {
        get messages() {
          return chatStates[pluginName]?.messages ?? []
        },
        get isLoading() {
          return chatStates[pluginName]?.isLoading ?? false
        },
        get error() {
          return chatStates[pluginName]?.error
        },
        get status() {
          return chatStates[pluginName]?.status ?? 'ready'
        },
        get isSubscribed() {
          return chatStates[pluginName]?.isSubscribed ?? false
        },
        get connectionStatus() {
          return chatStates[pluginName]?.connectionStatus ?? 'disconnected'
        },
        get sessionGenerating() {
          return chatStates[pluginName]?.sessionGenerating ?? false
        },
        // Runtime shape unconditionally exposes partial/final; the public
        // PluginSystem type hides them when the chat plugin's outputSchema is
        // absent, matching useChat's behavior.
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
          // PluginChatSurface['sendMessage'] against this runtime branch,
          // mirroring the assembled-`system` cast at the end of this function.
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

    const oneShotClient = client.oneShot(pluginName)
    if (!oneShotClient) continue
    system[pluginName] = {
      run: async (input: any) => {
        await oneShotClient.generate(input)
        return oneShotClient.getResult()
      },
      get result() {
        return oneShotStates[pluginName]?.result ?? null
      },
      get isLoading() {
        return oneShotStates[pluginName]?.isLoading ?? false
      },
      get error() {
        return oneShotStates[pluginName]?.error
      },
      get status() {
        return oneShotStates[pluginName]?.status ?? 'idle'
      },
      stop: () => {
        oneShotClient.stop()
      },
      reset: () => {
        oneShotClient.reset()
      },
    }
  }

  system.dispose = dispose

  // eslint-disable-next-line no-restricted-syntax -- built dynamically from a runtime `plugin.plugins` array; the static PluginSystem<TDef, ...> shape can't be verified structurally here, plus the added `dispose` field.
  return system as unknown as PluginSystem<
    TDef,
    { plugins: PerPluginOptions<TOptions> }
  > & {
    dispose: () => void
  }
}
