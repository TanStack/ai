import { CapabilityRegistry, createCapability } from '@tanstack/ai'
import { hostPluginContext } from './host-plugins'
import { ResourceScope, disposeAll } from './resources'
import { assertMetadataSchema } from './session-entry'
import type {
  AgentProduces,
  AnyChatMiddleware,
  AnyGenerationMiddleware,
  AnyTextAdapter,
  AnyTool,
  Capability,
  CapabilityHandle,
  ChatResult,
  InferSchemaType,
  KeyedAdapter,
  MetadataStore,
  ModelMessage,
  ProviderKeys,
  SchemaInput,
} from '@tanstack/ai'
import type {
  AgentActions,
  AgentRegistry,
  AgentRegistryView,
  AnyAgent,
} from './agents'
import type { RunContext, TurnInfo } from './types'
import type { CredentialsAccess } from './auth'
import type { AnyCommand, PluginSessionApi } from './commands'
import type { ConfigOption } from './config'
import type { ExtensionItem, ExtensionPoint, PluginEvent } from './extensions'
import type { MetadataOf } from './session-entry'
import type { SharedHostPlugin } from './host-plugins'
import type { WorkspaceBinding } from './log-records'
import type { UsageCall } from './usage'

/**
 * How long a plugin's `setup` result and resources live:
 * - `session` (default): from session open to session close. Resources such
 *   as an index, a watcher, or an LSP server stay up across turns.
 * - `turn`: set up for each chat turn, disposed when that turn ends.
 * - `host`: set up once for each harness on a host, and shared by every
 *   session of that harness that uses the same plugin object. Create the
 *   plugin once, outside the `plugins` factory, to share it. Disposed when
 *   the last session that uses it closes, or at `host.close()`. See
 *   {@link HostPluginContext}.
 */
export type PluginLifetime = 'session' | 'turn' | 'host'

/**
 * A prompt a plugin contributes. `id` must be unique in the session. A
 * function `text` is called for each turn with that turn, so it can show
 * current state, for example the state of the turn's user (`turn.run`).
 */
export interface PluginPrompt {
  id: string
  text: string | ((turn: TurnInfo) => string)
  /**
   * Where the model gets the text. `'system'` (default): in the system
   * prompts, in plugin order. `'context'`: in one system prompt after all
   * the others, made again at each model call. Use `'context'` for text that
   * changes often, such as a todo list or a mode: a change makes the
   * provider prompt cache miss only from that last prompt on. The log does
   * not keep the `'context'` text.
   */
  placement?: 'system' | 'context'
}

/** What a plugin's `setup` returns. Every field is optional. */
export interface PluginContributions {
  /** Tools for the main model. */
  tools?: ReadonlyArray<AnyTool>
  /**
   * System prompt text for every chat turn. A function runs for each turn,
   * with that turn.
   */
  prompts?: ReadonlyArray<string | ((turn: TurnInfo) => string) | PluginPrompt>
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
  /** User actions, keyed by name. Run with `session.runCommand({ name, input })`. */
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
   * Runs once at the start of each turn, before the adapter pick, the tools,
   * and the prompts. `turn.run` has the turn's user and that user's
   * credentials. Use it to refresh state that a prompt reads. A hook that
   * throws is skipped, and clients get a `harness.plugin.warning` event.
   */
  onTurnStart?: (turn: TurnInfo) => void | Promise<void>
  /**
   * Tools found at run time, for example the tools of an MCP server the user
   * signed in to after the session opened. Called before each chat turn,
   * with that turn: `turn.run` has the turn's user and that user's
   * credentials. A name that another tool already uses is skipped.
   */
  discoverTools?: (
    turn: TurnInfo,
  ) => ReadonlyArray<AnyTool> | Promise<ReadonlyArray<AnyTool>>
  /**
   * Change the tool list of a turn: every tool the model gets, after
   * `discoverTools`. Return the new list. Runs before prompts resolve, so a
   * prompt `text()` can describe the tools this returned. Code mode uses it to
   * move tools behind `execute_typescript`. `model` is the model id of the
   * turn's adapter, so the list can differ for each model. `run` is the run
   * of the turn: its id and its user.
   */
  prepareTools?: (turn: {
    tools: ReadonlyArray<AnyTool>
    model: string
    run: RunContext
  }) => ReadonlyArray<AnyTool> | Promise<ReadonlyArray<AnyTool>>
}

/**
 * What the `setup` of a plugin with `lifetime: 'host'` returns. The host
 * mounts it into each session that uses the plugin. It cannot add commands
 * or config: return them from `session`.
 */
export interface HostPluginContributions<
  TMetadata = Record<string, unknown>,
> extends Omit<PluginContributions, 'commands' | 'config'> {
  /**
   * Runs for each session, after the shared setup, with the context of a
   * session plugin. Use it for the parts that need the session: commands,
   * config, state, and questions to the user. Its resources close with the
   * session. What it returns is added to the shared contributions.
   */
  session?: (
    ctx: PluginSetupContext<TMetadata>,
  ) => PluginContributions | void | Promise<PluginContributions | void>
}

/** Resources a plugin owns, with rollback and reverse-order cleanup. */
export interface PluginResources {
  /**
   * Open a resource. `close` runs when the plugin is cleaned up, newest
   * first. It is registered only after `open` resolves.
   */
  acquire: <T>(
    open: () => T | Promise<T>,
    close: (resource: T) => unknown,
  ) => Promise<T>
  /** Aborts when the plugin is cleaned up. */
  signal: AbortSignal
}

/**
 * What the `setup` of a plugin with `lifetime: 'host'` receives. The setup
 * runs once for each harness and plugin object on a host, so it has no
 * session, no user, no credentials, no keys, and no commands. Open the
 * shared resource here (a pool, a child process, a watcher). A tool reads
 * the user of its call from `ctx.context.run`.
 */
export interface HostPluginContext {
  /** The name of the harness that the plugin is set up for. */
  harness: string
  /** Resources that live as long as the shared setup. */
  resources: PluginResources
}

/**
 * Plugin state of one thread that survives restarts. The session log keeps
 * it, so any host that opens the thread reads it back. The value is JSON.
 */
export interface PluginState<T> {
  get: () => Promise<T>
  /**
   * Change the state. The updates of one plugin run one at a time, and each
   * `change` gets the value that the update before it wrote.
   */
  update: (change: (current: T) => T) => Promise<T>
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
  /** The session API of a plugin with a `metadataSchema`: its writes check it too. */
  sessionWith: (metadataSchema: SchemaInput) => PluginSessionApi
  /**
   * `ctx.agents` of a plugin. The runs are for the user of a turn plugin's
   * turn. In a session plugin, they are for the user that opened the
   * session: to start an agent for the user of a tool call, pass
   * `user: ctx.context.run.user` to `start`.
   */
  agents: AgentActions
  /** Called after `ctx.commands` adds or removes a command. */
  commandsChanged?: () => void
  /** One model call of `ctx.model.chat`. Resolves to what chat() gives. */
  modelChat: (call: PluginModelCall) => Promise<unknown>
}

/** The chat() options of one `ctx.model.chat` call. */
export interface PluginChatOptions<TSchema extends SchemaInput | undefined> {
  messages: Array<ModelMessage>
  systemPrompts?: Array<string>
  /** A schema for the answer. The call then resolves to the checked value. */
  outputSchema?: TSchema
}

/** What `ctx.model.chat` takes. */
export interface PluginModelChatOptions<
  TSchema extends SchemaInput | undefined = undefined,
> {
  /**
   * The model. A `keyedAdapter(...)` gets the key of the user of `run`.
   * Default: the model of the session, as the summary of `host.transfer`
   * picks it: the thread setting `model`, else the harness `adapter`.
   */
  adapter?: AnyTextAdapter | KeyedAdapter<AnyTextAdapter>
  options: PluginChatOptions<TSchema>
  /** A name for this call in its usage record, for example `judge`. */
  label?: string
  /**
   * The run that the call is for: its user's keys, its signal, and its
   * budget. In a tool or a middleware hook, pass `ctx.context.run`. In a
   * command, pass `run` of the command context. Default: the turn of a
   * plugin with `lifetime: 'turn'`.
   */
  run?: RunContext
  /** Stop the call after this time, in milliseconds. Default 120000 (2 minutes). */
  timeoutMs?: number
}

/** What `ctx.model.chat` resolves to: the checked value with `outputSchema`, else the text and chunks. */
export type PluginModelChatResult<TSchema extends SchemaInput | undefined> =
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : ChatResult

/** `ctx.model` of a plugin. */
export interface PluginModel {
  /**
   * Call a model, for example to judge, to name, or to summarize. The call
   * stops when its run stops or after `timeoutMs`, and then rejects. Its
   * usage counts in the session (`session.usage().bySource` under
   * `plugin:<name>`) and in its run, and the budget of the run applies.
   */
  chat: <TSchema extends SchemaInput | undefined = undefined>(
    options: PluginModelChatOptions<TSchema>,
  ) => Promise<PluginModelChatResult<TSchema>>
}

/** @internal One model call of a plugin, as the session runs it. */
export interface PluginModelCall extends Omit<
  PluginModelChatOptions<SchemaInput | undefined>,
  'run'
> {
  run: RunContext
  /** `plugin:<name>`, `router`, or `transfer`. */
  source: string
  /**
   * Where the usage of each model call goes. Default: the session and the
   * run `run`, and the budget of the run applies.
   */
  count?: (call: UsageCall) => Promise<void>
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
   * added their commands yet. Do not `await` it inside `setup`: it resolves
   * after every `setup` returned, so that `await` never ends. Use
   * `ready.then(...)` there, or wait in a session hook.
   */
  ready: Promise<void>
}

/**
 * What a plugin's `setup` receives. `TMetadata` is the type of the session
 * index `metadata`, from the `metadataSchema` of the plugin.
 */
export interface PluginSetupContext<TMetadata = Record<string, unknown>> {
  /** Resources this plugin owns, with rollback and reverse-order cleanup. */
  resources: PluginResources
  /** Read a capability another plugin or middleware provided. Throws if absent. */
  get: <T>(capability: Capability<T>) => T
  /** Read a capability, or `undefined` when nobody provided it. */
  getOptional: <T>(capability: Capability<T>) => T | undefined
  /** Provide a capability this plugin declared in `provides`. */
  provide: <T>(capability: Capability<T>, value: T) => void
  /**
   * The agents of this session (harness agents plus earlier plugins'
   * agents): find them, and run them from commands, tools, and hooks.
   * `set` and `delete` change this plugin's agents while the session runs,
   * like `ctx.commands`.
   */
  agents: AgentRegistryView &
    AgentActions & {
      /**
       * Add this plugin's agent, or replace the one with the same name. A
       * name that another plugin or the harness owns throws.
       */
      set: (
        agent: AnyAgent,
        options?: {
          /** Also give the model a tool that runs this agent as a subagent. */
          subagent?: boolean
        },
      ) => void
      /**
       * Remove this plugin's agent `name`, also from the subagent tools.
       * Another owner's name does nothing.
       */
      delete: (name: string) => void
    }
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
   * The credentials of the user of this plugin's turn, for a plugin with
   * `lifetime: 'turn'`.
   *
   * A session plugin has no user: each call throws. Read the credentials of
   * the run that calls instead: `ctx.context.run.credentials` in a tool or a
   * middleware hook, and `run.credentials` (or `credentials`) of the command
   * context in a command.
   */
  credentials: CredentialsAccess
  /**
   * The model provider keys of the same user as `credentials`: the key saved
   * with `/connect <provider>`, else the provider's env var. Build a
   * `keyedAdapter(...)` with `await keys.adapter(adapter)` just before the
   * call. A missing key throws `AuthRequiredError`.
   *
   * A session plugin has no user: each call throws. Read
   * `ctx.context.run.keys` in a tool or a middleware hook, and `run.keys` of
   * the command context in a command.
   */
  keys: ProviderKeys
  session: PluginSessionApi<TMetadata>
  /** Add and remove this plugin's commands while the session runs. */
  commands: PluginCommands
  /** Call a model, with the usage counted under `plugin:<name>`. */
  model: PluginModel
  /**
   * The turn this plugin is set up for: its input, context, sender, and run.
   * Set only for a plugin with `lifetime: 'turn'`. A session plugin has no
   * turn at setup.
   */
  turn?: TurnInfo
}

/** The fields of every plugin definition. */
interface PluginDefinitionBase {
  /** A stable, unique name, for example `'acme/todos'`. */
  name: string
  /**
   * The shape of the session index `metadata` this plugin uses, as a
   * Standard Schema. It types `ctx.session.indexEntry()` and
   * `ctx.session.updateIndexEntry()`, and checks each write of this plugin. Pass
   * the same schema as the harness `metadataSchema`: a harness whose
   * metadata type does not fit is a type error.
   */
  metadataSchema?: SchemaInput
  /** Capabilities that an earlier plugin or harness middleware must provide. */
  requires?: ReadonlyArray<CapabilityHandle>
  /** Capabilities this plugin provides in `setup`. */
  provides?: ReadonlyArray<CapabilityHandle>
  /** Capabilities used when present. Never an error when missing. */
  optionalRequires?: ReadonlyArray<CapabilityHandle>
  /** Agent outputs this plugin needs the session to have. */
  needs?: { produces?: ReadonlyArray<AgentProduces> }
  /**
   * The host records of this plugin that the log fold keeps, by record
   * type, with how many of each: the last ones. The fold snapshot keeps
   * them, so they stay readable after a truncate of the log. The plugins
   * of the harness that opens the log first (its root thread) decide. With
   * one type in two plugins, the larger count wins.
   *
   * @example
   * ```ts
   * definePlugin({ name: 'acme/steps', keepRecords: { 'acme/steps:step': 100 } })
   * ```
   */
  keepRecords?: Readonly<Record<string, number>>
}

/** A plugin that is set up for each session (default) or for each turn. */
export interface SessionPluginDefinition<
  TMetadata = Record<string, unknown>,
> extends PluginDefinitionBase {
  lifetime?: 'session' | 'turn'
  setup?: (
    ctx: PluginSetupContext<TMetadata>,
  ) => PluginContributions | void | Promise<PluginContributions | void>
}

/**
 * A plugin that is set up once for each harness on a host, and shared by
 * every session of that harness that uses this plugin object. A `plugins`
 * factory that builds a new object for each session gets a setup for each
 * session. See {@link HostPluginContext}.
 */
export interface HostPluginDefinition<
  TMetadata = Record<string, unknown>,
> extends PluginDefinitionBase {
  lifetime: 'host'
  setup: (
    ctx: HostPluginContext,
  ) =>
    | HostPluginContributions<TMetadata>
    | void
    | Promise<HostPluginContributions<TMetadata> | void>
}

/**
 * A plugin. `TMetadata` is the type of the session index `metadata` that the
 * plugin reads and writes, from its `metadataSchema`.
 */
export type PluginDefinition<TMetadata = Record<string, unknown>> =
  | SessionPluginDefinition<TMetadata>
  | HostPluginDefinition<TMetadata>

const PLUGIN_BRAND = Symbol.for('tanstack.ai.harnessPlugin')

/**
 * What `setup()` returns. A key of it at the top level of a definition would
 * be ignored. Other extra keys are the plugin's own API, such as the `diff`
 * of `snapshots()`.
 */
const SETUP_KEYS: ReadonlySet<string> = new Set<
  keyof PluginContributions | keyof HostPluginContributions
>([
  'adapter',
  'tools',
  'prompts',
  'middleware',
  'agentMiddleware',
  'generationMiddleware',
  'agents',
  'subagents',
  'commands',
  'config',
  'contribute',
  'onTurnStart',
  'discoverTools',
  'prepareTools',
  'session',
])

/** No `setup()` contribution at the top level of a definition. */
type NoSetupKeys = {
  [K in Exclude<
    keyof HostPluginContributions | keyof PluginContributions,
    keyof PluginDefinitionBase | 'lifetime' | 'setup'
  >]?: never
}

/**
 * A plugin made with {@link definePlugin}. `TMetadata` is the session
 * metadata type it reads, from its `metadataSchema`.
 */
export type HarnessPlugin<
  TDefinition extends PluginDefinition<any> = PluginDefinition<any>,
  TMetadata = any,
> = Readonly<TDefinition> & {
  readonly [PLUGIN_BRAND]: true
} & PluginMetadataCheck<TMetadata>

/**
 * @internal A type-only field: the metadata a plugin reads. The harness
 * `plugins` option takes only plugins that can read the harness metadata.
 */
export interface PluginMetadataCheck<TMetadata> {
  readonly '~metadata'?: (metadata: TMetadata) => void
}

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
export function definePlugin<
  TMetadataSchema extends SchemaInput | undefined = undefined,
  const TDefinition extends PluginDefinition<MetadataOf<TMetadataSchema>> =
    PluginDefinition<MetadataOf<TMetadataSchema>>,
>(
  definition: TDefinition & {
    metadataSchema?: TMetadataSchema
  } & NoSetupKeys,
  // `NoInfer`: the type of a plugins array around the call must not pick
  // `TDefinition`. Only the definition does.
): HarnessPlugin<NoInfer<TDefinition>, MetadataOf<TMetadataSchema>> {
  if (definition.name.trim() === '') {
    throw new Error('definePlugin requires a non-empty name')
  }
  // `const TDefinition` turns off the excess property check, so a `setup()`
  // contribution such as `adapter` at the top level would be kept and never
  // used. Refuse it.
  for (const key of Object.keys(definition)) {
    if (!SETUP_KEYS.has(key)) continue
    throw new Error(
      `definePlugin "${definition.name}": \`${key}\` is not a plugin option. Return it from \`setup()\` instead.`,
    )
  }
  assertMetadataSchema(
    `definePlugin "${definition.name}"`,
    definition.metadataSchema,
  )
  // `assign`, not a spread: a spread of a union type parameter loses it.
  return Object.freeze(
    Object.assign({ [PLUGIN_BRAND]: true as const }, definition),
  )
}

/** A tool, prompt, or middleware with the plugin that contributed it. */
interface Owned<T> {
  value: T
  owner: string
}

/** The contributions that `withoutOwners` filters, each with its owner. */
interface OwnedLists {
  /** The `'system'` and the `'context'` prompts. */
  prompts: Array<Owned<PluginPrompt>>
  middleware: Array<Owned<AnyChatMiddleware>>
  agentMiddleware: Array<Owned<AnyChatMiddleware>>
  generationMiddleware: Array<Owned<AnyGenerationMiddleware>>
  adapters: Array<Owned<NonNullable<PluginContributions['adapter']>>>
  /** Root agents. `ctx.agents.set` and `delete` change them after setup. */
  agents: Array<Owned<AnyAgent>>
  subagents: Array<Owned<AnyAgent>>
}

/** The values of `list`, without the owners. */
const valuesIn = <T>(list: ReadonlyArray<Owned<T>>) =>
  list.map((entry) => entry.value)

/** The `'system'` prompts of `prompts`, then the `'context'` prompts. */
function splitPrompts(prompts: ReadonlyArray<Owned<PluginPrompt>>) {
  return {
    system: prompts.filter((entry) => entry.value.placement !== 'context'),
    context: prompts.filter((entry) => entry.value.placement === 'context'),
  }
}

/** Everything a set of mounted plugins contributes, plus its cleanup. */
export interface MountedPlugins {
  tools: Array<AnyTool>
  /** The `'system'` prompts: strings, or functions to call for each turn. */
  prompts: Array<string | ((turn: TurnInfo) => string)>
  /** The `'context'` prompts, with their owners. They go last in the system prompts. */
  contextPrompts: Array<{
    text: string | ((turn: TurnInfo) => string)
    owner: string
  }>
  commands: Map<string, { command: AnyCommand; owner: string }>
  config: Map<string, { option: ConfigOption; owner: string }>
  /** Contributions to extension points, by point name. */
  extensions: Map<string, Array<{ value: unknown; owner: string }>>
  adapters: Array<NonNullable<PluginContributions['adapter']>>
  turnStarts: Array<{
    start: NonNullable<PluginContributions['onTurnStart']>
    owner: string
  }>
  discoverers: Array<{
    discover: NonNullable<PluginContributions['discoverTools']>
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
    /** The owner of each `'system'` prompt, then of each `'context'` prompt. */
    prompts: Array<{ id: string; owner: string }>
    /** The plugin that provided each capability of `values`. */
    capabilities: Array<{ name: string; owner: string }>
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
  /**
   * A copy without everything that the plugins in `names` contributed: tools,
   * prompts (also the `'context'` prompts), every kind of middleware, agents, subagents, commands, config,
   * adapter picks, discoverers, preparers, extension items, and capabilities.
   * The copy reads the commands and agents of this set at each use, so a
   * later `ctx.agents.set` or `ctx.commands.set` of a kept plugin reaches
   * it. It shares `dispose` with this set. It throws when
   * a kept plugin requires a capability that a removed plugin provides.
   */
  withoutOwners: (names: ReadonlyArray<string>) => MountedPlugins
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
  /**
   * The setup of a plugin with `lifetime: 'host'` that the host shares. The
   * mount gives it back when it is disposed. Without it, a host plugin is
   * set up for this mount only.
   */
  hostPlugin?: (plugin: HostPluginDefinition<any>) => Promise<SharedHostPlugin>
  /** The harness name a host plugin gets without `hostPlugin`. */
  harnessName?: string
  /**
   * The plugins whose extension items `collect` hides now: the plugins that
   * the thread removed. Read at each `collect` read.
   */
  hiddenOwners?: () => ReadonlySet<string>
}

const unavailable = (what: string) => () => {
  throw new Error(`${what} is only available inside a harness session.`)
}

/** Each call of a service of a session plugin, which has no user, fails. */
const noUser = (what: 'credentials' | 'keys') => async () => {
  throw new Error(
    `ctx.${what} of a session plugin has no user. In a tool or a middleware hook, read ctx.context.run.${what}. In a command, use the ${what} of its run context.`,
  )
}

/** @internal `ctx.credentials` of a session plugin. Each call fails. */
export const SESSION_PLUGIN_CREDENTIALS: CredentialsAccess = {
  get: noUser('credentials'),
  require: noUser('credentials'),
  set: noUser('credentials'),
  refresh: noUser('credentials'),
  delete: noUser('credentials'),
  list: noUser('credentials'),
}

/** @internal `ctx.keys` of a session plugin. Each call fails. */
export const SESSION_PLUGIN_KEYS: ProviderKeys = {
  get: noUser('keys'),
  require: noUser('keys'),
  adapter: noUser('keys'),
}

/**
 * @internal The same, on a host whose keys never fall back to env vars
 * (access without `allowServerEnvKeys`). `providerKeys()` tells the two apart.
 */
export const SESSION_PLUGIN_KEYS_NO_ENV: ProviderKeys = {
  ...SESSION_PLUGIN_KEYS,
}

const NO_SESSION: PluginSessionApi = {
  threadId: '',
  user: undefined,
  snapshot: unavailable('ctx.session'),
  send: unavailable('ctx.session'),
  note: unavailable('ctx.session'),
  transcript: unavailable('ctx.session'),
  keptRecords: unavailable('ctx.session'),
  replaceTranscript: unavailable('ctx.session'),
  indexEntry: unavailable('ctx.session'),
  updateIndexEntry: unavailable('ctx.session'),
  ask: unavailable('ctx.session'),
  authRequired: unavailable('ctx.session'),
  setPluginSetting: unavailable('ctx.session'),
  threadSettings: unavailable('ctx.session'),
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
    refresh: unavailable('ctx.credentials'),
    delete: unavailable('ctx.credentials'),
    list: unavailable('ctx.credentials'),
  },
  keys: {
    get: unavailable('ctx.keys'),
    require: unavailable('ctx.keys'),
    adapter: unavailable('ctx.keys'),
  },
  session: NO_SESSION,
  sessionWith: () => NO_SESSION,
  agents: {
    run: unavailable('ctx.agents.run'),
    start: unavailable('ctx.agents.start'),
    group: unavailable('ctx.agents.group'),
  },
  modelChat: unavailable('ctx.model'),
}

/**
 * @internal The metadata store of the session, for first-party plugins that
 * need it outside a chat run (in a command). The package does not export it.
 */
export const SessionMetadata = createCapability<MetadataStore>()(
  'tanstack/session-metadata',
)

/**
 * @internal How the snapshots plugin puts files back for `session.revert`.
 * The package does not export it.
 */
export interface RevertFilesHandler {
  /**
   * Put back the files that the tool calls of `hidden` changed. Other files
   * stay as they are. `records` reads the host records of one type from the
   * session log. `run` is a run of the revert in the thread of the session,
   * so a workspace that is not open on this host opens again from the log.
   * Resolves to what `unrevert` needs (JSON), or `undefined` when no file
   * changed.
   */
  revert: (
    hidden: ReadonlyArray<ModelMessage>,
    records: (type: string) => Promise<Array<Record<string, unknown>>>,
    run: RunContext,
  ) => Promise<unknown>
  /** Put the files back as they were before `revert`. `run` as in `revert`. */
  unrevert: (saved: unknown, run: RunContext) => Promise<void>
}

/** @internal See {@link RevertFilesHandler}. */
export const RevertFiles = createCapability<RevertFilesHandler>()(
  'tanstack/revert-files',
)

/**
 * @internal Tells first-party plugins whether a revert stands. The session
 * provides it. The package does not export it.
 */
export const RevertStanding = createCapability<() => boolean>()(
  'tanstack/revert-standing',
)

/**
 * @internal Aborts when the session closes, not on a reload. Work that
 * belongs to the session, like background `bash` jobs, stops with it. The
 * package does not export it.
 */
export const SessionSignal = createCapability<AbortSignal>()(
  'tanstack/session-signal',
)

/**
 * @internal Tells the session that a background job, like a `bash` job,
 * started or ended. A durable session logs it, so recovery can note a job
 * that a crash stopped. `backendId` is the id of the process in the
 * workspace backend, so a later host can stop it. `threadId` is the thread
 * of the workspace that runs it. Default: the thread of the session. The
 * package does not export it.
 */
export const BackgroundJobs = createCapability<BackgroundJobsApi>()(
  'tanstack/background-jobs',
)

/** @internal See {@link BackgroundJobs}. */
export interface BackgroundJobsApi {
  started: (job: {
    jobId: string
    backendId?: string
    threadId?: string
    /** The command or the tool name. */
    label?: string
  }) => void
  ended: (job: { jobId: string; threadId?: string }) => void
}

/**
 * @internal What the workspace tools keep in the session log: the binding of
 * the workspace of each thread, the pin of the log to a host, and the jobs
 * that no tool of this host runs. The session provides it. The package does
 * not export it.
 */
export const WorkspaceLog = createCapability<WorkspaceLogApi>()(
  'tanstack/workspace-log',
)

/** @internal See {@link WorkspaceLog}. */
export interface WorkspaceLogApi {
  /**
   * The stable id of this host, for a `'host'` binding, or `undefined` when
   * the host has none. Without it, a folder binding pins nothing.
   */
  hostId: () => string | undefined
  /** The last binding of the workspace of `threadId`, or `undefined`. */
  bound: (threadId: string) => WorkspaceBinding | undefined
  /** Log `binding` as the workspace of `threadId`. */
  bind: (input: {
    threadId: string
    binding: WorkspaceBinding
  }) => Promise<void>
  /** Pin the log to the host `hostId`. */
  pin: (hostId: string) => Promise<void>
  /**
   * The background jobs of the workspace of `threadId` that the log has as
   * running, with a backend id, and that do not run on this host.
   */
  lostJobs: (threadId: string) => Array<{ jobId: string; backendId: string }>
  /**
   * The workspace of the run `operationId` is gone. The session sends
   * `harness.stranded`. `hostId`: the host of a folder binding.
   */
  stranded: (input: { operationId: string; hostId?: string }) => void
}

/**
 * @internal Tells first-party plugins that a thread ended for good:
 * `host.sessions.delete` purges it. A session close is not the end of a
 * thread (the next host reattaches it), so this is the only place to free
 * what lives as long as the thread, like an owned sandbox or the shadow
 * repository of the snapshots. A plugin adds its handler in its setup, also
 * in the `session` part of a host plugin. The session provides it. The
 * package does not export it.
 */
export const ThreadEnds = createCapability<ThreadEndsApi>()(
  'tanstack/thread-ends',
)

/** @internal See {@link ThreadEnds}. */
export interface ThreadEndsApi {
  /** Add `handler`. Gives a function that removes it. */
  add: (handler: ThreadEndHandler) => () => void
}

/**
 * @internal A handler of {@link ThreadEnds}. `run` is a run of the purge in
 * the thread, for a `reattach` that needs one.
 */
export type ThreadEndHandler = (thread: {
  tenantId: string | undefined
  threadId: string
  run: RunContext
}) => Promise<void>

/**
 * @internal Takes the secrets of the session out of `text`, as the session
 * does for tool results. A plugin that writes tool output to a file uses it.
 * The session provides it. The package does not export it.
 */
export const SessionScrub = createCapability<(text: string) => string>()(
  'tanstack/session-scrub',
)

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

  /** A copy without the `removed` handles. The parent stays the same. */
  without(removed: ReadonlySet<CapabilityHandle>) {
    const copy = new CapabilityValues(this.parent)
    for (const handle of this.handles) {
      if (!removed.has(handle)) copy.provide(handle, this.get(handle))
    }
    return copy
  }
}

/**
 * Chat middleware that provides every capability of `values` to each chat
 * run, so any chat middleware can read it with `getX(ctx)`.
 */
function capabilityBridgeOf(values: CapabilityValues) {
  const handles = values.handles
  if (handles.length === 0) return undefined
  const bridge: AnyChatMiddleware = {
    name: 'harness:plugin-capabilities',
    provides: handles,
    setup(ctx) {
      for (const handle of handles) handle[1](ctx, values.get(handle))
    },
  }
  return bridge
}

/** What `withoutOwners` needs to know about a mount. */
interface MountRecord {
  plugins: ReadonlyArray<HarnessPlugin>
  /** The plugin that provided each capability. */
  capabilityOwners: ReadonlyMap<CapabilityHandle, string>
  owned: OwnedLists
}

/** `mounted` without what the plugins in `names` contributed. */
function withoutOwnersOf(
  mounted: MountedPlugins,
  record: MountRecord,
  names: ReadonlyArray<string>,
) {
  const removed = new Set(names)
  const isKept = (owner: string | undefined) =>
    owner === undefined || !removed.has(owner)
  const isKeptEntry = (entry: { owner: string }) => isKept(entry.owner)
  const plugins = record.plugins.filter((plugin) => isKept(plugin.name))
  for (const plugin of plugins) {
    for (const handle of plugin.requires ?? []) {
      const owner = record.capabilityOwners.get(handle)
      if (isKept(owner)) continue
      throw new Error(
        `Cannot remove plugin ${owner}: plugin ${plugin.name} requires its capability "${handle.capabilityName}".`,
      )
    }
  }
  const removedHandles = new Set<CapabilityHandle>()
  for (const [handle, owner] of record.capabilityOwners) {
    if (!isKept(owner)) removedHandles.add(handle)
  }
  const values = mounted.values.without(removedHandles)
  const { owners } = mounted
  const keptTools = new Set(
    owners.tools.filter(isKeptEntry).map((entry) => entry.name),
  )
  const extensions = new Map<string, Array<{ value: unknown; owner: string }>>()
  for (const [point, items] of mounted.extensions) {
    extensions.set(point, items.filter(isKeptEntry))
  }
  const { owned } = record
  const kept: OwnedLists = {
    prompts: owned.prompts.filter(isKeptEntry),
    middleware: owned.middleware.filter(isKeptEntry),
    agentMiddleware: owned.agentMiddleware.filter(isKeptEntry),
    generationMiddleware: owned.generationMiddleware.filter(isKeptEntry),
    adapters: owned.adapters.filter(isKeptEntry),
    // Agents are read at each use: a kept plugin can change them later
    // (`ctx.agents.set`), and this thread must see that.
    get agents() {
      return owned.agents.filter(isKeptEntry)
    },
    get subagents() {
      return owned.subagents.filter(isKeptEntry)
    },
  }
  const next: MountedPlugins = {
    tools: mounted.tools.filter((tool) => keptTools.has(tool.name)),
    prompts: splitPrompts(kept.prompts).system.map((entry) => entry.value.text),
    contextPrompts: mounted.contextPrompts.filter(isKeptEntry),
    middleware: valuesIn(kept.middleware),
    agentMiddleware: valuesIn(kept.agentMiddleware),
    generationMiddleware: valuesIn(kept.generationMiddleware),
    // Commands are read at each use, as agents are (`ctx.commands.set`).
    get commands() {
      return new Map(
        [...mounted.commands].filter(([, entry]) => isKeptEntry(entry)),
      )
    },
    config: new Map(
      [...mounted.config].filter(([, entry]) => isKeptEntry(entry)),
    ),
    extensions,
    adapters: valuesIn(kept.adapters),
    turnStarts: mounted.turnStarts.filter(isKeptEntry),
    discoverers: mounted.discoverers.filter(isKeptEntry),
    preparers: mounted.preparers.filter(isKeptEntry),
    get agents() {
      return valuesIn(kept.agents)
    },
    get subagents() {
      return valuesIn(kept.subagents)
    },
    owners: {
      plugins: owners.plugins.filter((plugin) => isKept(plugin.name)),
      tools: owners.tools.filter(isKeptEntry),
      prompts: owners.prompts.filter(isKeptEntry),
      capabilities: owners.capabilities.filter(isKeptEntry),
    },
    capabilityBridge: capabilityBridgeOf(values),
    values,
    dispose: mounted.dispose,
    withoutOwners: (more) =>
      withoutOwnersOf(next, { ...record, plugins, owned: kept }, more),
  }
  return next
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
  prompt: string | ((turn: TurnInfo) => string) | PluginPrompt,
  owner: string,
  index: number,
): PluginPrompt {
  return typeof prompt === 'string' || typeof prompt === 'function'
    ? { id: `${owner}#${index}`, text: prompt }
    : prompt
}

/**
 * The shared setup of a host plugin. Without a host, the plugin is set up
 * in `scope`, for this mount only.
 */
async function sharedSetup(
  plugin: HostPluginDefinition<any>,
  scope: ResourceScope,
  env: MountEnvironment,
): Promise<SharedHostPlugin> {
  if (env.hostPlugin) return env.hostPlugin(plugin)
  const context = hostPluginContext(env.harnessName ?? '', scope)
  return {
    contributions: await plugin.setup(context),
    release: () => Promise.resolve(),
  }
}

/** A turn plugin added a command or a config option. */
const turnOnly = (plugin: string) =>
  new Error(
    `Plugin ${plugin}: a plugin with lifetime 'turn' cannot add commands or config. Use lifetime 'session'.`,
  )

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
  const owned: OwnedLists = {
    prompts: [],
    middleware: [],
    agentMiddleware: [],
    generationMiddleware: [],
    adapters: [],
    agents: [],
    subagents: [],
  }
  const { prompts, agents: roots, subagents: subs } = owned
  const capabilityOwners = new Map<CapabilityHandle, string>()
  const commands = new Map<string, { command: AnyCommand; owner: string }>()
  const config = new Map<string, { option: ConfigOption; owner: string }>()
  const extensions = new Map<string, Array<{ value: unknown; owner: string }>>()
  for (const [point, items] of env.inheritedExtensions ?? []) {
    extensions.set(point, [...items])
  }
  const turnStarts: MountedPlugins['turnStarts'] = []
  const discoverers: MountedPlugins['discoverers'] = []
  const preparers: MountedPlugins['preparers'] = []
  const services = env.services ?? NO_SERVICES
  const indexIn = (name: string, list: Array<Owned<AnyAgent>>) =>
    list.findIndex((entry) => entry.value.name === name)
  const remove = (name: string, list: Array<Owned<AnyAgent>>) => {
    const at = indexIn(name, list)
    if (at >= 0) list.splice(at, 1)
  }
  // `ctx.commands.ready`: resolves after the last plugin is set up. A failed
  // mount leaves it pending, so no plugin acts on a session that never opens.
  let markReady = () => {}
  const ready = new Promise<void>((resolve) => (markReady = resolve))
  // The shown values of each extension point, built again only when it grows
  // or when the hidden owners change. Contributions are only added, so the
  // length tells when a copy is old. `hiddenOwners` gives a new set when the
  // thread removes other plugins, so a different set also makes it old.
  const snapshots = new Map<
    string,
    {
      length: number
      hidden: ReadonlySet<string> | undefined
      values: Array<unknown>
    }
  >()
  const valuesOf = (point: string) => {
    const items = extensions.get(point) ?? []
    const hidden = env.hiddenOwners?.()
    const cached = snapshots.get(point)
    if (cached?.length === items.length && cached.hidden === hidden) {
      return cached.values
    }
    const shown = hidden?.size
      ? items.filter((item) => !hidden.has(item.owner))
      : items
    const fresh = shown.map((item) => item.value)
    snapshots.set(point, { length: items.length, hidden, values: fresh })
    return fresh
  }
  // True after the last setup. No plugin contributes after that.
  let settled = false
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
      const context: PluginSetupContext<any> = {
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
          capabilityOwners.set(handle, plugin.name)
        },
        agents: {
          list: () => env.registry.list(),
          get: (name) => env.registry.get(name),
          find: (query) => env.registry.find(query),
          run: services.agents.run,
          start: services.agents.start,
          group: services.agents.group,
          set: (agent, options) => {
            env.registry.set(agent, plugin.name)
            const list = options?.subagent ? subs : roots
            remove(agent.name, options?.subagent ? roots : subs)
            const at = indexIn(agent.name, list)
            list.splice(at < 0 ? list.length : at, 1, {
              value: agent,
              owner: plugin.name,
            })
          },
          delete: (name) => {
            env.registry.delete(name, plugin.name)
            // Still there: another owner has it.
            if (env.registry.get(name)) return
            remove(name, roots)
            remove(name, subs)
          },
        },
        collect: <T>(point: ExtensionPoint<T>): ReadonlyArray<T> => {
          const name = point.name
          if (!extensions.has(name)) extensions.set(name, [])
          // The values are the `T` items that plugins gave for this point,
          // without the items of the plugins that the thread removed.
          const live = () => valuesOf(name) as Array<T>
          // After setup, no plugin contributes: give the array itself.
          if (settled) return live()
          // During setup, a live view: items contributed after this call
          // appear too. Array methods like `filter` also check that an index
          // exists, so every trap reads the items, not the empty target.
          return new Proxy<Array<T>>([], {
            get: (_target, key) => Reflect.get(live(), key),
            has: (_target, key) => Reflect.has(live(), key),
            ownKeys: () => Reflect.ownKeys(live()),
            getOwnPropertyDescriptor: (_target, key) =>
              Reflect.getOwnPropertyDescriptor(live(), key),
          })
        },
        emit: (event, value) => services.emit(plugin.name, event.name, value),
        on: (event, handler) => {
          const stop = services.on(event.name, (value) =>
            handler(value as never),
          )
          // The listener goes away with the plugin, for example on a reload.
          // `off` also removes this abort listener, so many `on` and `off`
          // calls do not add up listeners on the plugin signal.
          const off = () => {
            scope.signal.removeEventListener('abort', off)
            stop()
          }
          scope.signal.addEventListener('abort', off, { once: true })
          return off
        },
        state: (initial) => services.state(plugin.name, initial),
        config: services.config,
        credentials: services.credentials,
        keys: services.keys,
        session: plugin.metadataSchema
          ? services.sessionWith(plugin.metadataSchema)
          : services.session,
        commands: {
          has: (name) => ownerOf(name) !== undefined,
          set: (name, command) => {
            if (env.turn) throw turnOnly(plugin.name)
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
        model: {
          chat: async ({ run = env.turn?.run, ...call }) => {
            if (!run) {
              throw new Error(
                `ctx.model.chat of ${plugin.name} needs a run. In a tool or a middleware hook, pass run: ctx.context.run. In a command, pass the run of its context.`,
              )
            }
            // The session gives back what chat() gave for these options.
            return (await services.modelChat({
              ...call,
              run,
              source: `plugin:${plugin.name}`,
            })) as never
          },
        },
        ...(env.turn ? { turn: env.turn } : {}),
      }
      let parts: Array<PluginContributions | void>
      if (plugin.lifetime === 'host') {
        // The shared setup goes back when this mount is disposed.
        const shared = await scope.acquire(
          () => sharedSetup(plugin, scope, env),
          (setup) => setup.release(),
        )
        const own = await shared.contributions?.session?.(context)
        parts = [shared.contributions, own]
      } else {
        parts = [await plugin.setup?.(context)]
      }
      for (const handle of plugin.provides ?? []) {
        if (!provided.has(handle)) {
          throw new Error(
            `Plugin ${plugin.name} declares capability "${handle.capabilityName}" in provides but did not provide it in setup.`,
          )
        }
      }
      for (const contributions of parts) {
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
        const own = <T>(value: T) => ({ value, owner: plugin.name })
        owned.middleware.push(...(contributions.middleware ?? []).map(own))
        owned.agentMiddleware.push(
          ...(contributions.agentMiddleware ?? []).map(own),
        )
        owned.generationMiddleware.push(
          ...(contributions.generationMiddleware ?? []).map(own),
        )
        // The session reads commands and config only from its session plugins.
        const isSessionOnly =
          Object.keys(contributions.commands ?? {}).length > 0 ||
          Object.keys(contributions.config ?? {}).length > 0
        if (env.turn && isSessionOnly) throw turnOnly(plugin.name)
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
        for (const [key, option] of Object.entries(
          contributions.config ?? {},
        )) {
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
        if (contributions.adapter)
          owned.adapters.push(own(contributions.adapter))
        if (contributions.onTurnStart) {
          turnStarts.push({
            start: contributions.onTurnStart,
            owner: plugin.name,
          })
        }
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
          roots.push(own(agent))
        }
        for (const agent of contributions.subagents ?? []) {
          env.registry.add(agent, plugin.name)
          subs.push(own(agent))
        }
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

  settled = true
  markReady()
  let disposed: Promise<void> | undefined
  const record: MountRecord = { plugins, capabilityOwners, owned }
  const { system: systemPrompts, context: contextPrompts } =
    splitPrompts(prompts)
  const mounted: MountedPlugins = {
    tools: tools
      .filter((entry) => entry.owner !== 'the harness')
      .map((entry) => entry.value),
    prompts: systemPrompts.map((entry) => entry.value.text),
    contextPrompts: contextPrompts.map((entry) => ({
      text: entry.value.text,
      owner: entry.owner,
    })),
    middleware: valuesIn(owned.middleware),
    agentMiddleware: valuesIn(owned.agentMiddleware),
    generationMiddleware: valuesIn(owned.generationMiddleware),
    commands,
    config,
    extensions,
    adapters: valuesIn(owned.adapters),
    turnStarts,
    discoverers,
    preparers,
    // Read at each use: `ctx.agents.set` and `delete` change them later.
    get agents() {
      return valuesIn(roots)
    },
    get subagents() {
      return valuesIn(subs)
    },
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
      prompts: [...systemPrompts, ...contextPrompts].map((entry) => ({
        id: entry.value.id,
        owner: entry.owner,
      })),
      capabilities: [...capabilityOwners].map(([handle, owner]) => ({
        name: handle.capabilityName,
        owner,
      })),
    },
    capabilityBridge: capabilityBridgeOf(values),
    values,
    dispose: () => (disposed ??= disposeAll(scopes)),
    withoutOwners: (names) => withoutOwnersOf(mounted, record, names),
  }
  return mounted
}
