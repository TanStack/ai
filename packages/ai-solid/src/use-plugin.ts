import {
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
} from 'solid-js'

import {
  PluginClient,
  computeStructuredParts,
} from '@tanstack/ai-client/plugin'
import type {
  ChatClientState,
  ConnectConnectionAdapter,
  ConnectionStatus,
  GenerationClientState,
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'
import type {
  PluginClientOptions,
  PluginOptionsMap,
  PluginSystem,
} from '@tanstack/ai-client/plugin'
import type { ModelMessage } from '@tanstack/ai'
import type { PluginDefinition } from '@tanstack/ai/plugin'

/** Reactive chat-plugin sub-state, mirrored from that plugin's `ChatClient` callbacks. */
interface ChatState {
  messages: Array<UIMessage<any>>
  isLoading: boolean
  error: Error | undefined
  status: ChatClientState
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
}

/** Reactive generation-plugin sub-state, mirrored from a `GenerationClient`'s callbacks. */
interface OneShotState {
  result: unknown
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
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
 * Mirrors the ai-react reference shape:
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
 * Solid hook wrapping `PluginClient`, composing the existing chat + generation
 * clients behind one endpoint into a single typed system keyed by the plugin's
 * declared names.
 *
 * Mirrors the `useChat` idiom: state lives in `createSignal`s, the client is
 * built once in a `createMemo` (`clientId` is a stable per-hook id), and every
 * reactive callback is threaded into the `PluginClient` constructor via its
 * `callbacks` option — `ChatClient` and `GenerationClient` only accept these
 * callbacks at construction time, not through `updateOptions`.
 *
 * Options are FLAT: reserved config keys (`connection`/`id`/`threadId`) sit at
 * the top level alongside one optional entry per plugin name. Internally the
 * hook splits the reserved keys back out and feeds the remaining per-plugin
 * entries to `PluginClient` as its nested `plugins` map.
 *
 * @example
 * ```tsx
 * const plugin = usePlugin(blogPlugin, {
 *   connection: fetchServerSentEvents('/api/blog'),
 *   drafting: { forwardedProps: { tone: 'punchy' } },
 *   heroImage: { onResult: (img) => img.url },
 * })
 *
 * await plugin.drafting.sendMessage('hi')
 * await plugin.heroImage.run({ prompt: 'a fox' })
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
  // entirely inside this hook.
): PluginSystem<TDef, { plugins: PerPluginOptions<TOptions> }> {
  const hookId = createUniqueId()
  const clientId = options.id || hookId

  const [chatState, setChatState] = createSignal<Record<string, ChatState>>({})
  const [oneShotState, setOneShotState] = createSignal<
    Record<string, OneShotState>
  >({})

  const patchChatState = (pluginName: string, patch: Partial<ChatState>) => {
    setChatState((s) => ({
      ...s,
      [pluginName]: { ...(s[pluginName] ?? defaultChatState), ...patch },
    }))
  }
  const patchOneShotState = (
    pluginName: string,
    patch: Partial<OneShotState>,
  ) => {
    setOneShotState((s) => ({
      ...s,
      [pluginName]: { ...(s[pluginName] ?? defaultOneShotState), ...patch },
    }))
  }

  // Build the PluginClient with every reactive callback wired through the
  // constructor's `callbacks` option (ChatClient/GenerationClient only accept
  // these at construction time).
  const client = createMemo(() => {
    // Widen to the concrete flat-options type first (a safe upcast, since
    // TOptions extends it) so the rest-destructure below yields the concrete
    // per-plugin map instead of an opaque generic `Omit`.
    const base: UsePluginOptions<TDef> = options
    // Split the reserved config keys out of the flat options; every remaining
    // key is a per-plugin options entry keyed by plugin name.
    const { connection, id, threadId, ...pluginOptions } = base

    const clientOptions: PluginClientOptions<TDef> = {
      plugin,
      connection,
      id: id ?? clientId,
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
          onMessagesChange: (messages) =>
            patchChatState(pluginName, { messages }),
          onLoadingChange: (isLoading) =>
            patchChatState(pluginName, { isLoading }),
          onErrorChange: (error) => patchChatState(pluginName, { error }),
          onStatusChange: (status) => patchChatState(pluginName, { status }),
          onSubscriptionChange: (isSubscribed) =>
            patchChatState(pluginName, { isSubscribed }),
          onConnectionStatusChange: (connectionStatus) =>
            patchChatState(pluginName, { connectionStatus }),
          onSessionGeneratingChange: (sessionGenerating) =>
            patchChatState(pluginName, { sessionGenerating }),
        }),
        oneShot: (pluginName) => ({
          onResultChange: (result) => patchOneShotState(pluginName, { result }),
          onLoadingChange: (isLoading) =>
            patchOneShotState(pluginName, { isLoading }),
          onErrorChange: (error) => patchOneShotState(pluginName, { error }),
          onStatusChange: (status) => patchOneShotState(pluginName, { status }),
        }),
      },
    }

    return new PluginClient<TDef>(clientOptions)
  })

  // Sync initial chat state now that the client (and its per-plugin chat
  // sub-clients) exists — mirrors useChat's `setMessages(client().getMessages())`.
  for (const pluginName of client().plugins) {
    const chatClient = client().chat(pluginName)
    if (chatClient) {
      patchChatState(pluginName, {
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
    for (const pluginName of client().plugins) {
      client().chat(pluginName)?.mountDevtools()
    }
  })

  // Cleanup on unmount: tear down every chat and one-shot sub-client.
  onCleanup(() => {
    client().dispose()
  })

  // Narrowing helpers: plugin presence is guaranteed by construction (a surface
  // for `pluginName` is only built below when the plugin actually declares it),
  // but the sub-client getters are typed as `T | undefined`, so reads go
  // through an explicit check rather than a non-null assertion.
  const requireChatClient = (pluginName: string) => {
    const chatClient = client().chat(pluginName)
    if (chatClient === undefined) {
      throw new Error(
        `usePlugin: "${pluginName}" is not a chat plugin on this definition`,
      )
    }
    return chatClient
  }

  const requireOneShotClient = (pluginName: string) => {
    const oneShotClient = client().oneShot(pluginName)
    if (oneShotClient === undefined) {
      throw new Error(
        `usePlugin: "${pluginName}" is not a one-shot plugin on this definition`,
      )
    }
    return oneShotClient
  }

  // Built dynamically per declared plugin below; the object shape can't be
  // statically checked against the mapped `PluginSystem` type, so it's
  // assembled as `Record<string, any>` and cast once at the end.
  const system: Record<string, any> = {}

  for (const pluginName of client().plugins) {
    if (client().chat(pluginName)) {
      system[pluginName] = {
        get messages() {
          return chatState()[pluginName]?.messages ?? defaultChatState.messages
        },
        get isLoading() {
          return chatState()[pluginName]?.isLoading ?? false
        },
        get error() {
          return chatState()[pluginName]?.error
        },
        get status() {
          return chatState()[pluginName]?.status ?? 'ready'
        },
        get isSubscribed() {
          return chatState()[pluginName]?.isSubscribed ?? false
        },
        get connectionStatus() {
          return chatState()[pluginName]?.connectionStatus ?? 'disconnected'
        },
        get sessionGenerating() {
          return chatState()[pluginName]?.sessionGenerating ?? false
        },
        // Runtime shape unconditionally exposes partial/final; the public
        // PluginSystem type hides them when the chat plugin's outputSchema
        // is absent, matching useChat's behavior.
        get partial() {
          return computeStructuredParts(chatState()[pluginName]?.messages ?? [])
            .partial
        },
        get final() {
          return computeStructuredParts(chatState()[pluginName]?.messages ?? [])
            .final
        },
        sendMessage: async (content: string | MultimodalContent) => {
          const chatClient = requireChatClient(pluginName)
          await chatClient.sendMessage(content)
          const msgs = chatClient.getMessages()
          const hasStructured =
            msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
            false
          // Cast: TS can't structurally narrow the conditional return of
          // PluginChatSurface['sendMessage'] against this runtime branch,
          // mirroring the assembled-`system` cast at the end of this hook.
          return (
            hasStructured ? computeStructuredParts(msgs).final : msgs
          ) as any
        },
        append: async (message: ModelMessage | UIMessage<any>) => {
          await requireChatClient(pluginName).append(message)
        },
        reload: async () => {
          await requireChatClient(pluginName).reload()
        },
        stop: () => {
          requireChatClient(pluginName).stop()
        },
        clear: () => {
          requireChatClient(pluginName).clear()
        },
        setMessages: (messages: Array<UIMessage<any>>) => {
          requireChatClient(pluginName).setMessagesManually(messages)
        },
        addToolResult: async (result: {
          toolCallId: string
          tool: string
          output: any
          state?: 'output-available' | 'output-error'
          errorText?: string
        }) => {
          await requireChatClient(pluginName).addToolResult(result)
        },
        addToolApprovalResponse: async (response: {
          id: string
          approved: boolean
        }) => {
          await requireChatClient(pluginName).addToolApprovalResponse(response)
        },
      }
      continue
    }

    if (!client().oneShot(pluginName)) continue
    system[pluginName] = {
      get result() {
        return oneShotState()[pluginName]?.result ?? null
      },
      get isLoading() {
        return oneShotState()[pluginName]?.isLoading ?? false
      },
      get error() {
        return oneShotState()[pluginName]?.error
      },
      get status() {
        return oneShotState()[pluginName]?.status ?? 'idle'
      },
      run: async (input: Record<string, any>) => {
        const oneShotClient = requireOneShotClient(pluginName)
        await oneShotClient.generate(input)
        return oneShotClient.getResult()
      },
      stop: () => {
        requireOneShotClient(pluginName).stop()
      },
      reset: () => {
        requireOneShotClient(pluginName).reset()
      },
    }
  }

  // eslint-disable-next-line no-restricted-syntax -- built dynamically per declared plugin; TS can't structurally verify the assembled object against the mapped PluginSystem type
  return system as unknown as PluginSystem<
    TDef,
    { plugins: PerPluginOptions<TOptions> }
  >
}
