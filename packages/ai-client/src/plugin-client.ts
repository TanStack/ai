import { ChatClient } from './chat-client.js'
import { GenerationClient } from './generation-client.js'
import type { PluginDefinition } from '@tanstack/ai/plugin'
import type {
  ChatPluginOptions,
  GenerationPluginClientOptions,
  PluginClientOptions,
} from './plugin-types.js'

/**
 * Composes one `ChatClient` per chat plugin and one `GenerationClient` per
 * generation plugin declared on a `PluginDefinition`, sharing the single
 * `connection` adapter passed in `options`.
 *
 * Each sub-client tags its own requests with the plugin name — `ChatClient`
 * via `forwardedProps: { plugin }`, `GenerationClient` via `body: { plugin }`
 * — so the single server endpoint can route on that field.
 */
export class PluginClient<
  TDef extends PluginDefinition<any> = PluginDefinition<any>,
> {
  private readonly chats = new Map<string, ChatClient<any>>()
  private readonly oneShots = new Map<string, GenerationClient<any, any, any>>()
  readonly plugins: ReadonlyArray<string>

  constructor(options: PluginClientOptions<TDef>) {
    const { plugin, connection, id, threadId, plugins, callbacks } = options
    this.plugins = plugin.plugins

    for (const pluginName of plugin.plugins) {
      const kind = plugin.pluginKinds[pluginName]
      if (kind === 'chat') {
        const pluginOptions: ChatPluginOptions | undefined =
          plugins?.[pluginName as keyof typeof plugins]
        this.chats.set(
          pluginName,
          new ChatClient<any>({
            connection,
            id: id ? `${id}:${pluginName}` : undefined,
            threadId,
            tools: pluginOptions?.tools as any,
            forwardedProps: {
              ...pluginOptions?.forwardedProps,
              plugin: pluginName,
            },
            ...callbacks?.chat?.(pluginName),
          }),
        )
        continue
      }

      const pluginOptions: GenerationPluginClientOptions<any> | undefined =
        plugins?.[pluginName as keyof typeof plugins]
      const oneShotCallbacks = callbacks?.oneShot?.(pluginName)
      this.oneShots.set(
        pluginName,
        new GenerationClient({
          connection,
          id: id ? `${id}:${pluginName}` : undefined,
          // Merge per-plugin forwardedProps under the routing discriminator.
          body: { ...pluginOptions?.forwardedProps, plugin: pluginName },
          ...(pluginOptions?.onResult !== undefined && {
            onResult: pluginOptions.onResult,
          }),
          ...oneShotCallbacks,
        }),
      )
    }
  }

  /** Whether the plugin definition declares the given plugin. */
  has(pluginName: string): boolean {
    return this.plugins.includes(pluginName)
  }

  /** The `ChatClient` for a declared chat plugin, if any. */
  chat(pluginName: string): ChatClient<any> | undefined {
    return this.chats.get(pluginName)
  }

  /** The `GenerationClient` for a declared generation plugin, if any. */
  oneShot(pluginName: string): GenerationClient<any, any, any> | undefined {
    return this.oneShots.get(pluginName)
  }

  /** Tears down every chat and generation sub-client. */
  dispose(): void {
    for (const chat of this.chats.values()) {
      chat.dispose()
    }
    for (const oneShot of this.oneShots.values()) {
      oneShot.dispose()
    }
  }
}
