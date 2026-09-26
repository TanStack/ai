import { CapabilityRegistry } from '@tanstack/ai'
import { ResourceScope, disposeAll } from './resources'
import type {
  AgentProduces,
  AnyChatMiddleware,
  AnyGenerationMiddleware,
  AnyTool,
  Capability,
  CapabilityHandle,
  SystemPrompt,
} from '@tanstack/ai'
import type { AgentRegistry, AgentRegistryView, AnyAgent } from './agents'

/**
 * How long a plugin's `setup` result and resources live:
 * - `session` (default): from session open to session close. Resources such
 *   as an index, a watcher, or an LSP server stay up across turns.
 * - `run`: set up for each chat turn, disposed when that turn ends.
 */
export type PluginLifetime = 'session' | 'run'

/** A prompt a plugin contributes. `id` must be unique in the session. */
export interface PluginPrompt {
  id: string
  text: string
}

/** What a plugin's `setup` returns. Every field is optional. */
export interface PluginContributions {
  /** Tools for the main model. */
  tools?: ReadonlyArray<AnyTool>
  /** System prompt text for every chat turn. */
  prompts?: ReadonlyArray<string | PluginPrompt>
  /** Chat middleware, the same type as `chat({ middleware })`. */
  middleware?: ReadonlyArray<AnyChatMiddleware>
  /** Middleware for the activities agents call (`ctx.generateImage`, ...). */
  generationMiddleware?: ReadonlyArray<AnyGenerationMiddleware>
  /** Agents added to `session.agents`. */
  agents?: ReadonlyArray<AnyAgent>
}

/** What a plugin's `setup` receives. */
export interface PluginSetupContext {
  /** Resources this plugin owns, with rollback and reverse-order cleanup. */
  resources: {
    acquire: <T>(
      open: () => T | Promise<T>,
      close: (resource: T) => unknown,
    ) => Promise<T>
    signal: AbortSignal
  }
  /** Read a capability another plugin or middleware provided. Throws if absent. */
  get: <T>(capability: Capability<T>) => T
  /** Read a capability, or `undefined` when nobody provided it. */
  getOptional: <T>(capability: Capability<T>) => T | undefined
  /** Provide a capability this plugin declared in `provides`. */
  provide: <T>(capability: Capability<T>, value: T) => void
  /** The agents of this session (harness agents plus earlier plugins' agents). */
  agents: AgentRegistryView
  session: { threadId: string }
}

export interface PluginDefinition {
  /** A stable, unique name, for example `'acme/todos'`. */
  name: string
  lifetime?: PluginLifetime
  /** Capabilities that an earlier plugin or harness middleware must provide. */
  requires?: ReadonlyArray<CapabilityHandle>
  /** Capabilities this plugin provides in `setup`. */
  provides?: ReadonlyArray<CapabilityHandle>
  /** Capabilities used when present. Never an error when missing. */
  optionalRequires?: ReadonlyArray<CapabilityHandle>
  /** Agent outputs this plugin needs the session to have. */
  needs?: { produces?: ReadonlyArray<AgentProduces> }
  setup?: (
    ctx: PluginSetupContext,
  ) => PluginContributions | void | Promise<PluginContributions | void>
}

const PLUGIN_BRAND = Symbol.for('tanstack.ai.harnessPlugin')

/** A plugin made with {@link definePlugin}. */
export type HarnessPlugin<
  TDefinition extends PluginDefinition = PluginDefinition,
> = Readonly<TDefinition> & { readonly [PLUGIN_BRAND]: true }

/**
 * Define a harness plugin. `setup` returns what the plugin contributes, and
 * closures in it can use the resources it acquired.
 *
 * @example
 * ```ts
 * const today = definePlugin({
 *   name: 'acme/today',
 *   setup: () => ({ prompts: [`Today is ${new Date().toDateString()}.`] }),
 * })
 * ```
 */
export function definePlugin<const TDefinition extends PluginDefinition>(
  definition: TDefinition,
): HarnessPlugin<TDefinition> {
  if (definition.name.trim() === '') {
    throw new Error('definePlugin requires a non-empty name')
  }
  return Object.freeze({ ...definition, [PLUGIN_BRAND]: true as const })
}

/** A tool, prompt, or middleware with the plugin that contributed it. */
interface Owned<T> {
  value: T
  owner: string
}

/** Everything a set of mounted plugins contributes, plus its cleanup. */
export interface MountedPlugins {
  tools: Array<AnyTool>
  prompts: Array<SystemPrompt>
  middleware: Array<AnyChatMiddleware>
  generationMiddleware: Array<AnyGenerationMiddleware>
  /**
   * Chat middleware that provides every plugin capability to each chat run,
   * so any chat middleware can read it with `getX(ctx)`. Goes first.
   */
  capabilityBridge: AnyChatMiddleware | undefined
  /** The capability values, so a run mount can read session capabilities. */
  values: CapabilityValues
  /** Dispose every plugin scope, newest first. Safe to call twice. */
  dispose: () => Promise<void>
}

export interface MountEnvironment {
  threadId: string
  registry: AgentRegistry
  /** Names already taken by the harness itself. */
  harnessTools: ReadonlyArray<AnyTool>
  /** Capabilities provided by harness-level middleware. */
  harnessProvides: ReadonlyArray<CapabilityHandle>
  /** Capability values from an outer mount (session plugins, for a run mount). */
  inherited?: CapabilityValues
}

/** Capability values provided by plugins, keyed by handle. */
export class CapabilityValues {
  readonly context = { capabilities: new CapabilityRegistry() }
  readonly handles: Array<CapabilityHandle> = []

  constructor(private readonly parent?: CapabilityValues) {}

  provide<T>(handle: Capability<T>, value: T): void {
    handle[1](this.context, value)
    this.handles.push(handle)
  }

  get<T>(handle: Capability<T>): T | undefined {
    if (handle.has(this.context)) return handle[0](this.context)
    return this.parent?.get(handle)
  }

  /** Every handle provided here and in the parent chain. */
  all(): Array<CapabilityHandle> {
    return [...(this.parent?.all() ?? []), ...this.handles]
  }
}

function checkCapabilityOrder(
  plugins: ReadonlyArray<HarnessPlugin>,
  available: Set<CapabilityHandle>,
): void {
  const byName = new Map<string, CapabilityHandle>()
  for (const handle of available) byName.set(handle.capabilityName, handle)
  const names = new Set<string>()
  for (const plugin of plugins) {
    if (names.has(plugin.name)) {
      throw new Error(`Duplicate plugin: ${plugin.name}`)
    }
    names.add(plugin.name)
    for (const handle of [
      ...(plugin.requires ?? []),
      ...(plugin.provides ?? []),
      ...(plugin.optionalRequires ?? []),
    ]) {
      const other = byName.get(handle.capabilityName)
      if (other && other !== handle) {
        throw new Error(
          `Two different capabilities are named "${handle.capabilityName}" (plugin ${plugin.name}). Capability names must be unique.`,
        )
      }
      byName.set(handle.capabilityName, handle)
    }
    for (const handle of plugin.requires ?? []) {
      if (!available.has(handle)) {
        throw new Error(
          `Plugin ${plugin.name} requires capability "${handle.capabilityName}", but no earlier plugin or harness middleware provides it. Add a provider before ${plugin.name}.`,
        )
      }
    }
    for (const handle of plugin.provides ?? []) available.add(handle)
  }
}

function promptOf(prompt: string | PluginPrompt, owner: string, index: number) {
  return typeof prompt === 'string'
    ? { id: `${owner}#${index}`, text: prompt }
    : prompt
}

/**
 * Set up plugins in order and collect what they contribute.
 *
 * Before any `setup` runs: duplicate plugin names, capability name clashes,
 * and missing providers are errors. If a `setup` throws, or a contribution
 * clashes (the same tool, prompt id, or agent name from two owners), every
 * plugin set up so far is disposed newest first, and no chat turn starts.
 */
export async function mountPlugins(
  plugins: ReadonlyArray<HarnessPlugin>,
  env: MountEnvironment,
): Promise<MountedPlugins> {
  const available = new Set<CapabilityHandle>([
    ...env.harnessProvides,
    ...(env.inherited?.all() ?? []),
  ])
  checkCapabilityOrder(plugins, available)

  const values = new CapabilityValues(env.inherited)
  const scopes: Array<ResourceScope> = []
  const tools: Array<Owned<AnyTool>> = env.harnessTools.map((tool) => ({
    value: tool,
    owner: 'the harness',
  }))
  const prompts: Array<Owned<PluginPrompt>> = []
  const middleware: Array<AnyChatMiddleware> = []
  const generationMiddleware: Array<AnyGenerationMiddleware> = []

  try {
    for (const plugin of plugins) {
      const scope = new ResourceScope()
      scopes.push(scope)
      const provided = new Set<CapabilityHandle>()
      const declared = new Set<CapabilityHandle>([
        ...(plugin.requires ?? []),
        ...(plugin.optionalRequires ?? []),
      ])
      const contributions = await plugin.setup?.({
        resources: {
          acquire: (open, close) => scope.acquire(open, close),
          signal: scope.signal,
        },
        get: (handle) => {
          const value = values.get(handle)
          if (value === undefined && !declared.has(handle)) {
            throw new Error(
              `Plugin ${plugin.name} reads capability "${handle.capabilityName}" without declaring it in requires.`,
            )
          }
          if (value === undefined) {
            throw new Error(
              `Capability "${handle.capabilityName}" was requested by ${plugin.name} but never provided.`,
            )
          }
          return value
        },
        getOptional: (handle) => values.get(handle),
        provide: (handle, value) => {
          if (!(plugin.provides ?? []).includes(handle)) {
            throw new Error(
              `Plugin ${plugin.name} provides "${handle.capabilityName}" without declaring it in provides.`,
            )
          }
          values.provide(handle, value)
          provided.add(handle)
        },
        agents: env.registry,
        session: { threadId: env.threadId },
      })
      for (const handle of plugin.provides ?? []) {
        if (!provided.has(handle)) {
          throw new Error(
            `Plugin ${plugin.name} declares capability "${handle.capabilityName}" in provides but did not provide it in setup.`,
          )
        }
      }
      if (!contributions) continue
      for (const tool of contributions.tools ?? []) {
        const clash = tools.find((entry) => entry.value.name === tool.name)
        if (clash) {
          throw new Error(
            `Duplicate tool "${tool.name}": first owner ${clash.owner}, second owner ${plugin.name}. No run started.`,
          )
        }
        tools.push({ value: tool, owner: plugin.name })
      }
      ;(contributions.prompts ?? []).forEach((prompt, index) => {
        const section = promptOf(prompt, plugin.name, index)
        const clash = prompts.find((entry) => entry.value.id === section.id)
        if (clash) {
          throw new Error(
            `Duplicate prompt id "${section.id}": first owner ${clash.owner}, second owner ${plugin.name}.`,
          )
        }
        prompts.push({ value: section, owner: plugin.name })
      })
      middleware.push(...(contributions.middleware ?? []))
      generationMiddleware.push(...(contributions.generationMiddleware ?? []))
      for (const agent of contributions.agents ?? []) {
        env.registry.add(agent, plugin.name)
      }
    }
    for (const plugin of plugins) {
      for (const produces of plugin.needs?.produces ?? []) {
        if (!env.registry.find({ produces })) {
          throw new Error(
            `Plugin ${plugin.name} needs an agent that produces "${produces}", but the session has none. Add one to agents or subagents.`,
          )
        }
      }
    }
  } catch (error) {
    try {
      await disposeAll(scopes)
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Plugin setup failed, and cleanup also failed',
        { cause: error },
      )
    }
    throw error
  }

  const bridgeHandles = values.handles
  const capabilityBridge: AnyChatMiddleware | undefined =
    bridgeHandles.length > 0
      ? {
          name: 'harness:plugin-capabilities',
          provides: bridgeHandles,
          setup(ctx) {
            for (const handle of bridgeHandles) {
              handle[1](ctx, values.get(handle))
            }
          },
        }
      : undefined

  let disposed: Promise<void> | undefined
  return {
    tools: tools
      .filter((entry) => entry.owner !== 'the harness')
      .map((entry) => entry.value),
    prompts: prompts.map((entry) => entry.value.text),
    middleware,
    generationMiddleware,
    capabilityBridge,
    values,
    dispose: () => (disposed ??= disposeAll(scopes)),
  }
}
