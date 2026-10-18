import { BackgroundJobs, SessionSignal, definePlugin } from '../../plugins'
import {
  PERMISSION_MODES,
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
} from '../permissions'
import { WorkspaceHooks } from '../workspace-hooks'
import { hostBackend, optionalString, pathsOf, stringArg } from './backend'
import { bashResources, bashTools } from './bash'
import { editTools } from './edit'
import { patchPaths, patchTools } from './patch'
import { readTools } from './read'
import { searchTools } from './search'
import { webTools } from './web'
import type { AnyTool } from '@tanstack/ai'
import type {
  CallResources,
  PermissionDecision,
  ToolResources,
} from '../permissions'
import type { ToolEnv, WorkspaceBackend } from './backend'
import type { WebToolsOptions } from './web'

export interface WorkspaceToolsOptions {
  root: string
  bashTimeoutMs?: number
  /**
   * A path outside `root`. `'deny'` (default) refuses it. `'ask'` makes the
   * call ask for approval through `permissions()`, before the call runs,
   * like a path outside its `root`. An `always` answer saves an allow rule
   * for the path. The `bypass` mode allows it without a question. Without
   * `permissions()`, nobody can approve it, so it is refused.
   */
  outside?: 'deny' | 'ask'
  /** Where the files are and commands run. Default: {@link hostBackend}. */
  backend?: WorkspaceBackend
  /**
   * The tools that change files. `'auto'` (default): GPT models (an id that
   * starts with `gpt-`, or `o` and a digit, like `o3`) get `patch` and no
   * `edit_file`. Other models get `edit_file` and `write_file`, and no
   * `patch`. `'edit'` or `'patch'` gives that style to every model.
   */
  editStyle?: 'auto' | 'edit' | 'patch'
  /**
   * The web tools. Default: on, with `webfetch`. Pass `search` to add
   * `websearch`. `false` adds no web tools.
   */
  web?: false | WebToolsOptions
  /**
   * When `bash` gives the model only the end of the output, it saves the
   * full output in this folder. Relative to `root`, or absolute.
   */
  spillDir?: string
}

/** What the tools need from the session for the permission rules. */
export interface OutsideAccess {
  /** The permission mode of the session, for example `'bypass'`. */
  mode: () => unknown
  /**
   * The working folder of the thread, from `root` (the `cwd` setting of
   * `session.configure`). Relative paths start there. Read at each call.
   */
  cwd?: () => string | undefined
  /**
   * What `permissions()` decides in the current mode for a call of a tool
   * that touches `resources`, or `undefined` without `permissions()`. Read
   * at each call.
   */
  rules?: () =>
    | ((tool: string, resources: CallResources) => PermissionDecision)
    | undefined
}

/** A Windows network path (`\\server\share`). Not `\\?\` or `\\.\`. */
const isUnc = (path: string) => /^[\\/]{2}[^\\/?.]/.test(path)

/** Is `full` the folder `dir`, or a path in it? `sep` is the separator. */
function within(dir: string, full: string, sep: string) {
  return full === dir || full.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

/** A lock per path: work on one path runs one at a time, in order. */
function createLock() {
  const queues = new Map<string, Promise<unknown>>()
  return <T>(path: string, fn: () => Promise<T>) => {
    const result = (queues.get(path) ?? Promise.resolve()).then(fn)
    const settled = result.then(
      () => undefined,
      () => undefined,
    )
    queues.set(path, settled)
    void settled.then(() => {
      if (queues.get(path) === settled) queues.delete(path)
    })
    return result
  }
}

/**
 * Does `editStyle: 'auto'` give `model` the `patch` tool? GPT models do:
 * `gpt-` ids and the `o` series, like `o3`.
 */
function prefersPatch(model: string) {
  // A gateway id can name the provider first, like `openai/gpt-5`.
  const id = model.slice(model.lastIndexOf('/') + 1)
  return /^(gpt-|o\d)/i.test(id)
}

/**
 * The tools of {@link workspaceTools} for one session, and what each call
 * touches for `PermissionResources`: the paths a call names, their real
 * paths, and the real paths outside the workspace. `permissions()` decides
 * them before the call runs, so no tool asks while it runs. `access` gives
 * the rules and the mode. `hooks` are the hooks that plugins added. `note`
 * tells the model that a background `bash` job ended, and `signal` kills
 * the jobs that still run.
 */
export function createWorkspaceTools(
  options: WorkspaceToolsOptions,
  session: {
    access?: OutsideAccess
    hooks?: () => ReadonlyArray<WorkspaceHooks>
    note?: (text: string) => Promise<void>
    signal?: AbortSignal
    jobs?: { started: (jobId: string) => void; ended: (jobId: string) => void }
  } = {},
) {
  const backend = options.backend ?? hostBackend
  const paths = pathsOf(backend)
  const root = paths.resolve(options.root)
  const { access } = session
  /** The working folder: `root`, or the thread's `cwd` in it. */
  const here = () => {
    const cwd = access?.cwd?.()
    return cwd ? paths.resolve(root, cwd) : root
  }

  /**
   * The real path of `full`, with every link resolved. For a path that is
   * not there yet: the real path of the nearest parent that is there, plus
   * the rest. A link to a missing target throws.
   */
  const realPath = async (full: string) => {
    const rest: Array<string> = []
    let head = full
    for (;;) {
      const real = backend.realpath ? await backend.realpath(head) : head
      if (real !== undefined) return paths.join(real, ...rest)
      const parent = paths.dirname(head)
      // Not even the top folder is there.
      if (parent === head) return full
      rest.unshift(paths.basename(head))
      head = parent
    }
  }

  // ponytail: the real path of the root is read once, when the root is there.
  // A root that turns into a link later is not seen.
  let knownRoot: string | undefined
  /** The real path of `root`. */
  const realRoot = async () => {
    if (knownRoot !== undefined) return knownRoot
    const real = backend.realpath ? await backend.realpath(root) : root
    if (real === undefined) return realPath(root)
    knownRoot = real
    return real
  }

  /**
   * `real`, a real path, as the permission rules see it. In the real root,
   * it is a path in `root`, so a root that is a link (like `/tmp` on macOS)
   * does not move every path outside.
   */
  const forRules = async (real: string) => {
    const rootReal = await realRoot()
    return within(rootReal, real, paths.sep)
      ? paths.join(root, paths.relative(rootReal, real))
      : real
  }

  const shown = (full: string) =>
    (within(root, full, paths.sep) ? paths.relative(root, full) || '.' : full)
      .split(paths.sep)
      .join('/')

  /**
   * Where `full` really is: its real path as the rules see it, and if it is
   * outside the workspace. A UNC path of another server is outside, with no
   * real path: `realpath` on it connects to its server, and Windows can
   * send the user's credentials.
   */
  const locate = async (full: string) => {
    if (isUnc(full) && !isUnc(root)) return { real: full, isOutside: true }
    const real = await realPath(full)
    const isOutside = !within(await realRoot(), real, paths.sep)
    return { real: isOutside ? real : await forRules(real), isOutside }
  }

  /**
   * What a call that names `named` touches, for the rules: each path and
   * its real path, so a link to a path with a stricter rule (like `notes`
   * to `.env`) gets that rule too. With `outside: 'ask'`, the real paths
   * outside the workspace ask. The rules decide them before the call runs.
   */
  const touched = async (named: ReadonlyArray<string>) => {
    const fulls = named.map((path) => paths.resolve(here(), path))
    const located = await Promise.all(fulls.map(locate))
    const reals = located.map(({ real }) => real)
    return {
      paths: [...new Set([...fulls, ...reals])],
      outside:
        options.outside === 'ask'
          ? located.flatMap(({ real, isOutside }) => (isOutside ? [real] : []))
          : [],
    }
  }
  const touches = (named: (input: unknown) => ReadonlyArray<string>) => {
    // One read of the paths for each call input, for both fields.
    const seen = new WeakMap<object, ReturnType<typeof touched>>()
    const of = (input: unknown) => {
      const key = typeof input === 'object' && input !== null ? input : null
      const found = key ? seen.get(key) : undefined
      if (found) return found
      const result = touched(named(input))
      if (key) seen.set(key, result)
      return result
    }
    return {
      paths: async (input: unknown) => (await of(input)).paths,
      outside: async (input: unknown) => (await of(input)).outside,
    } satisfies ToolResources
  }
  const file = (input: unknown) => [stringArg(input, 'path')]
  const folder = (input: unknown) => [optionalString(input, 'path') ?? '.']
  const resources: Record<string, ToolResources> = {
    read_file: touches(file),
    write_file: touches(file),
    edit_file: touches(file),
    list_files: touches(folder),
    grep: touches(folder),
    patch: touches((input) => patchPaths(stringArg(input, 'patch'))),
    bash: { commands: bashResources },
  }

  /**
   * Throws when the call must not use `full` at `real`. The rules decided
   * the call before it ran, with the real paths (see `touched`), so a call
   * that runs was allowed or approved. The check runs again here, on the
   * paths as they are now: a deny refuses, and so does a path outside the
   * workspace that nobody can approve.
   */
  const check = (
    path: string,
    tool: string,
    full: string,
    { real, isOutside }: Awaited<ReturnType<typeof locate>>,
  ) => {
    const decide = access?.rules?.()
    if (isOutside) {
      const canAsk = options.outside === 'ask' && access
      const isBypass = access?.mode() === 'bypass'
      if (!canAsk || (!decide && !isBypass)) {
        throw new Error(`Path "${path}" is outside the workspace.`)
      }
    }
    // `bash` touches commands. Its rules do not match paths.
    if (!decide || !resources[tool]?.paths) return
    const decision = decide(tool, {
      paths: [...new Set([full, real])],
      outside: isOutside ? [real] : [],
    })
    if (decision !== 'deny') return
    throw new Error(
      paths.relative(full, real) === ''
        ? `The permission rules do not allow ${tool} on ${shown(real)}.`
        : `The permission rules do not allow ${tool} on ${shown(real)}, the real path of ${path}.`,
    )
  }

  // The boundary check uses real paths, so a link inside the workspace that
  // leads out of it counts as outside.
  const reach: ToolEnv['reach'] = async (path, tool) => {
    const full = paths.resolve(here(), path)
    check(path, tool, full, await locate(full))
    return full
  }

  const env: ToolEnv = {
    backend,
    root,
    hooks: session.hooks ?? (() => []),
    // ponytail: one lock per session. Sessions on one folder do not wait
    // for each other.
    lock: createLock(),
    reach,
    shown,
    protectedIn: async (dir) => {
      const decide = access?.rules?.()
      if (!decide) return undefined
      // rg and the other engines do not follow links in `dir`. So only `dir`
      // itself can be a link, and its real path covers the files in it.
      const real = await forRules(await realPath(dir))
      return (path) =>
        decide('read_file', {
          paths: [paths.resolve(dir, path), paths.resolve(real, path)],
        }) !== 'allow'
    },
  }
  const tools = [
    ...readTools(env),
    ...editTools(env),
    ...patchTools(env),
    ...searchTools(env),
    ...bashTools(env, {
      timeoutMs: options.bashTimeoutMs,
      note: session.note,
      spillDir: options.spillDir,
      signal: session.signal,
      jobs: session.jobs,
    }),
    ...(options.web === false ? [] : webTools(options.web)),
  ]

  const prompt =
    options.outside === 'ask'
      ? `Your workspace is ${root}. Paths are relative to it. A path outside it needs the approval of the user.`
      : `Your workspace is ${root}. Paths are relative to it.`
  return { tools, prompt, resources }
}

/**
 * `tools` with the edit tools of `editStyle` for `model`: without
 * `edit_file` for the patch style, else without `patch`.
 */
function withEditStyle(
  tools: ReadonlyArray<AnyTool>,
  editStyle: NonNullable<WorkspaceToolsOptions['editStyle']>,
  model: string,
) {
  const usesPatch =
    editStyle === 'patch' || (editStyle === 'auto' && prefersPatch(model))
  const hidden = usesPatch ? 'edit_file' : 'patch'
  return tools.filter((tool) => tool.name !== hidden)
}

/**
 * File, shell, and web tools for a coding agent, in `root`: `read_file`,
 * `write_file`, `edit_file` or `patch` (see `editStyle`), `list_files`,
 * `grep`, `bash`, `webfetch`, and `websearch` with a search provider. Edits,
 * `bash`, and `webfetch` ask for approval through `permissions()`, and each
 * call tells the permission rules which paths or commands it touches,
 * before the call runs. A path outside `root` is refused, or with
 * `outside: 'ask'` it needs an approval. A link that leads out of `root`
 * counts as outside, and the rules see the real path of a link. Other
 * plugins add {@link WorkspaceHooks} to run code after a read or a write.
 *
 * The tools use `backend` for files and commands. The default,
 * `hostBackend`, runs on this machine with the host's authority. Use a
 * sandbox backend for code you do not trust.
 *
 * @example
 * ```ts
 * workspaceTools({ root: process.cwd(), outside: 'ask' })
 * ```
 */
export function workspaceTools(options: WorkspaceToolsOptions) {
  return definePlugin({
    name: 'tanstack/workspace-tools',
    optionalRequires: [PermissionDecisionCapability],
    setup: (ctx) => {
      const hooks = ctx.collect(WorkspaceHooks)
      // The working folder is the thread's `cwd` setting, read at each call.
      const cwd = () => ctx.session.settings().cwd
      const { tools, prompt, resources } = createWorkspaceTools(options, {
        access: {
          mode: () => ctx.config.get('mode'),
          cwd,
          // Read at each call, so permissions() can come after this plugin.
          rules: () => {
            const decide = ctx.getOptional(PermissionDecisionCapability)
            if (!decide) return undefined
            const value = ctx.config.get('mode')
            const mode =
              PERMISSION_MODES.find((each) => each === value) ?? 'default'
            return (tool, resources) => decide(tool, mode, resources)
          },
        },
        hooks: () => hooks,
        // ponytail: D9, PR 7 rebuilds ask and note. The wake turn runs as the
        // sender of the running turn, not as the user of the job's turn.
        note: (text) => ctx.session.note(text, { wake: true }),
        // Kills the background `bash` jobs when the session closes. A reload
        // keeps them. Without a session, the plugin cleanup kills them.
        signal: ctx.getOptional(SessionSignal) ?? ctx.resources.signal,
        jobs: ctx.getOptional(BackgroundJobs),
      })
      const paths = pathsOf(options.backend ?? hostBackend)
      const folder = () => {
        const dir = cwd()
        return dir
          ? ` The working folder of this thread is ${paths.resolve(options.root, dir)}. Relative paths start there.`
          : ''
      }
      return {
        tools,
        prompts: [() => prompt + folder()],
        prepareTools: (turn) =>
          withEditStyle(turn.tools, options.editStyle ?? 'auto', turn.model),
        contribute: [
          PermissionRules.item({
            tool: 'read_file',
            decision: 'allow',
            kind: 'read',
          }),
          PermissionRules.item({
            tool: 'list_files',
            decision: 'allow',
            kind: 'read',
          }),
          PermissionRules.item({
            tool: 'grep',
            decision: 'allow',
            kind: 'read',
          }),
          PermissionRules.item({
            tool: 'write_file',
            decision: 'ask',
            kind: 'edit',
          }),
          PermissionRules.item({
            tool: 'edit_file',
            decision: 'ask',
            kind: 'edit',
          }),
          PermissionRules.item({
            tool: 'patch',
            decision: 'ask',
            kind: 'edit',
          }),
          PermissionRules.item({
            tool: 'bash',
            decision: 'ask',
            kind: 'execute',
          }),
          // webfetch sends a request to a URL that the model picks, so it
          // asks. A user rule can allow it. websearch stays allowed.
          ...(options.web === false
            ? []
            : [PermissionRules.item({ tool: 'webfetch', decision: 'ask' })]),
          PermissionResources.item(resources),
        ],
      }
    },
  })
}
