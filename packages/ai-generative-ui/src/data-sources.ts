/**
 * Open Generative UI — host-side live data-source registry.
 *
 * The sibling of the compute registry (`./compute`): where compute owns
 * deterministic arithmetic, this owns *live, host-authoritative data*. A model
 * binds an artifact to a named source; the host streams values into the mounted
 * frame over the bridge (`host.data` / MCP Apps `tool-result`), so a rendered
 * view updates in real time without being regenerated.
 *
 * Numbers presented as computed still come from the host — a live value pushed
 * here is just `data` that keeps arriving, never model arithmetic (§5.3, §7.3.4).
 */

/**
 * A live data source. Called with the binding's params and an `emit` callback;
 * it pushes a value immediately (or soon) and again on every change. Returns an
 * unsubscribe that MUST stop all further emits and release resources (timers,
 * sockets, listeners). One call per mounted artifact instance.
 */
export type DataSource = (
  params: Record<string, any>,
  emit: (data: unknown) => void,
) => () => void

export interface DataSourceDescriptor {
  /** Human/model-readable summary of what the source emits. */
  description: string
  /** Accepted param keys (first listed is canonical; the rest are aliases). */
  params?: Array<string>
  /** Shape of each emitted value, e.g. `{ total, recent[] }`. */
  output: string
}

export class DataSourceRegistry {
  private readonly sources = new Map<string, DataSource>()
  private readonly descriptors = new Map<string, DataSourceDescriptor>()

  register(name: string, source: DataSource, descriptor?: DataSourceDescriptor): this {
    this.sources.set(name, source)
    if (descriptor) this.descriptors.set(name, descriptor)
    return this
  }

  has(name: string): boolean {
    return this.sources.has(name)
  }

  get(name: string): DataSource | undefined {
    return this.sources.get(name)
  }

  list(): Array<string> {
    return Array.from(this.sources.keys())
  }

  /** Catalog of registered sources, for prompting a model. */
  describe(): Array<{ name: string } & DataSourceDescriptor> {
    return Array.from(this.descriptors.entries()).map(([name, d]) => ({ name, ...d }))
  }

  /**
   * Subscribe to a named source. Unknown names warn and return a no-op
   * unsubscribe (matching `ComputeRegistry.execute`'s forgiving behavior), so a
   * model naming a source that doesn't exist degrades to a static view rather
   * than throwing.
   */
  subscribe(name: string, params: Record<string, any>, emit: (data: unknown) => void): () => void {
    const source = this.sources.get(name)
    if (!source) {
      console.warn(`[GenerativeUI] Data source "${name}" not found in host registry`)
      return () => {}
    }
    return source(params, emit)
  }
}

export const defaultDataSourceRegistry = new DataSourceRegistry()

/**
 * Render the registry's catalog as a prompt fragment, so a live model binds an
 * artifact's `dataSource` to a source that actually exists on the host. Mirrors
 * `describeComputeForPrompt` (`./compute`).
 */
export function describeDataSourcesForPrompt(
  registry: DataSourceRegistry = defaultDataSourceRegistry,
): string {
  const lines = registry.describe().map((s) => {
    const params = s.params && s.params.length ? s.params.join(', ') : ''
    return `- "${s.name}"(${params}) -> ${s.output}: ${s.description}`
  })
  return lines.join('\n')
}
