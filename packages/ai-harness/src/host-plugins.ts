import { ResourceScope, disposeAll } from './resources'
import type { AnyHarness } from './define'
import type {
  HostPluginContext,
  HostPluginContributions,
  HostPluginDefinition,
} from './plugins'

/** One shared setup of a host plugin, and how to give it back. */
export interface SharedHostPlugin {
  contributions: HostPluginContributions<any> | void
  /** Give the setup back. The last release disposes it. Safe to call twice. */
  release: () => Promise<void>
}

interface Entry {
  /** The sessions that hold the setup, and the ones that wait for it. */
  refs: number
  scope: ResourceScope
  ready: Promise<HostPluginContributions<any> | void>
}

/** The context of a host plugin setup whose resources live in `scope`. */
export function hostPluginContext(
  harness: string,
  scope: ResourceScope,
): HostPluginContext {
  return {
    harness,
    resources: {
      acquire: (open, close) => scope.acquire(open, close),
      signal: scope.signal,
    },
  }
}

/**
 * @internal The plugins with `lifetime: 'host'` of one host. Each one is
 * set up once for each harness definition and plugin name, and shared by a
 * reference count. The last release disposes it, and so does `close()`.
 *
 * The key is the harness object, not its name. An app that builds a new
 * definition (with other plugin options) under the same name gets its own
 * setup, never the one of the older definition.
 */
export class HostPlugins {
  private readonly entries = new Map<AnyHarness, Map<string, Entry>>()
  private closed = false

  /** The shared setup of `plugin` for `harness`. */
  async acquire(
    harness: AnyHarness,
    plugin: HostPluginDefinition<any>,
  ): Promise<SharedHostPlugin> {
    if (this.closed) {
      throw new Error('The host is closed. Create a new host to open sessions.')
    }
    const plugins = this.entries.get(harness) ?? new Map<string, Entry>()
    this.entries.set(harness, plugins)
    const key = plugin.name
    /** Drop `entry` when it is still the one of `key`. */
    const forget = (entry: Entry) => {
      if (plugins.get(key) !== entry) return false
      plugins.delete(key)
      if (plugins.size === 0) this.entries.delete(harness)
      return true
    }
    let entry = plugins.get(key)
    if (!entry) {
      const scope = new ResourceScope()
      const ready = Promise.resolve().then(() =>
        plugin.setup(hostPluginContext(harness.name, scope)),
      )
      const created: Entry = { refs: 0, scope, ready }
      // A failed setup is not kept: the next session sets it up again.
      ready.catch(() => {
        forget(created)
        void scope.dispose().catch(() => {})
      })
      plugins.set(key, created)
      entry = created
    }
    const held = entry
    held.refs += 1
    let contributions: HostPluginContributions<any> | void
    try {
      contributions = await held.ready
    } catch (error) {
      held.refs -= 1
      throw error
    }
    let released = false
    return {
      contributions,
      release: () => {
        if (released) return Promise.resolve()
        released = true
        held.refs -= 1
        if (held.refs > 0 || !forget(held)) return Promise.resolve()
        return held.scope.dispose()
      },
    }
  }

  /** Dispose every shared setup. Later `acquire` calls throw. */
  close(): Promise<void> {
    this.closed = true
    const scopes = [...this.entries.values()].flatMap((plugins) =>
      [...plugins.values()].map((entry) => entry.scope),
    )
    this.entries.clear()
    return disposeAll(scopes)
  }
}
