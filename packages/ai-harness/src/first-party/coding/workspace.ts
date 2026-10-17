import { AsyncLocalStorage } from 'node:async_hooks'
import { BackgroundJobs, SessionSignal, definePlugin } from '../../plugins'
import { isRecord } from '../../utils'
import {
  PERMISSION_MODES,
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
} from '../permissions'
import { WorkspaceHooks } from '../workspace-hooks'
import { hostBackend, optionalString, pathsOf, stringArg } from './backend'
import { bashResources, bashTools } from './bash'
import { editTools, fileVersions } from './edit'
import { patchPaths, patchTools } from './patch'
import { readTools } from './read'
import { searchTools } from './search'
import { webTools } from './web'
import type { AnyTool, ToolExecutionContext } from '@tanstack/ai'
import type { PluginEvent } from '../../extensions'
import type { RunContext } from '../../types'
import type { PermissionDecision, ToolResources } from '../permissions'
import type { BoundWorkspace, ToolEnv, WorkspaceBackend } from './backend'
import type { WebToolsOptions } from './web'

/** True for `true`, `y`, or `yes` (any case). */
function isYes(answer: unknown) {
  return answer === true || /^y(es)?$/i.test(String(answer).trim())
}

/** Gives the workspace of each thread. */
export interface WorkspaceBinder {
  /**
   * The workspace of the thread of `run`: a backend and its `root`. The
   * tools call it once for each thread, before the first turn or at the
   * first tool call, and keep the result. When it throws, the next turn or
   * tool call calls it again.
   */
  bind: (input: { run: RunContext }) => Promise<BoundWorkspace>
}

/** Where the workspace is: one folder for every thread, or one per thread. */
type WorkspaceSource =
  | {
      /** The workspace folder of every thread. */
      root: string
      /** Where the files are and commands run. Default: {@link hostBackend}. */
      backend?: WorkspaceBackend
      workspace?: undefined
    }
  | {
      /** Gives the workspace of each thread. Its `root` is the boundary. */
      workspace: WorkspaceBinder
      root?: undefined
      backend?: undefined
    }

export type WorkspaceToolsOptions = WorkspaceSource & {
  bashTimeoutMs?: number
  /**
   * A path outside `root`. `'deny'` (default) refuses it. `'ask'` asks the
   * user first, and a yes allows that folder, and the folders in it, for the
   * rest of the session. The `bypass` mode of `permissions()` allows it
   * without a question.
   */
  outside?: 'deny' | 'ask'
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
  /** How many background jobs can run at a time in a session. Default 8. */
  maxJobs?: number
}

/** What the tools need from the session for a path outside the workspace. */
export interface OutsideAccess {
  /** Ask the user a question, and resolve with the answer. */
  ask: (message: string) => Promise<unknown>
  /** The permission mode of the session, for example `'bypass'`. */
  mode: () => unknown
  /**
   * The working folder of the thread, from `root` (the `cwd` setting of
   * `session.configure`). Relative paths start there. Read at each call. A
   * folder outside the workspace is refused.
   */
  cwd?: () => string | undefined
  /**
   * What `permissions()` decides in the current mode for a call of a tool
   * that touches `paths`, or `undefined` without `permissions()`. Read at
   * each call.
   */
  rules?: () =>
    | ((tool: string, paths: ReadonlyArray<string>) => PermissionDecision)
    | undefined
}

/** What the tools get from the session. */
interface SessionAccess {
  access?: OutsideAccess
  hooks?: () => ReadonlyArray<WorkspaceHooks>
  note?: (text: string) => Promise<void>
  signal?: AbortSignal
  jobs?: { started: (jobId: string) => void; ended: (jobId: string) => void }
  /** Sends the events of the background `bash` jobs. */
  emit?: <T>(event: PluginEvent<T>, value: T) => void
}

/** A Windows network path (`\\server\share`). Not `\\?\` or `\\.\`. */
const isUnc = (path: string) => /^[\\/]{2}[^\\/?.]/.test(path)

/** An absolute path in any style: `/a`, `\a`, or `C:/a`. */
const isAbsolutePath = (path: string) => /^([a-z]:)?[\\/]/i.test(path)

/** Is `full` the folder `dir`, or a path in it? `sep` is the separator. */
function within(dir: string, full: string, sep: string) {
  return full === dir || full.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

/** A lock per key: work on one key runs one at a time, in order. */
export function createLock() {
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
 * The file locks of this process, by the bound workspace root and the real
 * path of the file. Every session and agent on one workspace shares them, so
 * two edits of one file run one after the other.
 *
 * ponytail: a lock is for this process only. Two processes or machines on
 * one shared sandbox do not wait for each other. The unchanged check of the
 * edit tools then fails the second write, so no edit is lost.
 */
const fileLocks = createLock()

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
 * True for the run context that the harness gives a tool call. It checks the
 * fields that the tools read. The harness sets the others.
 */
function isRun(value: unknown): value is RunContext {
  return (
    isRecord(value) &&
    typeof value.logId === 'string' &&
    typeof value.threadId === 'string'
  )
}

/**
 * The run of a tool call or a middleware call: `ctx.context.run`, or
 * `undefined` without one.
 */
export function runOf(context: unknown) {
  if (!isRecord(context) || !isRecord(context.context)) return undefined
  const { run } = context.context
  return isRun(run) ? run : undefined
}

/** The run of the workspace tool call that runs now. */
const callRuns = new AsyncLocalStorage<RunContext | undefined>()

/**
 * The run of the workspace tool call that runs now, or `undefined` outside
 * a call. A `WorkspaceHooks` hook reads it to know which run wrote a file.
 */
export function writingRun() {
  return callRuns.getStore()
}

/**
 * The tools for one workspace: `backend`, with the boundary `root`. Each
 * call gets the paths through `reach`, which resolves every link, and works
 * on the resolved path under `lock`.
 */
function bindTools(
  workspace: { backend: WorkspaceBackend; root: string },
  options: WorkspaceToolsOptions,
  session: SessionAccess,
) {
  const { backend } = workspace
  const paths = pathsOf(backend)
  const root = paths.resolve(workspace.root)
  const { access } = session
  // The real outside folders the user allowed in this session, and the
  // questions that wait for an answer, by folder, so parallel calls ask once.
  const allowed: Array<string> = []
  const asking = new Map<string, Promise<boolean>>()
  /** The working folder: `root`, or the thread's `cwd` in it. */
  const here = () => {
    const cwd = access?.cwd?.()
    if (!cwd) return root
    const folder = paths.resolve(root, cwd)
    if (!within(root, folder, paths.sep)) {
      throw new Error(`The working folder ${cwd} is outside the workspace.`)
    }
    return folder
  }

  /** Ask once about `folder`. A yes allows it for the session. */
  const allow = (folder: string, message: string) => {
    let answer = asking.get(folder)
    if (!answer) {
      answer = Promise.resolve(access?.ask(message)).then((reply) => {
        asking.delete(folder)
        if (isYes(reply)) allowed.push(folder)
        return isYes(reply)
      })
      asking.set(folder, answer)
    }
    return answer
  }

  /**
   * `backend.realpath`. A backend from JavaScript can lack it. Then no path
   * can be checked for links, so every call fails.
   */
  const realpathOf = (path: string) => {
    // ponytail: the type needs `realpath`. This check is for JavaScript.
    if (typeof backend.realpath !== 'function') {
      throw new Error(
        'The workspace backend has no realpath, so the tools cannot check links.',
      )
    }
    return backend.realpath(path)
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
      const real = await realpathOf(head)
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
    const real = await realpathOf(root)
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

  /** `full` with every link resolved, as a path in `root` when it is in it. */
  const resolved = async (full: string) => forRules(await realPath(full))

  const shown = (full: string) =>
    (within(root, full, paths.sep) ? paths.relative(root, full) || '.' : full)
      .split(paths.sep)
      .join('/')

  /**
   * The rules see the path that the call names. A link can lead to a path
   * with a stricter rule, like `notes` to `.env`. So the rules check the
   * real path too, and the strictest decision wins.
   */
  const checkRealPath = async (
    path: string,
    tool: string,
    full: string,
    real: string,
  ) => {
    const decide = access?.rules?.()
    // `bash` touches commands. Its rules do not match paths.
    if (!access || !decide || !PATH_TOOLS.has(tool)) return
    if (paths.relative(full, real) === '') return
    // `permissions()` checked `full` before the call. Act only when the
    // real path makes the decision stricter.
    const decision = decide(tool, [full, real])
    if (decision === decide(tool, [full])) return
    if (decision === 'deny') {
      throw new Error(
        `The permission rules do not allow ${tool} on ${shown(real)}, the real path of ${path}.`,
      )
    }
    const reply = await access.ask(
      `${path} is a link to ${shown(real)}. The permission rules ask before ${tool} uses ${shown(real)}. Allow it? (y/n)`,
    )
    if (!isYes(reply)) {
      throw new Error(
        `The user did not allow ${tool} on ${shown(real)}, the real path of ${path}.`,
      )
    }
  }

  /** Throws when the user or the options do not allow `real`, outside. */
  const allowOutside = async (
    path: string,
    tool: string,
    kind: 'file' | 'folder',
    full: string,
    real: string,
  ) => {
    if (options.outside !== 'ask' || !access) {
      throw new Error(`Path "${path}" is outside the workspace.`)
    }
    if (access.mode() === 'bypass') return
    const dir = kind === 'folder' ? real : paths.dirname(real)
    const yes = await allow(
      dir,
      `${tool} wants ${real}, outside the workspace (${root}). Allow ${dir} for this session? (y/n)`,
    )
    if (!yes) {
      throw new Error(
        `The user did not allow ${full}. It is outside the workspace.`,
      )
    }
  }

  // The boundary check uses real paths, so a link inside the workspace that
  // leads out of it counts as outside. The tools work on the resolved path.
  const reach: ToolEnv['reach'] = async (path, tool, kind) => {
    const full = paths.resolve(here(), path)
    // `realpath` on a UNC path connects to its server, and Windows can send
    // the user's credentials. So the boundary check runs first.
    if (isUnc(full) && !isUnc(root)) {
      await allowOutside(path, tool, kind, full, full)
    }
    const real = await realPath(full)
    const folders = [await realRoot(), ...allowed]
    const isAllowed = folders.some((dir) => within(dir, real, paths.sep))
    if (!isAllowed) await allowOutside(path, tool, kind, full, real)
    const inRoot = await forRules(real)
    await checkRealPath(path, tool, full, inRoot)
    return inRoot
  }

  const env: ToolEnv = {
    backend,
    root,
    hooks: session.hooks ?? (() => []),
    // `path` is the real path from `reach`. The key has the root, so the
    // fixed lock order of `patch` (by path) is the same for every session on
    // this root.
    lock: (path, fn) =>
      fileLocks(`${root}\0${path}`, async () => {
        // `reach` checked `path` before the lock. A link made since then
        // would move the work to another file, so check it again here.
        const now = await resolved(path)
        if (now !== path) {
          throw new Error(
            `${shown(path)} changed while the tool ran: it now leads to ${shown(now)}. Try again.`,
          )
        }
        return fn()
      }),
    reach,
    shown,
    protectedIn: async (dir) => {
      const decide = access?.rules?.()
      if (!decide) return undefined
      // rg and the other engines do not follow links in `dir`. So only `dir`
      // itself can be a link, and its real path covers the files in it.
      const real = await resolved(dir)
      return (path) =>
        decide('read_file', [
          paths.resolve(dir, path),
          paths.resolve(real, path),
        ]) !== 'allow'
    },
  }
  // What this binding read and wrote, so a write fails when the file changed
  // since then.
  const versions = fileVersions(env)
  // `read_file` reads under the lock. Its lock also remembers the file, as
  // the read sees it.
  const readEnv: ToolEnv = {
    ...env,
    lock: (path, fn) =>
      env.lock(path, async () => {
        await versions.saw(path)
        return fn()
      }),
  }
  const tools = [
    ...readTools(readEnv),
    ...editTools(env, versions),
    ...patchTools(env, versions),
    ...searchTools(env),
    ...bashTools(env, {
      timeoutMs: options.bashTimeoutMs,
      note: session.note,
      spillDir: options.spillDir,
      signal: session.signal,
      jobs: session.jobs,
      emit: session.emit,
      maxJobs: options.maxJobs,
    }),
    ...(options.web === false ? [] : webTools(options.web)),
  ]

  const intro =
    options.outside === 'ask'
      ? `Your workspace is ${root}. Paths are relative to it. A path outside it asks the user first.`
      : `Your workspace is ${root}. Paths are relative to it.`
  /** The prompt, with the working folder of the thread when it has one. */
  const prompt = () => {
    const cwd = access?.cwd?.()
    return cwd
      ? `${intro} The working folder of this thread is ${paths.resolve(root, cwd)}. Relative paths start there.`
      : intro
  }
  return {
    tools,
    prompt,
    /** `path` as a full path, from the working folder. */
    fromHere: (path: string) => paths.resolve(here(), path),
  }
}

/** The tools whose rules match paths. `bash` rules match commands. */
const PATH_TOOLS = new Set([
  'read_file',
  'write_file',
  'edit_file',
  'list_files',
  'grep',
  'patch',
])

/** The tools of one workspace, from {@link bindTools}. */
type BoundTools = ReturnType<typeof bindTools>

/**
 * The tools for the workspace of each thread, from `binder`. A tool call
 * reads its run from `ctx.context.run`, and works in the workspace of that
 * thread. The first call of a thread binds it. The calls after it reuse
 * that workspace.
 */
function threadTools(
  binder: WorkspaceBinder,
  options: WorkspaceToolsOptions,
  session: SessionAccess,
) {
  // By the log and the thread of the run.
  const bindings = new Map<string, Promise<BoundTools>>()
  const bound = new Map<string, BoundTools>()
  const keyOf = (run: RunContext) => `${run.logId}\0${run.threadId}`
  // The workspaces that `bind` gave. They belong to the tools, so the tools
  // close them when the session ends. A fixed `backend` option belongs to
  // the caller and is never closed here.
  const workspaces = new Set<BoundWorkspace>()
  session.signal?.addEventListener(
    'abort',
    () => {
      for (const workspace of workspaces) {
        void workspace.close?.({ reason: 'closed' }).catch(() => undefined)
      }
    },
    { once: true },
  )

  /** The tools of the workspace of `run`. */
  const bind = (run: RunContext | undefined) => {
    if (!run) {
      throw new Error(
        'workspace.bind needs the run of the tool call. Call the tool in a harness session.',
      )
    }
    const key = keyOf(run)
    const known = bindings.get(key)
    if (known) return known
    const binding = binder.bind({ run }).then((workspace) => {
      workspaces.add(workspace)
      const tools = bindTools(
        { backend: workspace, root: workspace.root },
        options,
        session,
      )
      bound.set(key, tools)
      return tools
    })
    // A failed bind is not kept, so the next call tries again.
    binding.catch(() => {
      if (bindings.get(key) === binding) bindings.delete(key)
    })
    bindings.set(key, binding)
    return binding
  }

  // These tools have the names and schemas of the tools of a workspace, and
  // call the tools of the workspace of each call. Their own workspace is a
  // placeholder: they never use it.
  const templates = bindTools(
    { backend: hostBackend, root: '/' },
    options,
    {},
  ).tools
  const tools = templates.map((template): AnyTool => {
    const execute = async (args: unknown, context?: ToolExecutionContext) => {
      const own = await bind(runOf(context))
      const tool = own.tools.find((each) => each.name === template.name)
      if (!tool?.execute) throw new Error(`No tool ${template.name}.`)
      return tool.execute(args, context)
    }
    return { ...template, execute }
  })

  /** The prompt of the workspace of `run`, once it is bound. */
  const prompt = (run: RunContext | undefined) => {
    const own = run && bound.get(keyOf(run))
    return own
      ? own.prompt()
      : 'Paths are relative to the workspace. It is not ready yet.'
  }
  /**
   * The root is not known before the call, so a relative path stays
   * relative, from the working folder. `permissions()` reads it from its own
   * `root`.
   */
  const fromHere = (path: string) => {
    const cwd = session.access?.cwd?.()
    return cwd && !isAbsolutePath(path) ? `${cwd}/${path}` : path
  }
  return { tools, prompt, bind, fromHere }
}

/**
 * The tools of {@link workspaceTools} for one session, and what each call
 * touches for `PermissionResources`. `access` asks the user about a path
 * outside the workspace when `options.outside` is `'ask'`. `hooks` are the
 * hooks that plugins added. `note` tells the model that a background `bash`
 * job ended, and `signal` kills the jobs that still run.
 *
 * With `options.workspace`, each tool call works in the workspace of its
 * thread. `bind(run)` binds the thread of `run`, and `prompt(run)` gives the
 * prompt of its workspace.
 */
export function createWorkspaceTools(
  options: WorkspaceToolsOptions,
  session: SessionAccess = {},
) {
  const source =
    options.workspace === undefined
      ? fixedTools(options.root, options, session)
      : threadTools(options.workspace, options, session)
  const { fromHere } = source
  // What each call touches, as the tool resolves it, for the permission
  // rules with a `resource`.
  const file = (input: unknown) => [fromHere(stringArg(input, 'path'))]
  const folder = (input: unknown) => [
    fromHere(optionalString(input, 'path') ?? '.'),
  ]
  const resources: Record<string, ToolResources> = {
    read_file: { paths: file },
    write_file: { paths: file },
    edit_file: { paths: file },
    list_files: { paths: folder },
    grep: { paths: folder },
    patch: {
      paths: (input) => patchPaths(stringArg(input, 'patch')).map(fromHere),
    },
    bash: { commands: bashResources },
  }
  // Each call runs with its run in `callRuns`, for `writingRun`.
  const tools = source.tools.map((tool): AnyTool => {
    const { execute } = tool
    if (!execute) return tool
    return {
      ...tool,
      execute: (args: unknown, context?: ToolExecutionContext) =>
        callRuns.run(runOf(context), () => execute(args, context)),
    }
  })
  return {
    tools,
    resources,
    prompt: source.prompt,
    bind: source.bind,
  }
}

/** The tools for one workspace folder `root`, for every thread. */
function fixedTools(
  root: string,
  options: WorkspaceToolsOptions,
  session: SessionAccess,
) {
  const own = bindTools(
    { backend: options.backend ?? hostBackend, root },
    options,
    session,
  )
  return {
    tools: own.tools,
    prompt: () => own.prompt(),
    bind: async () => own,
    // A full path, from the working folder.
    fromHere: own.fromHere,
  }
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
 * File, shell, and web tools for a coding agent: `read_file`, `write_file`,
 * `edit_file` or `patch` (see `editStyle`), `list_files`, `grep`, `bash`,
 * `webfetch`, and `websearch` with a search provider. Edits, `bash`, and
 * `webfetch` ask for approval through `permissions()`, and each call tells
 * the permission rules which paths or commands it touches.
 *
 * The workspace is `root` for every thread, or with `workspace.bind`, a
 * workspace for each thread. Its root is the boundary of every tool: a path
 * outside it is refused, or with `outside: 'ask'` the user is asked first. A
 * link that leads out of the root counts as outside, and the working folder
 * must be in the root. Other plugins add {@link WorkspaceHooks} to run code
 * after a read or a write.
 *
 * The tools use `backend` for files and commands. The default,
 * `hostBackend`, runs on this machine with the host's authority. Its
 * commands get only a few variables of this process. Use a sandbox backend
 * for code you do not trust.
 *
 * @example
 * ```ts
 * workspaceTools({ root: process.cwd(), outside: 'ask' })
 * // A folder for each thread:
 * workspaceTools({
 *   workspace: {
 *     bind: async ({ run }) => ({
 *       ...hostBackend,
 *       root: `/srv/work/${run.threadId}`,
 *     }),
 *   },
 * })
 * ```
 */
export function workspaceTools(options: WorkspaceToolsOptions) {
  return definePlugin({
    name: 'tanstack/workspace-tools',
    optionalRequires: [PermissionDecisionCapability],
    setup: (ctx) => {
      const hooks = ctx.collect(WorkspaceHooks)
      const { tools, prompt, resources, bind } = createWorkspaceTools(options, {
        access: {
          // ponytail: D9, PR 7 rebuilds ask. The question goes to the
          // running turn, not to the run of the tool call that asks.
          ask: (message) => ctx.session.ask({ message }),
          mode: () => ctx.config.get('mode'),
          // The working folder is the thread's `cwd` setting, read at each call.
          cwd: () => ctx.session.settings().cwd,
          // Read at each call, so permissions() can come after this plugin.
          rules: () => {
            const decide = ctx.getOptional(PermissionDecisionCapability)
            if (!decide) return undefined
            const value = ctx.config.get('mode')
            const mode =
              PERMISSION_MODES.find((each) => each === value) ?? 'default'
            return (tool, paths) => decide(tool, mode, { paths })
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
        // The events of the background jobs go to the clients.
        emit: ctx.emit,
      })
      return {
        tools,
        prompts: [(turn) => prompt(turn.run)],
        // Bind the workspace of the thread before the turn, so the prompt
        // names its root. It adds no tools.
        ...(options.workspace
          ? {
              discoverTools: async (turn) => {
                await bind(turn.run)
                return []
              },
            }
          : {}),
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
