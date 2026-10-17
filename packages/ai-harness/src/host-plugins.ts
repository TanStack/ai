import { ResourceScope, disposeAll } from './resources'
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
 * set up once for each harness name and plugin name, and shared by a
 * reference count. The last release disposes it, and so does `close()`.
 */
export class HostPlugins {
  private readonly entries = new Map<string, Entry>()
  private closed = false

  /** The shared setup of `plugin` for the harness `harness`. */
  async acquire(
    harness: string,
    plugin: HostPluginDefinition<any>,
  ): Promise<SharedHostPlugin> {
    if (this.closed) {
      throw new Error('The host is closed. Create a new host to open sessions.')
    }
    const key = `${harness}\u0000${plugin.name}`
    let entry = this.entries.get(key)
    if (!entry) {
      const scope = new ResourceScope()
      const ready = Promise.resolve().then(() =>
        plugin.setup(hostPluginContext(harness, scope)),
      )
      const created: Entry = { refs: 0, scope, ready }
      // A failed setup is not kept: the next session sets it up again.
      ready.catch(() => {
        if (this.entries.get(key) === created) this.entries.delete(key)
        void scope.dispose().catch(() => {})
      })
      this.entries.set(key, created)
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
        const isLast = held.refs <= 0 && this.entries.get(key) === held
        if (!isLast) return Promise.resolve()
        this.entries.delete(key)
        return held.scope.dispose()
      },
    }
  }

  /** Dispose every shared setup. Later `acquire` calls throw. */
  close(): Promise<void> {
    this.closed = true
    const scopes = [...this.entries.values()].map((entry) => entry.scope)
    this.entries.clear()
    return disposeAll(scopes)
  }
}
