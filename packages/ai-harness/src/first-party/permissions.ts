import { createCapability, getMetadata } from '@tanstack/ai'
import { defineCommand } from '../commands'
import { configOption } from '../config'
import { createExtensionPoint } from '../extensions'
import { SessionMetadata, definePlugin } from '../plugins'
import { isRecord } from '../utils'
import { globToRegExp } from './glob'
import type { AnyChatMiddleware, JSONSchema, MetadataStore } from '@tanstack/ai'

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

/**
 * What the calls of one tool touch. Each function gets the raw input the
 * model sent, before the schema check. A function that throws refuses the
 * call.
 */
export interface ToolResources {
  /** The files the call reads or writes, relative to the root or absolute. */
  paths?: (input: unknown) => ReadonlyArray<string>
  /** The shell commands the call runs, one part for each simple command. */
  commands?: (input: unknown) => ReadonlyArray<string>
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
 * @internal Ask the rules of `permissions()` about `tool`, an action that is
 * not a tool call, like `formatter:prettier`. It uses the saved answers. On
 * `ask`, it asks the user with `message`, and saves an `always` answer.
 * Resolves to `true` when the action can run. The package does not export it.
 */
export const PermissionPrompt = createCapability<
  (tool: string, message: string) => Promise<boolean>
>()('tanstack/permission-prompt')

/** Is the user's answer a yes: `true`, `y`, or `yes`? */
export function isYes(answer: unknown) {
  return answer === true || /^y(es)?$/i.test(String(answer).trim())
}

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

function matchesResource(glob: string, resource: Resource) {
  if (resource.type === 'command') {
    return commandPattern(glob).test(resource.match)
  }
  const pattern = globToRegExp(glob.replaceAll('\\', '/'))
  return new RegExp(pattern.source, resource.foldCase ? 'i' : '').test(
    resource.match,
  )
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
  const decision = strictest(decisions)
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

/** The answer to a permission question, for hosts that render a form. */
const ANSWER_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    answer: {
      type: 'string',
      enum: ['once', 'always', 'reject'],
      description:
        'once: allow this call. always: allow it from now on in this project. reject: refuse it.',
    },
    message: {
      type: 'string',
      description: 'With reject: what the model should do instead.',
    },
  },
  required: ['answer'],
}

/** The user's reply. Anything that is not `once` or `always` rejects. */
function readAnswer(value: unknown) {
  const raw = isRecord(value) ? value.answer : value
  const choice = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  const text =
    isRecord(value) && typeof value.message === 'string'
      ? value.message.trim()
      : ''
  return {
    choice: choice === 'once' || choice === 'always' ? choice : 'reject',
    message: text === '' ? undefined : text,
  }
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

const METADATA_NAMESPACE = 'tanstack/permissions'

/** The root as one string for each folder: `C:\Repo` and `c:/repo/` are the same. */
function projectId(root: string) {
  const path = normalizePath(root)
  return foldsCase(root) ? path.toLowerCase() : path
}

/** Where the metadata store keeps the saved rules of `project`. */
function savedKeyOf(project: string | undefined) {
  return project === undefined
    ? 'permissions:saved'
    : `permissions:saved:${projectId(project)}`
}

async function readSaved(metadata: MetadataStore, key: string) {
  const stored = await metadata.get(METADATA_NAMESPACE, key)
  return Array.isArray(stored) ? stored.filter(isSavedRule) : []
}

function isSameRule(a: PermissionRule, b: PermissionRule) {
  return (
    a.tool === b.tool &&
    a.resource === b.resource &&
    a.decision === b.decision &&
    a.kind === b.kind
  )
}

/**
 * The rules that `always` answers saved for `project`, in the saved order.
 * `project` is the `root` of `permissions()`. `stores` is the persistence
 * of the host, for example `persistence.stores`. Without a metadata store,
 * it resolves to an empty list.
 */
export async function listSavedPermissions(
  stores: { metadata?: MetadataStore },
  project: string | undefined,
) {
  return stores.metadata ? readSaved(stores.metadata, savedKeyOf(project)) : []
}

/**
 * Delete one saved rule of `project`. The rule matches by its fields, as
 * `listSavedPermissions` gives them. An unknown rule does nothing. New
 * sessions stop using the rule. Open sessions can keep it until they open
 * again.
 */
export async function deleteSavedPermission(
  stores: { metadata?: MetadataStore },
  project: string | undefined,
  rule: PermissionRule,
) {
  const { metadata } = stores
  if (!metadata) return
  const key = savedKeyOf(project)
  const rules = await readSaved(metadata, key)
  const index = rules.findIndex((saved) => isSameRule(saved, rule))
  if (index === -1) return
  rules.splice(index, 1)
  await metadata.set(METADATA_NAMESPACE, key, rules)
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
    provides: [PermissionDecisionCapability, PermissionPrompt],
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
      const savedKey = savedKeyOf(root)
      // Answers saved in this session. Runs without a metadata store use them.
      const memory: Array<PermissionRule> = []
      const loadSaved = async (metadata: MetadataStore | undefined) => {
        const rules = metadata ? await readSaved(metadata, savedKey) : []
        return [...rules, ...memory]
      }
      // ponytail: get + set, a parallel save can drop a rule. It then asks again.
      const save = async (
        metadata: MetadataStore | undefined,
        rules: ReadonlyArray<PermissionRule>,
      ) => {
        memory.push(...rules)
        if (!metadata || rules.length === 0) return
        const current = await readSaved(metadata, savedKey)
        await metadata.set(METADATA_NAMESPACE, savedKey, [...current, ...rules])
      }
      // The session's store, for commands. A chat run reads its own.
      const sessionMetadata = ctx.getOptional(SessionMetadata)
      const savedRules = async () =>
        sessionMetadata ? readSaved(sessionMetadata, savedKey) : [...memory]
      const forget = async (arg: string) => {
        const rules = await savedRules()
        const rule = /^\d+$/.test(arg) ? rules[Number(arg) - 1] : undefined
        if (!rule) {
          return `No saved rule ${arg}. Run /permissions to see the list.`
        }
        await deleteSavedPermission({ metadata: sessionMetadata }, root, rule)
        // This session stops using the rule at once.
        const kept = memory.filter((saved) => !isSameRule(saved, rule))
        memory.splice(0, memory.length, ...kept)
        return `Forgot rule ${arg}: ${describeRule(rule)}.`
      }
      const resourcesOf = (tool: string, input: unknown) => {
        const entry = declared.findLast((item) => Object.hasOwn(item, tool))?.[
          tool
        ]
        if (!entry) return undefined
        const resources = {
          paths: entry.paths?.(input) ?? [],
          commands: entry.commands?.(input) ?? [],
        }
        const values = [...resources.paths, ...resources.commands]
        if (!values.every((value) => typeof value === 'string')) {
          throw new Error('A resource is not a string.')
        }
        return resources
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
          ...(resources.paths ?? []).map(
            (path) => pathResource(path, root).match,
          ),
          ...(resources.commands ?? [])
            .filter((part) => !isUnsplittableCommand(part))
            .map((part) => part.trim()),
        ]
        // A `*` or `?` would turn the saved rule into a wider glob.
        return values
          .filter((value) => !/[*?]/.test(value))
          .map((resource) => ({ tool, resource, decision: 'allow' as const }))
      }
      const decide = async (
        tool: string,
        input: unknown,
        current: PermissionMode,
        metadata: MetadataStore | undefined,
      ) => {
        const resources = resourcesOf(tool, input)
        const settings = { fallback: options.default, resources, root }
        const rules = configured()
        // A saved answer turns an ask into an allow. It never beats a deny.
        if (decidePermission(rules, tool, current, settings) === 'deny') {
          return { decision: 'deny' as const, resources }
        }
        rules.push(...(await loadSaved(metadata)))
        const decision = decidePermission(rules, tool, current, settings)
        return { decision, resources }
      }
      /** Ask the user. An `always` answer saves the rules for the call. */
      const askUser = async (
        message: string,
        tool: string,
        resources: CallResources | undefined,
        metadata: MetadataStore | undefined,
      ) => {
        const reply = readAnswer(
          await ctx.session.ask({
            message: `${message} Answer once, always, or reject.`,
            schema: ANSWER_SCHEMA,
          }),
        )
        if (reply.choice === 'always') {
          await save(metadata, rulesToSave(tool, resources))
        }
        return reply
      }
      ctx.provide(PermissionPrompt, async (tool, message) => {
        const { decision } = await decide(
          tool,
          undefined,
          mode(),
          sessionMetadata,
        )
        if (decision !== 'ask') return decision === 'allow'
        const reply = await askUser(message, tool, undefined, sessionMetadata)
        return reply.choice !== 'reject'
      })
      const check = {
        name: 'tanstack/permissions',
        onBeforeToolCall: async (run, hook) => {
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
            return refuse(`This tool is not allowed in ${current} mode.`)
          }
          const preview = JSON.stringify(hook.args ?? {}).slice(0, 300)
          const reply = await askUser(
            `Allow ${hook.toolName} ${preview}?`,
            hook.toolName,
            resources,
            metadata,
          )
          if (reply.choice === 'reject') {
            return refuse(reply.message ?? 'The user denied this tool call.')
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
            text: () => (mode() === 'plan' ? PLAN_PROMPT : ''),
          },
        ],
        commands: {
          mode: defineCommand({
            description: `Show or switch the mode (${PERMISSION_MODES.join(', ')})`,
            run: async (input: unknown) => {
              const next = typeof input === 'string' ? input.trim() : ''
              if (!next) return `Mode: ${mode()}.`
              const receipt = await ctx.session.setConfig('mode', next)
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
        // The lead turn and every agent run check the same rules. Each run
        // gets only one of the two lists, so a call is checked once.
        middleware: [check],
        agentMiddleware: [check],
      }
    },
  })
}
