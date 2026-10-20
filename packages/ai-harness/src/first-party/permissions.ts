import { createCapability, getMetadata } from '@tanstack/ai'
import { approvalInterrupt, readApproval } from '../boundary-waits'
import { defineCommand } from '../commands'
import { configOption } from '../config'
import { createExtensionPoint } from '../extensions'
import { SessionMetadata, definePlugin } from '../plugins'
import { isRecord } from '../utils'
import { globToRegExp } from './glob'
import type {
  AnyChatMiddleware,
  MetadataStore,
  ModelMessage,
  ToolCall,
} from '@tanstack/ai'

export type PermissionDecision = 'allow' | 'ask' | 'deny'

/** A rule for one tool. `kind` lets the modes treat edits and commands differently. */
export interface PermissionRule {
  /** A tool name. A trailing `*` matches a prefix, for example `git_*`. */
  tool: string
  /**
   * A glob on what the call touches: a path for file tools (`src/**`,
   * relative to the root), or a command part for shell tools (`git *`).
   * Without it, the rule matches every call of the tool.
   */
  resource?: string
  decision: PermissionDecision
  kind?: 'read' | 'edit' | 'execute'
}

/**
 * Tool plugins add their rules here. `permissions()` reads them, and adds its
 * own `rules` too, so other readers like `codeMode()` see them.
 */
export const PermissionRules = createExtensionPoint<PermissionRule>(
  'tanstack/permission-rules',
)

/** A list of resources, now or later. */
type Listed = ReadonlyArray<string> | Promise<ReadonlyArray<string>>

/**
 * What the calls of one tool touch. Each function gets the raw input the
 * model sent, before the schema check, and can be async (for example to
 * read the real path of a link). A function that throws refuses the call.
 * `permissions()` reads them before the tools of a model message run, so a
 * call that asks stops the turn before it starts.
 */
export interface ToolResources {
  /** The files the call reads or writes, relative to the root or absolute. */
  paths?: (input: unknown) => Listed
  /** The shell commands the call runs, one part for each simple command. */
  commands?: (input: unknown) => Listed
  /**
   * The paths of the call outside the folders the tool may use. Each one
   * asks, like a path outside `root`, unless a rule with a `resource`
   * allows it.
   */
  outside?: (input: unknown) => Listed
  /**
   * The other actions the call runs, by the tool name of their rules, for
   * example `formatter:prettier` after a write. Each one is decided by its
   * own rules. One that asks makes the call ask, and an `always` answer
   * saves an allow rule for it, except for an action with `@unsaved:` in
   * it, which asks each time. One that a rule denies does not refuse the
   * call: the plugin that runs it skips it.
   */
  actions?: (input: unknown) => Listed
}

/**
 * Tool plugins say what each call touches, so rules with a `resource` can
 * match it. Each item maps tool names to their resources, for example
 * `PermissionResources.item({ read_file: { paths: (input) => [...] } })`.
 */
export const PermissionResources = createExtensionPoint<
  Readonly<Record<string, ToolResources>>
>('tanstack/permission-resources')

export const PERMISSION_MODES = [
  'default',
  'plan',
  'acceptEdits',
  'bypass',
] as const
export type PermissionMode = (typeof PERMISSION_MODES)[number]

/**
 * What `permissions()` decides for a call of `tool` in `mode`. With
 * `resources`, for a call that touches them. Without, for a call that
 * declares no `PermissionResources`. It uses all rules in their order, the
 * `default`, and the `root`. Other plugins, like `codeMode()` and
 * `workspaceTools()`, ask it. Saved answers are not used: they only allow
 * more, so an answer here is never looser than a call.
 */
export const PermissionDecisionCapability = createCapability<
  (
    tool: string,
    mode: PermissionMode,
    resources?: CallResources,
  ) => PermissionDecision
>()('tanstack/permission-decision')

/**
 * True when a command part still has shell syntax that can run or chain
 * more commands (`$(`, a backtick, `;`, `&`, `|`, `<`, `>`, a new line), so
 * no allow rule applies to it.
 */
export function isUnsplittableCommand(part: string) {
  return /[`;&|<>\r\n]|\$\(/.test(part)
}

/** What one call touches, as a tool's `ToolResources` returns it. */
export interface CallResources {
  paths?: ReadonlyArray<string>
  commands?: ReadonlyArray<string>
  /** Paths that ask, like a path outside the root. */
  outside?: ReadonlyArray<string>
  /** Other actions of the call, by the tool name of their rules. */
  actions?: ReadonlyArray<string>
}

/** One thing a call touches, ready to match rule globs against. */
interface Resource {
  type: 'path' | 'command'
  /** The text rules match: a path relative to the root, or a command part. */
  match: string
  /** Asks even when a rule without a `resource` allows the tool. */
  risky: boolean
  /** No allow rule applies. */
  unsplittable: boolean
  /** Compare without letter case (a Windows path). */
  foldCase: boolean
}

function matchesTool(rule: PermissionRule, tool: string) {
  return rule.tool.endsWith('*')
    ? tool.startsWith(rule.tool.slice(0, -1))
    : rule.tool === tool
}

/** A path or a drive root in Windows form: `C:\x`, `C:/x`, or `\\server\share`. */
function isWindowsPath(path: string) {
  return /^([a-z]:[\\/]|[\\/]{2})/i.test(path)
}

/**
 * Compare paths without letter case on macOS and Windows, whose file systems
 * ignore case by default, and for any Windows-form path. Else `Secrets/key`
 * would pass a deny rule for `secrets/**`.
 */
// ponytail: platform default, add a `caseInsensitive` option if a case-sensitive macOS volume needs it
function foldsCase(path: string) {
  const platform = typeof process === 'undefined' ? '' : process.platform
  return platform === 'darwin' || platform === 'win32' || isWindowsPath(path)
}

/** `path` with `/` separators, and `.` and `..` resolved. */
function normalizePath(path: string) {
  const slashed = path.replaceAll('\\', '/')
  const prefix =
    /^[a-z]:\//i.exec(slashed)?.[0] ?? (slashed.startsWith('/') ? '/' : '')
  const segments: Array<string> = []
  const parts = slashed.slice(prefix.length).split('/')
  for (const segment of parts) {
    if (segment === '' || segment === '.') continue
    const climbs =
      segment === '..' && segments.length > 0 && segments.at(-1) !== '..'
    if (climbs) segments.pop()
    // `..` above an absolute root stays at the root.
    else if (segment !== '..' || prefix === '') segments.push(segment)
  }
  return prefix + segments.join('/')
}

/** A `.env` file, or `.env.local` and the like. They often hold secrets. */
function isEnvFile(path: string) {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  return /\.env(\.|$)/.test(name)
}

function pathResource(path: string, root: string | undefined) {
  const foldCase = foldsCase(root ?? path)
  const slashed = path.replaceAll('\\', '/')
  // Forms we cannot resolve without the file system ask: `C:x` (relative to
  // the current folder of drive C), a stream (`a.txt:secret`), and a name
  // that ends in `.` or a space (Windows drops them).
  const cannotResolve =
    slashed.replace(/^[a-z]:\//i, '').includes(':') ||
    slashed
      .split('/')
      .some((part) => /[. ]$/.test(part) && part !== '.' && part !== '..')
  const isAbsolute = /^([a-z]:)?\//i.test(slashed)
  const full = normalizePath(
    isAbsolute || root === undefined ? slashed : `${root}/${slashed}`,
  )
  const resource = {
    type: 'path' as const,
    match: full,
    risky: cannotResolve || isEnvFile(full),
    unsplittable: false,
    foldCase,
  }
  if (root === undefined) return resource
  const base = normalizePath(root)
  const folder = base.endsWith('/') ? base : `${base}/`
  const fold = (value: string) => (foldCase ? value.toLowerCase() : value)
  const isInside =
    fold(full) === fold(base) || fold(full).startsWith(fold(folder))
  // Inside the root, rules match the relative path. Outside, the full path.
  return isInside
    ? { ...resource, match: full.slice(folder.length) }
    : { ...resource, risky: true }
}

function commandResource(part: string) {
  return {
    type: 'command' as const,
    match: part.trim(),
    risky: false,
    unsplittable: isUnsplittableCommand(part),
    foldCase: false,
  }
}

/** A command glob: `*` matches any text, `/` too. */
function commandPattern(glob: string) {
  const source = glob
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`)
}

/** The most compiled rule patterns kept. */
const MAX_PATTERNS = 1000

// ponytail: one cache for all sessions. It is cleared when it is full, so
// many saved answers cannot grow it forever.
const patterns = new Map<string, RegExp>()

/** The RegExp of a rule `glob` for `resource`, compiled once. */
function patternOf(glob: string, resource: Resource) {
  const flags = resource.foldCase ? 'i' : ''
  const key = `${resource.type}:${flags}:${glob}`
  const cached = patterns.get(key)
  if (cached) return cached
  if (patterns.size >= MAX_PATTERNS) patterns.clear()
  const pattern =
    resource.type === 'command'
      ? commandPattern(glob)
      : new RegExp(globToRegExp(glob.replaceAll('\\', '/')).source, flags)
  patterns.set(key, pattern)
  return pattern
}

function matchesResource(glob: string, resource: Resource) {
  return patternOf(glob, resource).test(resource.match)
}

function strictest(decisions: ReadonlyArray<PermissionDecision>) {
  if (decisions.includes('deny')) return 'deny'
  if (decisions.includes('ask')) return 'ask'
  return 'allow'
}

/**
 * The decision for a tool call in a mode. The last matching rule wins.
 *
 * - With `resources`, each path and command part is checked, and every one
 *   must be allowed. A path outside `root`, a `.env` file, or a path that
 *   cannot be resolved asks, unless a rule with a `resource` allows it. A
 *   command part with shell syntax (see `isUnsplittableCommand`) never gets
 *   an allow.
 * - Without `resources`, the call could touch anything, so a later rule
 *   with a `resource` that asks or denies counts too.
 *
 * Modes: `bypass` allows all. `plan` denies edits, commands, and every call
 * that is not an allow. `acceptEdits` allows edits that would ask.
 */
export function decidePermission(
  rules: ReadonlyArray<PermissionRule>,
  tool: string,
  mode: PermissionMode,
  options: {
    fallback?: PermissionDecision
    resources?: CallResources
    /** The workspace root. Without it, no path counts as outside. */
    root?: string
  } = {},
) {
  if (mode === 'bypass') return 'allow'
  // An allow rule without `kind` must not hide that a tool edits.
  const kind = rules.findLast(
    (rule) => matchesTool(rule, tool) && rule.kind !== undefined,
  )?.kind
  if (mode === 'plan' && (kind === 'edit' || kind === 'execute')) return 'deny'
  const decisionOf = (rule: PermissionRule | undefined) => {
    const decision = rule?.decision ?? options.fallback ?? 'allow'
    const autoEdit =
      mode === 'acceptEdits' &&
      kind === 'edit' &&
      decision === 'ask' &&
      rule?.resource === undefined
    return autoEdit ? 'allow' : decision
  }
  const toolRules = rules.filter((rule) => matchesTool(rule, tool))
  const lastToolLevel = toolRules.findLastIndex(
    (rule) => rule.resource === undefined,
  )
  const toolLevel = lastToolLevel === -1 ? undefined : toolRules[lastToolLevel]
  const decideOne = (resource: Resource) => {
    const rule = toolRules.findLast(
      (candidate) =>
        candidate.resource === undefined ||
        matchesResource(candidate.resource, resource),
    )
    const decision = decisionOf(rule)
    if (decision !== 'allow') return decision
    const needsAsk =
      resource.unsplittable || (resource.risky && rule?.resource === undefined)
    return needsAsk ? 'ask' : 'allow'
  }
  const resources =
    options.resources === undefined
      ? undefined
      : [
          ...(options.resources.paths ?? []).map((path) =>
            pathResource(path, options.root),
          ),
          ...(options.resources.outside ?? []).map((path) => ({
            ...pathResource(path, options.root),
            risky: true,
          })),
          ...(options.resources.commands ?? []).map(commandResource),
        ]
  // Unknown resources: the rules with a `resource` after the tool rule could
  // match, so the strictest of them counts.
  const decisions =
    resources === undefined
      ? [
          decisionOf(toolLevel),
          ...toolRules.slice(lastToolLevel + 1).map((rule) => rule.decision),
        ]
      : resources.length === 0
        ? [decisionOf(toolLevel)]
        : resources.map(decideOne)
  // Each other action of the call is a tool of its own rules. An action
  // that asks makes the call ask. A denied action does not refuse the call:
  // the plugin that runs it skips it.
  const actions = (options.resources?.actions ?? []).map((action) =>
    decidePermission(rules, action, mode, { fallback: options.fallback }) ===
    'ask'
      ? 'ask'
      : 'allow',
  )
  const decision = strictest([...decisions, ...actions])
  if (mode === 'plan' && decision !== 'allow') return 'deny'
  return decision
}

/** Rules hide a tool when its last rule denies with no `resource`. */
function isHidden(
  rules: ReadonlyArray<PermissionRule>,
  tool: string,
  mode: PermissionMode,
) {
  if (mode === 'bypass') return false
  const last = rules.findLast((rule) => matchesTool(rule, tool))
  return last?.decision === 'deny' && last.resource === undefined
}

function isSavedRule(value: unknown): value is PermissionRule {
  return (
    isRecord(value) &&
    typeof value.tool === 'string' &&
    value.decision === 'allow' &&
    (value.resource === undefined || typeof value.resource === 'string')
  )
}

/** A refused call: the model gets a tool error with `error`. */
function refuse(error: string) {
  return { type: 'skip' as const, result: { error } }
}

/**
 * The tool calls of the last model message that have no result yet: the
 * calls that the tools phase runs next.
 */
function pendingCalls(messages: ReadonlyArray<ModelMessage>) {
  const index = messages.findLastIndex(
    (message) => message.role === 'assistant' && message.toolCalls?.length,
  )
  const calls: ReadonlyArray<ToolCall> = messages[index]?.toolCalls ?? []
  const done = new Set(
    messages
      .slice(index + 1)
      .flatMap((message) =>
        message.role === 'tool' && message.toolCallId
          ? [message.toolCallId]
          : [],
      ),
  )
  return calls.filter((call) => !done.has(call.id))
}

/** The arguments of a tool call. Text that is not JSON is the arguments as they are. */
function parseArgs(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

const METADATA_NAMESPACE = 'tanstack/permissions'

/** How many characters of the call arguments the approval question shows. */
const PREVIEW_LENGTH = 300

/** The root as one string for each folder: `C:\Repo` and `c:/repo/` are the same. */
function projectId(root: string) {
  const path = normalizePath(root)
  return foldsCase(root) ? path.toLowerCase() : path
}

/**
 * Where the metadata store keeps the saved rules of `project` in the tenant
 * `tenantId`. The tenant is URL-encoded, so it has no `:`, and one project
 * in two tenants is two keys.
 */
function savedKeyOf(project: string | undefined, tenantId: string | undefined) {
  const tenant = encodeURIComponent(tenantId ?? '')
  return project === undefined
    ? `permissions:saved:${tenant}`
    : `permissions:saved:${tenant}:${projectId(project)}`
}

const rulesOf = (stored: unknown) =>
  Array.isArray(stored) ? stored.filter(isSavedRule) : []

async function readSaved(metadata: MetadataStore, key: string) {
  return rulesOf(await metadata.get(METADATA_NAMESPACE, key))
}

// ponytail: 5 tries. Each conflict is a save of another host that landed.
const SAVE_ATTEMPTS = 5

/**
 * Change the saved rules at `key` with compare-and-set, so a parallel save
 * of another host is not lost. `change` returns the new list, or
 * `undefined` for no change. Throws for a store with no `getVersioned` and
 * `setIf`.
 */
async function updateSaved(
  metadata: MetadataStore,
  key: string,
  change: (rules: Array<PermissionRule>) => Array<PermissionRule> | undefined,
) {
  if (!metadata.getVersioned || !metadata.setIf) {
    throw new Error(
      'Saved permissions need a metadata store with getVersioned and setIf.',
    )
  }
  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
    const stored = await metadata.getVersioned(METADATA_NAMESPACE, key)
    const next = change(rulesOf(stored?.value))
    if (next === undefined) return
    const revision = stored?.revision ?? null
    const written = await metadata.setIf(
      METADATA_NAMESPACE,
      key,
      next,
      revision,
    )
    if (written.ok) return
  }
  throw new Error(
    `The saved permissions changed ${SAVE_ATTEMPTS} times during one save.`,
  )
}

function isSameRule(a: PermissionRule, b: PermissionRule) {
  return (
    a.tool === b.tool &&
    a.resource === b.resource &&
    a.decision === b.decision &&
    a.kind === b.kind
  )
}

/** Which tenant's saved rules a call reads or changes. */
export interface SavedPermissionsScope {
  /** The tenant of the sessions. Default: the default tenant. */
  tenantId?: string
}

/**
 * The rules that `always` answers saved for `project`, in the saved order.
 * `project` is the `root` of `permissions()`. `stores` is the persistence
 * of the host, for example `persistence.stores`. Each tenant has its own
 * rules: pass the `tenantId` of the sessions. Without a metadata store, it
 * resolves to an empty list.
 *
 * @example
 * ```ts
 * const rules = await listSavedPermissions(persistence.stores, root, { tenantId: 'org-1' })
 * ```
 */
export async function listSavedPermissions(
  stores: { metadata?: MetadataStore },
  project: string | undefined,
  scope: SavedPermissionsScope = {},
) {
  const key = savedKeyOf(project, scope.tenantId)
  return stores.metadata ? readSaved(stores.metadata, key) : []
}

/**
 * Delete one saved rule of `project` in the tenant `scope.tenantId`. The
 * rule matches by its fields, as `listSavedPermissions` gives them. An
 * unknown rule does nothing. New sessions stop using the rule. Open
 * sessions can keep it until they open again. The change is a
 * compare-and-set, so the metadata store needs `getVersioned` and `setIf`.
 */
export async function deleteSavedPermission(
  stores: { metadata?: MetadataStore },
  project: string | undefined,
  rule: PermissionRule,
  scope: SavedPermissionsScope = {},
) {
  const { metadata } = stores
  if (!metadata) return
  await updateSaved(metadata, savedKeyOf(project, scope.tenantId), (rules) => {
    // Remove every copy, so a forgotten rule never stays in force.
    const kept = rules.filter((saved) => !isSameRule(saved, rule))
    return kept.length === rules.length ? undefined : kept
  })
}

/** A saved rule as one line: the tool, then the resource. */
function describeRule(rule: PermissionRule) {
  return rule.resource === undefined
    ? rule.tool
    : `${rule.tool} ${rule.resource}`
}

const PLAN_PROMPT =
  'You are in plan mode. Do not change files or run commands. Read what you need, then describe your plan.'

/**
 * Check every tool call against permission rules, with a `mode` setting and a
 * `/mode` command:
 *
 * - `default`: rules apply as written. `ask` asks the user.
 * - `plan`: read-only. Edits and commands are denied.
 * - `acceptEdits`: edits run without asking. Commands still ask.
 * - `bypass`: everything runs.
 *
 * Rules apply in this order, and the last match wins: rules from tool
 * plugins (`PermissionRules`), then `rules`, then saved answers. A saved
 * answer never beats a deny. Tool plugins say what a call touches through
 * `PermissionResources`. A path outside `root` or a `.env` file asks, unless
 * a rule with a `resource` allows it. A tool whose last rule denies with no
 * `resource` is removed from the model's tools.
 *
 * A question takes `once`, `always`, or `reject` with a `message` for the
 * model. `always` saves an allow rule for each path or command part of the
 * call, for the project (`root`), in the metadata store, else in memory for
 * the session. `/permissions` lists the saved rules, and
 * `/permissions forget <n>` deletes one.
 */
export function permissions(
  options: {
    rules?: ReadonlyArray<PermissionRule>
    default?: PermissionDecision
    /**
     * The workspace root. A path outside it asks, and saved answers belong
     * to it. Without it, no path counts as outside.
     */
    root?: string
  } = {},
) {
  return definePlugin({
    name: 'tanstack/permissions',
    provides: [PermissionDecisionCapability],
    setup: (ctx) => {
      const contributed = ctx.collect(PermissionRules)
      const declared = ctx.collect(PermissionResources)
      // The rules of tool plugins, then the user's rules, so the user's win.
      const configured = () => [...contributed, ...(options.rules ?? [])]
      ctx.provide(PermissionDecisionCapability, (tool, current, resources) =>
        decidePermission(configured(), tool, current, {
          fallback: options.default,
          resources,
          root: options.root,
        }),
      )
      const mode = (): PermissionMode => {
        const value = ctx.config.get('mode')
        return (
          PERMISSION_MODES.find((candidate) => candidate === value) ?? 'default'
        )
      }
      const root = options.root
      // The rules of the tenant of the session: the tenant of its opener.
      const scope = (): SavedPermissionsScope => {
        const tenantId = ctx.session.user?.tenantId
        return tenantId !== undefined ? { tenantId } : {}
      }
      const savedKey = () => savedKeyOf(root, scope().tenantId)
      // Answers saved in this session. Runs without a metadata store use them.
      const memory: Array<PermissionRule> = []
      const loadSaved = async (metadata: MetadataStore | undefined) => {
        const rules = metadata ? await readSaved(metadata, savedKey()) : []
        return [...rules, ...memory]
      }
      const save = async (
        metadata: MetadataStore | undefined,
        rules: ReadonlyArray<PermissionRule>,
      ) => {
        memory.push(...rules)
        if (!metadata || rules.length === 0) return
        await updateSaved(metadata, savedKey(), (current) => {
          const added = rules.filter(
            (rule) => !current.some((saved) => isSameRule(saved, rule)),
          )
          return added.length === 0 ? undefined : [...current, ...added]
        })
      }
      // The session's store, for commands. A chat run reads its own.
      const sessionMetadata = ctx.getOptional(SessionMetadata)
      const savedRules = async () =>
        sessionMetadata ? readSaved(sessionMetadata, savedKey()) : [...memory]
      const forget = async (arg: string) => {
        const rules = await savedRules()
        const rule = /^\d+$/.test(arg) ? rules[Number(arg) - 1] : undefined
        if (!rule) {
          return `No saved rule ${arg}. Run /permissions to see the list.`
        }
        await deleteSavedPermission(
          { metadata: sessionMetadata },
          root,
          rule,
          scope(),
        )
        // This session stops using the rule at once.
        const kept = memory.filter((saved) => !isSameRule(saved, rule))
        memory.splice(0, memory.length, ...kept)
        return `Forgot rule ${arg}: ${describeRule(rule)}.`
      }
      /** What a call touches: the resources of every plugin that names the tool. */
      const resourcesOf = async (tool: string, input: unknown) => {
        const entries = declared.flatMap((item) =>
          Object.hasOwn(item, tool) && item[tool] ? [item[tool]] : [],
        )
        if (entries.length === 0) return undefined
        const list = async (field: keyof ToolResources) => {
          const lists = await Promise.all(
            entries.map(async (entry) => (await entry[field]?.(input)) ?? []),
          )
          const values = lists.flat()
          if (!values.every((value) => typeof value === 'string')) {
            throw new Error('A resource is not a string.')
          }
          return values
        }
        const [paths, commands, outside, actions] = await Promise.all([
          list('paths'),
          list('commands'),
          list('outside'),
          list('actions'),
        ])
        return { paths, commands, outside, actions }
      }
      /** The rules an `always` answer saves: one allow for each resource. */
      const rulesToSave = (
        tool: string,
        resources: CallResources | undefined,
      ) => {
        if (resources === undefined) {
          return [{ tool, decision: 'allow' as const }]
        }
        const values = [
          ...[...(resources.paths ?? []), ...(resources.outside ?? [])].map(
            (path) => pathResource(path, root).match,
          ),
          ...(resources.commands ?? [])
            .filter((part) => !isUnsplittableCommand(part))
            .map((part) => part.trim()),
        ]
        // A `*` or `?` would turn the saved rule into a wider glob.
        const forTool = [...new Set(values)]
          .filter((value) => !/[*?]/.test(value))
          .map((resource) => ({ tool, resource, decision: 'allow' as const }))
        // An `@unsaved:` action asks each time, so a rule for it never
        // matches again: it is not saved.
        const forActions = (resources.actions ?? [])
          .filter((action) => !action.includes('@unsaved:'))
          .map((action) => ({ tool: action, decision: 'allow' as const }))
        return [...forTool, ...forActions]
      }
      const decide = async (
        tool: string,
        input: unknown,
        current: PermissionMode,
        metadata: MetadataStore | undefined,
      ) => {
        const resources = await resourcesOf(tool, input)
        const settings = { fallback: options.default, resources, root }
        const rules = configured()
        // A saved answer turns an ask into an allow. It never beats a deny,
        // so only an ask reads the saved answers.
        const first = decidePermission(rules, tool, current, settings)
        if (first !== 'ask') return { decision: first, resources }
        rules.push(...(await loadSaved(metadata)))
        const decision = decidePermission(rules, tool, current, settings)
        return { decision, resources }
      }
      /** The question of an approval for a call of `tool` with `args`. */
      const approvalMessage = (tool: string, args: unknown) => {
        const text = JSON.stringify(args ?? {})
        // Say when the preview is cut, so the user knows part of the call is hidden.
        const preview =
          text.length > PREVIEW_LENGTH
            ? `${text.slice(0, PREVIEW_LENGTH)}... (${text.length - PREVIEW_LENGTH} more characters not shown)`
            : text
        return `Allow ${tool} ${preview}? Answer once, always, or reject.`
      }
      /**
       * The answers to the approvals of the turn, by tool call id. The turn
       * that resumes gets them in `onInterruptResolution`, on any host,
       * before its tools run. A call takes its answer when it runs.
       */
      const answers = new Map<string, ReturnType<typeof readApproval>>()
      /**
       * Decide each tool call of the model message before the tools run.
       * Each call that asks opens one approval wait, so the turn stops, and
       * no process waits for the user.
       */
      const boundary: AnyChatMiddleware['onInterruptBoundary'] = async (
        run,
      ) => {
        if (run.phase !== 'beforeTools') return undefined
        const current = mode()
        if (current === 'bypass') return undefined
        const metadata = getMetadata(run, { optional: true })
        const interrupts = []
        for (const call of pendingCalls(run.messages)) {
          if (answers.has(call.id)) continue
          const tool = call.function.name
          const args = parseArgs(call.function.arguments)
          // A call that cannot be checked is refused when it runs.
          const checked = await decide(tool, args, current, metadata).catch(
            () => undefined,
          )
          if (checked?.decision !== 'ask') continue
          interrupts.push(
            approvalInterrupt.interrupt({
              key: call.id,
              reason: 'approval',
              message: approvalMessage(tool, args),
              payload: { toolCallId: call.id, tool },
            }),
          )
        }
        return interrupts.length > 0 ? { interrupts } : undefined
      }
      const check = {
        name: 'tanstack/permissions',
        onInterruptBoundary: boundary,
        onInterruptResolution: (_run, resolutions) => {
          for (const resolution of resolutions.for(approvalInterrupt)) {
            // A cancelled approval is a reject.
            answers.set(
              resolution.request.key,
              resolution.status === 'resolved'
                ? readApproval(resolution.response)
                : { choice: 'reject', message: undefined },
            )
          }
        },
        // The guard tier, not the first-win `onBeforeToolCall`: it runs for
        // every call, after every middleware that changes the args and after
        // the input check, so it decides on the args that the tool gets. A
        // middleware before this one cannot change a call past the rules.
        onGuardToolCall: async (run, hook) => {
          const current = mode()
          if (current === 'bypass') return undefined
          const metadata = getMetadata(run, { optional: true })
          const checked = await decide(
            hook.toolName,
            hook.args,
            current,
            metadata,
          ).catch((error: unknown) =>
            error instanceof Error ? error : new Error(String(error)),
          )
          // Fail closed: a call we cannot check does not run.
          if (checked instanceof Error) {
            return refuse(
              `Cannot check the permissions of this call: ${checked.message}`,
            )
          }
          const { decision, resources } = checked
          if (decision === 'allow') return undefined
          if (decision === 'deny') {
            return refuse(
              current === 'plan'
                ? 'This tool is not allowed in plan mode.'
                : 'A permission rule denies this tool.',
            )
          }
          const reply = answers.get(hook.toolCallId)
          answers.delete(hook.toolCallId)
          // The boundary asked about every call of the model message. A call
          // with no answer is one that the boundary did not see (for example,
          // a call that a `chat()` without the approval interrupt makes).
          if (!reply) {
            return refuse(
              'This call needs the approval of the user, and this run cannot ask for it.',
            )
          }
          if (reply.choice === 'reject') {
            return refuse(reply.message ?? 'The user denied this tool call.')
          }
          if (reply.choice === 'always') {
            // The session keeps the answer in memory, so a failed write does
            // not fail the call the user allowed.
            await save(metadata, rulesToSave(hook.toolName, resources)).catch(
              () => {},
            )
          }
          return undefined
        },
      } satisfies AnyChatMiddleware
      return {
        config: {
          mode: configOption.select({
            options: PERMISSION_MODES,
            default: 'default',
            category: 'mode',
            description: 'How tool calls are approved',
          }),
        },
        prompts: [
          {
            id: 'tanstack/permissions:plan',
            // It changes often: last, so the system prompts before it stay cached.
            placement: 'context',
            text: () => (mode() === 'plan' ? PLAN_PROMPT : ''),
          },
        ],
        commands: {
          mode: defineCommand({
            description: `Show or switch the mode (${PERMISSION_MODES.join(', ')})`,
            run: async (input: unknown) => {
              const next = typeof input === 'string' ? input.trim() : ''
              if (!next) return `Mode: ${mode()}.`
              const receipt = await ctx.session.setPluginSetting({
                key: 'mode',
                value: next,
              })
              return receipt.status === 'rejected'
                ? `Unknown mode "${next}". Modes: ${PERMISSION_MODES.join(', ')}.`
                : `Mode: ${next}.`
            },
          }),
          permissions: defineCommand({
            description:
              'List the saved "always" rules: /permissions. Delete one: /permissions forget <n>',
            run: async (input: unknown) => {
              const arg = typeof input === 'string' ? input.trim() : ''
              const forgetArg = /^forget\s+(.+)$/.exec(arg)?.[1]
              if (forgetArg !== undefined) return forget(forgetArg.trim())
              if (arg !== '') {
                return 'Use /permissions, or /permissions forget <n>.'
              }
              const rules = await savedRules()
              if (rules.length === 0) return 'No saved rules.'
              const lines = rules.map(
                (rule, index) => `${index + 1}. ${describeRule(rule)}`,
              )
              return ['Saved rules:', ...lines].join('\n')
            },
          }),
        },
        prepareTools: ({ tools }) => {
          const rules = configured()
          const current = mode()
          return tools.filter((tool) => !isHidden(rules, tool.name, current))
        },
        // Other readers, like codeMode(), must see the user's rules too. The
        // checks above add them again at the end, so they still win there.
        contribute: (options.rules ?? []).map((rule) =>
          PermissionRules.item(rule),
        ),
        // The lead turn and every agent run check the same rules, and ask at
        // the same boundary: the session gives each agent run the approval
        // interrupt. Each run gets only one of the two lists, so a call is
        // checked once.
        middleware: [check],
        agentMiddleware: [check],
      }
    },
  })
}
