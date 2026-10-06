import { CapabilityRegistry } from '@tanstack/ai'
import { ResourceScope, disposeAll } from './resources'
import type {
  AgentProduces,
  AnyChatMiddleware,
  AnyGenerationMiddleware,
  AnyTextAdapter,
  AnyTool,
  Capability,
  CapabilityHandle,
  KeyedAdapter,
  ProviderKeys,
} from '@tanstack/ai'
import type {
  AgentInputOf,
  AgentRegistry,
  AgentRegistryView,
  AgentResultOf,
  AnyAgent,
} from './agents'
import type { Operation, TurnInfo } from './types'
import type { CredentialsAccess } from './auth'
import type { AnyCommand, PluginSessionApi } from './commands'
import type { ConfigOption } from './config'
import type { ExtensionItem, ExtensionPoint, PluginEvent } from './extensions'

/**
 * How long a plugin's `setup` result and resources live:
 * - `session` (default): from session open to session close. Resources such
 *   as an index, a watcher, or an LSP server stay up across turns.
 * - `turn`: set up for each chat turn, disposed when that turn ends.
 * - `run`: deprecated, the old name of `turn`. It works the same.
 */
export type PluginLifetime = 'session' | 'turn' | 'run'

/**
 * A prompt a plugin contributes. `id` must be unique in the session. A
 * function `text` is called for each turn, so it can show current state.
 */
export interface PluginPrompt {
  id: string
  text: string | (() => string)
}

/** What a plugin's `setup` returns. Every field is optional. */
export interface PluginContributions {
  /** Tools for the main model. */
  tools?: ReadonlyArray<AnyTool>
  /** System prompt text for every chat turn. A function runs for each turn. */
  prompts?: ReadonlyArray<string | (() => string) | PluginPrompt>
  /** Chat middleware, the same type as `chat({ middleware })`. */
  middleware?: ReadonlyArray<AnyChatMiddleware>
  /**
   * Chat middleware for every agent run: subagents, background agents, and
   * their children. Not the lead turn: add the same middleware to
   * `middleware` for that.
   */
  agentMiddleware?: ReadonlyArray<AnyChatMiddleware>
  /** Middleware for the activities agents call (`ctx.generateImage`, ...). */
  generationMiddleware?: ReadonlyArray<AnyGenerationMiddleware>
  /** Agents added to `session.agents`. `routing.router` can pick them. */
  agents?: ReadonlyArray<AnyAgent>
  /**
   * Agents the main model can call as tools, merged into the turn's
   * `chat({ subagents })` after `defineHarness({ subagents })`. They are
   * also added to `session.agents`.
   */
  subagents?: ReadonlyArray<AnyAgent>
  /** User actions, keyed by name. Run with `session.command(name, input)`. */
  commands?: Record<string, AnyCommand>
  /** Session settings, keyed by name. Read with `ctx.config.get(name)`. */
  config?: Record<string, ConfigOption>
  /** Items for extension points that other plugins read. */
  contribute?: ReadonlyArray<ExtensionItem>
  /**
   * Pick the main-loop adapter for the next turn, or return `undefined` to
   * keep the harness adapter. The last plugin that returns one wins. The
   * session builds a `keyedAdapter(...)` with the user's key. `turn` is the
   * turn that starts: its input, context, and sender. Its
   * `overrides.adapter` wins over every pick.
   */
  adapter?: (
    turn: TurnInfo,
  ) => AnyTextAdapter | KeyedAdapter<AnyTextAdapter> | undefined
  /**
   * Tools found at run time, for example the tools of an MCP server the user
   * signed in to after the session opened. Called before each chat turn. A
   * name that another tool already uses is skipped.
   */
  discoverTools?: () => ReadonlyArray<AnyTool> | Promise<ReadonlyArray<AnyTool>>
  /**
   * Change the tool list of a turn: every tool the model gets, after
   * `discoverTools`. Return the new list. Runs before prompts resolve, so a
   * prompt `text()` can describe the tools this returned. Code mode uses it to
   * move tools behind `execute_typescript`. `model` is the model id of the
   * turn's adapter, so the list can differ for each model.
   */
  prepareTools?: (turn: {
    tools: ReadonlyArray<AnyTool>
    model: string
  }) => ReadonlyArray<AnyTool> | Promise<ReadonlyArray<AnyTool>>
}

/** Plugin state that survives restarts, stored in the metadata store. */
export interface PluginState<T> {
  get: () => Promise<T>
  /** Change the state. On a write conflict, `change` runs again with fresh state. */
  update: (change: (current: T) => T) => Promise<T>
}

/** Run agents from a plugin: in the foreground, in the background, or as a group. */
export interface PluginAgentActions {
  run: {
    <TAgent extends AnyAgent>(
      agent: TAgent,
      input?: AgentInputOf<TAgent>,
    ): Operation<AgentResultOf<TAgent>>
    (name: string, input?: unknown): Operation<unknown>
  }
  start: {
    <TAgent extends AnyAgent>(
      agent: TAgent,
      input?: AgentInputOf<TAgent>,
      options?: { wake?: boolean },
    ): Operation<AgentResultOf<TAgent>>
    (
      name: string,
      input?: unknown,
      options?: { wake?: boolean },
    ): Operation<unknown>
  }
  /**
   * Run children together. With `onFailure: 'cancel-siblings'` (default), one
   * failure cancels the others. Every child settles before `group` returns.
   */
  group: <T>(
    options: { onFailure?: 'cancel-siblings' | 'collect' },
    body: (group: AgentGroup) => Promise<T>,
  ) => Promise<T>
}

/** The children of one `ctx.agents.group` call. */
export interface AgentGroup {
  run: {
    <TAgent extends AnyAgent>(
      agent: TAgent,
      input?: AgentInputOf<TAgent>,
    ): Promise<AgentResultOf<TAgent>>
    (name: string, input?: unknown): Promise<unknown>
  }
  /** Like `run`, but never rejects: resolves with the result or the error. */
  runSettled: {
    <TAgent extends AnyAgent>(
      agent: TAgent,
      input?: AgentInputOf<TAgent>,
    ): Promise<
      { ok: true; value: AgentResultOf<TAgent> } | { ok: false; error: unknown }
    >
    (
      name: string,
      input?: unknown,
    ): Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>
  }
}

/** What the session gives plugins. */
export interface PluginServices {
  emit: (plugin: string, name: string, value: unknown) => void
  on: (name: string, handler: (value: unknown) => void) => () => void
  config: { get: (key: string) => unknown }
  state: <T>(plugin: string, initial: T) => PluginState<T>
  credentials: CredentialsAccess
  keys: ProviderKeys
  session: PluginSessionApi
  agents: PluginAgentActions
  /** Called after `ctx.commands` adds or removes a command. */
  commandsChanged?: () => void
}

/**
 * The commands of the session, for a plugin that adds and removes its own
 * commands while the session runs, for example one command for each file in
 * a folder. Commands that never change go in the `commands` of `setup`.
 */
export interface PluginCommands {
  /** Is `name` a command of any plugin of this session? */
  has: (name: string) => boolean
  /**
   * Add this plugin's command `name`, or replace it. A name that another
   * plugin owns throws. Session views get the new list at once.
   */
  set: (name: string, command: AnyCommand) => void
  /** Remove this plugin's command `name`. Another plugin's name does nothing. */
  delete: (name: string) => void
  /**
   * Resolves when every plugin of the session is set up. Wait for it before
   * `has` or `set`: during `setup`, the plugins after this one have not
   * added their commands yet.
   */
  ready: Promise<void>
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
  /**
   * The agents of this session (harness agents plus earlier plugins'
   * agents): find them, and run them from commands, tools, and hooks.
   */
  agents: AgentRegistryView & PluginAgentActions
  /**
   * The items other plugins contributed to `point`. The list fills while
   * plugins set up, so read it at run time (in a tool, a command, or a
   * middleware hook), not during `setup`.
   */
  collect: <T>(point: ExtensionPoint<T>) => ReadonlyArray<T>
  /** Send a typed event to every plugin that listens, and to clients. */
  emit: <T>(event: PluginEvent<T>, value: T) => void
  /** Listen for a typed event. Returns a function that stops listening. */
  on: <T>(event: PluginEvent<T>, handler: (value: T) => void) => () => void
  /** This plugin's state, created with `initial` the first time. */
  state: <T>(initial: T) => PluginState<T>
  /** Session settings. A change applies at the next turn. */
  config: { get: (key: string) => unknown }
  /**
   * Credentials of the running turn's sender. Outside a turn: of the
   * principal that opened the session. They are read at each call, so code
   * that runs after its turn ends (a tool of a background agent) gets the
   * sender of the turn that runs at that time. There, use the keys of the
   * agent run (`ctx.keys` in the agent) and, in a command, the `credentials`
   * of its `run` context.
   */
  credentials: CredentialsAccess
  /**
   * Model provider keys of the same principal as `credentials`: the key saved with
   * `/connect <provider>`, else the provider's env var. Build a
   * `keyedAdapter(...)` with `await ctx.keys.adapter(adapter)` just before
   * the call. A missing key throws `AuthRequiredError`.
   */
  keys: ProviderKeys
  session: PluginSessionApi
  /** Add and remove this plugin's commands while the session runs. */
  commands: PluginCommands
  /**
   * The turn this plugin is set up for: its input, context, and sender. Set
   * only for a plugin with `lifetime: 'turn'`. A session plugin has no turn
   * at setup.
   */
  turn?: TurnInfo
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
  /** Strings, or functions to call for each turn. */
  prompts: Array<string | (() => string)>
  commands: Map<string, { command: AnyCommand; owner: string }>
  config: Map<string, { option: ConfigOption; owner: string }>
  /** Contributions to extension points, by point name. */
  extensions: Map<string, Array<{ value: unknown; owner: string }>>
  adapters: Array<NonNullable<PluginContributions['adapter']>>
  discoverers: Array<{
    discover: () => ReadonlyArray<AnyTool> | Promise<ReadonlyArray<AnyTool>>
    owner: string
  }>
  preparers: Array<{
    prepare: NonNullable<PluginContributions['prepareTools']>
    owner: string
  }>
  /** The `agents` of the plugins, in plugin order: root agents for routing. */
  agents: Array<AnyAgent>
  /** Agents plugins give the main model, in plugin order. */
  subagents: Array<AnyAgent>
  /** Who contributed what, for `session.inspect()`. */
  owners: {
    plugins: Array<{
      name: string
      lifetime: PluginLifetime
      requires: Array<string>
      provides: Array<string>
    }>
    tools: Array<{ name: string; owner: string }>
    prompts: Array<{ id: string; owner: string }>
  }
  middleware: Array<AnyChatMiddleware>
  /** Chat middleware for every agent run. See `PluginContributions`. */
  agentMiddleware: Array<AnyChatMiddleware>
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
  /** Names taken by an outer mount (session plugins, for a run mount). */
  takenCommands?: ReadonlyMap<string, { owner: string }>
  takenConfig?: ReadonlyMap<string, { owner: string }>
  /** Extension items from an outer mount, visible to `collect`. */
  inheritedExtensions?: ReadonlyMap<
    string,
    ReadonlyArray<{ value: unknown; owner: string }>
  >
  /** Session services. Tests of the mount alone can leave them out. */
  services?: PluginServices
  /** The turn of a run mount. Plugins read it as `ctx.turn`. */
  turn?: TurnInfo
}

const unavailable = (what: string) => () => {
  throw new Error(`${what} is only available inside a harness session.`)
}

const NO_SERVICES: PluginServices = {
  emit: () => {},
  on: () => () => {},
  config: { get: () => undefined },
  state: unavailable('ctx.state'),
  credentials: {
    get: unavailable('ctx.credentials'),
    require: unavailable('ctx.credentials'),
    set: unavailable('ctx.credentials'),
    delete: unavailable('ctx.credentials'),
    list: unavailable('ctx.credentials'),
  },
  keys: {
    get: unavailable('ctx.keys'),
    require: unavailable('ctx.keys'),
    adapter: unavailable('ctx.keys'),
  },
  session: {
    threadId: '',
    principal: undefined,
    snapshot: unavailable('ctx.session'),
    prompt: unavailable('ctx.session'),
    note: unavailable('ctx.session'),
    transcript: unavailable('ctx.session'),
    replaceTranscript: unavailable('ctx.session'),
    entry: unavailable('ctx.session'),
    updateEntry: unavailable('ctx.session'),
    ask: unavailable('ctx.session'),
    authRequired: unavailable('ctx.session'),
    setConfig: unavailable('ctx.session'),
  },
  agents: {
    run: unavailable('ctx.agents.run') as PluginAgentActions['run'],
    start: unavailable('ctx.agents.start') as PluginAgentActions['start'],
    group: unavailable('ctx.agents.group'),
  },
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

function promptOf(
  prompt: string | (() => string) | PluginPrompt,
  owner: string,
  index: number,
): PluginPrompt {
  return typeof prompt === 'string' || typeof prompt === 'function'
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
  const agentMiddleware: Array<AnyChatMiddleware> = []
  const generationMiddleware: Array<AnyGenerationMiddleware> = []
  const commands = new Map<string, { command: AnyCommand; owner: string }>()
  const config = new Map<string, { option: ConfigOption; owner: string }>()
  const extensions = new Map<string, Array<{ value: unknown; owner: string }>>()
  for (const [point, items] of env.inheritedExtensions ?? []) {
    extensions.set(point, [...items])
  }
  const adapters: MountedPlugins['adapters'] = []
  const discoverers: MountedPlugins['discoverers'] = []
  const preparers: MountedPlugins['preparers'] = []
  const agents: Array<AnyAgent> = []
  const subagents: Array<AnyAgent> = []
  const services = env.services ?? NO_SERVICES
  // `ctx.commands.ready`: resolves after the last plugin is set up. A failed
  // mount leaves it pending, so no plugin acts on a session that never opens.
  let markReady = () => {}
  const ready = new Promise<void>((resolve) => (markReady = resolve))
  const ownerOf = (name: string) =>
    commands.get(name)?.owner ?? env.takenCommands?.get(name)?.owner

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
        agents: {
          list: () => env.registry.list(),
          get: (name) => env.registry.get(name),
          find: (query) => env.registry.find(query),
          run: services.agents.run,
          start: services.agents.start,
          group: services.agents.group,
        },
        collect: <T>(point: ExtensionPoint<T>): ReadonlyArray<T> => {
          let items = extensions.get(point.name)
          if (!items) {
            items = []
            extensions.set(point.name, items)
          }
          const source = items
          const values = () => source.map((item) => item.value as T)
          // A live view: items contributed after this call appear too. Array
          // methods like `filter` also check that an index exists, so every
          // trap reads the items, not the empty target.
          return new Proxy<Array<T>>([], {
            get: (_target, key) => Reflect.get(values(), key),
            has: (_target, key) => Reflect.has(values(), key),
            ownKeys: () => Reflect.ownKeys(values()),
            getOwnPropertyDescriptor: (_target, key) =>
              Reflect.getOwnPropertyDescriptor(values(), key),
          })
        },
        emit: (event, value) => services.emit(plugin.name, event.name, value),
        on: (event, handler) =>
          services.on(event.name, (value) => handler(value as never)),
        state: (initial) => services.state(plugin.name, initial),
        config: services.config,
        credentials: services.credentials,
        keys: services.keys,
        session: services.session,
        commands: {
          has: (name) => ownerOf(name) !== undefined,
          set: (name, command) => {
            const owner = ownerOf(name)
            if (owner !== undefined && owner !== plugin.name) {
              throw new Error(
                `Command "${name}" belongs to ${owner}. ${plugin.name} cannot replace it.`,
              )
            }
            commands.set(name, { command, owner: plugin.name })
            services.commandsChanged?.()
          },
          delete: (name) => {
            if (commands.get(name)?.owner !== plugin.name) return
            commands.delete(name)
            services.commandsChanged?.()
          },
          ready,
        },
        ...(env.turn ? { turn: env.turn } : {}),
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
      agentMiddleware.push(...(contributions.agentMiddleware ?? []))
      generationMiddleware.push(...(contributions.generationMiddleware ?? []))
      for (const [name, command] of Object.entries(
        contributions.commands ?? {},
      )) {
        const clash = commands.get(name) ?? env.takenCommands?.get(name)
        if (clash) {
          throw new Error(
            `Duplicate command "${name}": first owner ${clash.owner}, second owner ${plugin.name}.`,
          )
        }
        commands.set(name, { command, owner: plugin.name })
      }
      for (const [key, option] of Object.entries(contributions.config ?? {})) {
        const clash = config.get(key) ?? env.takenConfig?.get(key)
        if (clash) {
          throw new Error(
            `Duplicate config key "${key}": first owner ${clash.owner}, second owner ${plugin.name}.`,
          )
        }
        config.set(key, { option, owner: plugin.name })
      }
      for (const item of contributions.contribute ?? []) {
        let items = extensions.get(item.point)
        if (!items) {
          items = []
          extensions.set(item.point, items)
        }
        items.push({ value: item.value, owner: plugin.name })
      }
      if (contributions.adapter) adapters.push(contributions.adapter)
      if (contributions.discoverTools) {
        discoverers.push({
          discover: contributions.discoverTools,
          owner: plugin.name,
        })
      }
      if (contributions.prepareTools) {
        preparers.push({
          prepare: contributions.prepareTools,
          owner: plugin.name,
        })
      }
      for (const agent of contributions.agents ?? []) {
        env.registry.add(agent, plugin.name)
        agents.push(agent)
      }
      for (const agent of contributions.subagents ?? []) {
        env.registry.add(agent, plugin.name)
        subagents.push(agent)
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

  markReady()
  let disposed: Promise<void> | undefined
  return {
    tools: tools
      .filter((entry) => entry.owner !== 'the harness')
      .map((entry) => entry.value),
    prompts: prompts.map((entry) => entry.value.text),
    middleware,
    agentMiddleware,
    generationMiddleware,
    commands,
    config,
    extensions,
    adapters,
    discoverers,
    preparers,
    agents,
    subagents,
    owners: {
      plugins: plugins.map((plugin) => ({
        name: plugin.name,
        lifetime: plugin.lifetime ?? 'session',
        requires: (plugin.requires ?? []).map(
          (handle) => handle.capabilityName,
        ),
        provides: (plugin.provides ?? []).map(
          (handle) => handle.capabilityName,
        ),
      })),
      tools: tools.map((entry) => ({
        name: entry.value.name,
        owner: entry.owner,
      })),
      prompts: prompts.map((entry) => ({
        id: entry.value.id,
        owner: entry.owner,
      })),
    },
    capabilityBridge,
    values,
    dispose: () => (disposed ??= disposeAll(scopes)),
  }
}
