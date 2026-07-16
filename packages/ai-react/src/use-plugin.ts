import {
  PluginClient,
  computeStructuredParts,
} from '@tanstack/ai-client/plugin'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
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
} from '@tanstack/ai-client'

/** Reactive chat-plugin state mirrored from the underlying ChatClient. */
interface ChatState {
  messages: Array<any>
  isLoading: boolean
  error: Error | undefined
  status: ChatClientState
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
}

/** Reactive generation-plugin state mirrored from a GenerationClient. */
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
 * This is the reference shape the other framework packages (solid/vue/svelte)
 * mirror:
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
 * React hook wrapping `PluginClient`, composing the chat + generation clients
 * behind one endpoint into a single typed system keyed by the plugin's declared
 * names.
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
  const hookId = useId()
  const clientId = options.id ?? hookId

  const optionsRef = useRef(options)
  optionsRef.current = options
  const activeClientRef = useRef<PluginClient<TDef> | null>(null)

  const [chatState, setChatState] = useState<Record<string, ChatState>>({})
  const [oneShotState, setOneShotState] = useState<
    Record<string, OneShotState>
  >({})

  const client = useMemo(() => {
    // Widen to the concrete flat-options type first (a safe upcast, since
    // TOptions extends it) so the rest-destructure below yields the concrete
    // per-plugin map instead of an opaque generic `Omit`.
    const base: UsePluginOptions<TDef> = optionsRef.current
    // Split the reserved config keys out of the flat options; every remaining
    // key is a per-plugin options entry keyed by plugin name.
    const { connection, id, threadId, ...pluginOptions } = base

    const setChatSlice = (
      instance: PluginClient<TDef>,
      pluginName: string,
      patch: Partial<ChatState>,
    ) => {
      if (activeClientRef.current !== instance) return
      setChatState((s) => ({
        ...s,
        [pluginName]: { ...(s[pluginName] ?? initialChatState), ...patch },
      }))
    }
    const setOneShotSlice = (
      instance: PluginClient<TDef>,
      pluginName: string,
      patch: Partial<OneShotState>,
    ) => {
      if (activeClientRef.current !== instance) return
      setOneShotState((s) => ({
        ...s,
        [pluginName]: {
          ...(s[pluginName] ?? initialOneShotState),
          ...patch,
        },
      }))
    }

    const clientOptions: PluginClientOptions<TDef> = {
      plugin,
      connection,
      id: id ?? hookId,
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
          onMessagesChange: (m) =>
            setChatSlice(instance, pluginName, { messages: m }),
          onLoadingChange: (v) =>
            setChatSlice(instance, pluginName, { isLoading: v }),
          onErrorChange: (v) =>
            setChatSlice(instance, pluginName, { error: v }),
          onStatusChange: (v) =>
            setChatSlice(instance, pluginName, { status: v }),
          onSubscriptionChange: (v) =>
            setChatSlice(instance, pluginName, { isSubscribed: v }),
          onConnectionStatusChange: (v) =>
            setChatSlice(instance, pluginName, { connectionStatus: v }),
          onSessionGeneratingChange: (v) =>
            setChatSlice(instance, pluginName, { sessionGenerating: v }),
        }),
        oneShot: (pluginName) => ({
          onResultChange: (r) =>
            setOneShotSlice(instance, pluginName, { result: r }),
          onLoadingChange: (v) =>
            setOneShotSlice(instance, pluginName, { isLoading: v }),
          onErrorChange: (v) =>
            setOneShotSlice(instance, pluginName, { error: v }),
          onStatusChange: (v) =>
            setOneShotSlice(instance, pluginName, { status: v }),
        }),
      },
    }

    const instance: PluginClient<TDef> = new PluginClient<TDef>(clientOptions)
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

    for (const pluginName of client.plugins) {
      const c = client.chat(pluginName)
      if (c) {
        const slice = chatState[pluginName] ?? initialChatState
        const { partial, final } = computeStructuredParts(slice.messages)
        out[pluginName] = {
          messages: slice.messages,
          sendMessage: async (content: any) => {
            await c.sendMessage(content)
            const msgs = c.getMessages()
            const hasStructured =
              msgs.at(-1)?.parts.some((p) => p.type === 'structured-output') ??
              false
            // Cast: TS can't structurally narrow the conditional return of
            // PluginChatSurface['sendMessage'] against this runtime branch,
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
          isLoading: slice.isLoading,
          error: slice.error,
          status: slice.status,
          isSubscribed: slice.isSubscribed,
          connectionStatus: slice.connectionStatus,
          sessionGenerating: slice.sessionGenerating,
          // Runtime shape unconditionally exposes partial/final; the public
          // PluginSystem type hides them when the chat plugin's outputSchema is
          // absent, matching useChat's behavior.
          partial,
          final,
        }
        continue
      }

      const g = client.oneShot(pluginName)
      if (!g) continue
      const slice = oneShotState[pluginName] ?? initialOneShotState
      out[pluginName] = {
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
      }
    }

    return out as PluginSystem<TDef, { plugins: PerPluginOptions<TOptions> }>
  }, [client, chatState, oneShotState])

  return system
}
