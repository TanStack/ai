import { AsyncLocalStorage } from 'node:async_hooks'
import { createCapability } from '@tanstack/ai'
import {
  BackgroundJobs,
  SessionScrub,
  SessionSignal,
  ThreadEnds,
  WorkspaceLog,
  definePlugin,
} from '../../plugins'
import {
  PERMISSION_MODES,
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
} from '../permissions'
import { WorkspaceHooks } from '../workspace-hooks'
import {
  hostBackend,
  optionalString,
  pathsOf,
  runOf,
  stringArg,
} from './backend'
import { bashResources, bashTools } from './bash'
import { WorkspaceStranded } from './events'
import { editTools, fileVersions } from './edit'
import { patchPaths, patchTools } from './patch'
import { readTools } from './read'
import { searchTools } from './search'
import { webTools } from './web'
import type { AnyTool, ToolExecutionContext } from '@tanstack/ai'
import type { PluginEvent } from '../../extensions'
import type { BackgroundJobsApi, WorkspaceLogApi } from '../../plugins'
import type { RunContext } from '../../types'
import type {
  CallResources,
  PermissionDecision,
  ToolResources,
} from '../permissions'
import type {
  BoundWorkspace,
  ToolEnv,
  WorkspaceBackend,
  WorkspaceBinding,
} from './backend'
import type { WebToolsOptions } from './web'

/** Gives the workspace of each thread. */
export interface WorkspaceBinder {
  /**
   * The workspace of the thread of `run`: a backend and its `root`. The
   * tools call it once for each thread, before the first turn or at the
   * first tool call, and keep the result. When it throws, the next turn or
   * tool call calls it again.
   */
  bind: (input: { run: RunContext }) => Promise<BoundWorkspace>
  /**
   * The workspace of a thread that the session log binds to another place:
   * a sandbox, or a folder on another host. The tools call it in place of
   * `bind`, once for each thread, with the last `binding` of the log. Give
   * the workspace back, for example from `provider.resume()`. Or give
   * `'pinned'` when only the host of the binding can continue the thread,
   * and `'gone'` when the workspace is gone. Then each tool call of the
   * thread fails, and `'gone'` sends a `tanstack/workspace-tools:stranded`
   * event.
   *
   * Default: `'pinned'` for a folder on another host, and `'gone'` for a
   * sandbox.
   */
  reattach?: (input: {
    run: RunContext
    binding: WorkspaceBinding
  }) => Promise<BoundWorkspace | 'pinned' | 'gone'>
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
   * A path outside `root`. `'deny'` (default) refuses it. `'ask'` makes the
   * call ask for approval through `permissions()`, before the call runs,
   * like a path outside its `root`. An `always` answer saves an allow rule
   * for the path. The `bypass` mode allows it without a question. Without
   * `permissions()`, nobody can approve it, so it is refused.
   *
   * With `workspace.bind`, the root of a thread is not known before the
   * call, so no approval can cover an outside path. Only a rule that allows
   * the path, or the `bypass` mode, lets the call use it.
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

/** What the tools need from the session for the permission rules. */
export interface OutsideAccess {
  /** The permission mode of the session, for example `'bypass'`. */
  mode: () => unknown
  /**
   * The working folder of the thread, from `root` (the `cwd` setting of
   * `session.updateThreadSettings`). Relative paths start there. Read at each call. A
   * folder outside the workspace is refused.
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

/** What the tools get from the session. */
interface SessionAccess {
  access?: OutsideAccess
  hooks?: () => ReadonlyArray<WorkspaceHooks>
  /**
   * Add a note to the transcript. With `wake`, the model acts on it, in a
   * turn of `user`.
   */
  note?: (
    text: string,
    options?: { wake?: boolean; user?: RunContext['user'] },
  ) => Promise<void>
  signal?: AbortSignal
  jobs?: BackgroundJobsApi
  /**
   * Sends the events of the background `bash` jobs, of the files that the
   * edit tools change, and of a stranded thread.
   */
  emit?: <T>(event: PluginEvent<T>, value: T) => void
  /** The bindings, the pin, and the jobs in the session log. */
  log?: WorkspaceLogApi
  /** Takes the secrets of the session out of a text, for a `bash` spill. */
  scrub?: (text: string) => string
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
 * The file locks of this process, by the place of the backend (a sandbox, or
 * this host) and the real path of the file. Every session and agent on one
 * file shares them, also through another root or a link, so two edits of
 * one file run one after the other. Two sandboxes with the same root do not.
 *
 * ponytail: a backend with no `binding` counts as this host. Two such
 * backends of other machines with the same paths share locks: they wait
 * when they need not, but no edit is lost.
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
 * @internal The workspaces of `workspaceTools()` with `workspace.bind`, so
 * `snapshots()` and `formatter()` work in the workspace of each thread, not
 * in their own `root`. The package does not export it.
 */
export interface ThreadWorkspaces {
  /** True when each thread has its own workspace (`workspace.bind`). */
  perThread: boolean
  /** The workspace of the thread of `run`. It binds the thread first. */
  of: (run: RunContext) => Promise<BoundWorkspace | undefined>
  /** The workspace of the thread `threadId`, when it is bound already. */
  bound: (threadId: string) => BoundWorkspace | undefined
  /**
   * The workspace of the thread of `run` when the thread ends: the one that
   * is open, or the one that the log binds, opened again with `bind` or
   * `reattach`. `undefined` when the thread has none, or it is pinned to
   * another host or gone. The end handler of `workspaceTools()` closes it.
   */
  ending: (run: RunContext) => Promise<BoundWorkspace | undefined>
}

/** @internal See {@link ThreadWorkspaces}. */
export const ThreadWorkspace = createCapability<ThreadWorkspaces>()(
  'tanstack/thread-workspace',
)

/**
 * The workspace tool call that runs now: its run, and its chat run (the
 * abort signal of the call, one for each `chat()`). A tool-mode subagent
 * shares the run of its turn, but has its own chat run.
 */
const calls = new AsyncLocalStorage<{ run?: RunContext; chat?: object }>()

/**
 * The run of the workspace tool call that runs now, or `undefined` outside
 * a call. A `WorkspaceHooks` hook reads it to know which run wrote a file.
 */
export function writingRun() {
  return calls.getStore()?.run
}

/** The chat run of the workspace tool call that runs now. See `calls`. */
const callingChat = () => calls.getStore()?.chat

/**
 * The tools for one workspace: `backend`, with the boundary `root`, and what
 * each call touches for `PermissionResources`: the paths a call names, their
 * real paths, and the real paths outside the workspace. `permissions()`
 * decides them before the call runs, so no tool asks while it runs. Each
 * call gets the paths through `reach`, which resolves every link, and works
 * on the resolved path under `lock`. `rulesSawRealPaths` is false when the
 * rules get other resources (see `check`).
 */
function bindTools(
  workspace: { backend: WorkspaceBackend; root: string },
  options: WorkspaceToolsOptions,
  session: SessionAccess,
  rulesSawRealPaths = true,
) {
  const { backend } = workspace
  const paths = pathsOf(backend)
  const root = paths.resolve(workspace.root)
  const { access, note } = session
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

  /**
   * The lock key of `path`, a path from `reach`: the place of the backend,
   * and the real path (`forRules` the other way).
   */
  const lockKey = async (path: string) => {
    const real = within(root, path, paths.sep)
      ? paths.join(await realRoot(), paths.relative(root, path))
      : path
    const place = backend.binding?.()
    return JSON.stringify([place?.provider, place?.sandboxId, real])
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
   * Throws when the call must not use `full` at `real`. With
   * `rulesSawRealPaths`, the rules decided the call before it ran, with the
   * real paths (see `touched`), so a call that runs was allowed or
   * approved. The check runs again here, on the paths as they are now: a
   * deny refuses, and so does a path outside the workspace that nobody can
   * approve.
   *
   * Without it (a workspace for each thread), the rules saw only the path
   * that the call names. Then a real path that makes the decision stricter,
   * or an outside path that no rule allows, is refused: nobody approved it.
   */
  const check = (
    path: string,
    tool: string,
    full: string,
    { real, isOutside }: Awaited<ReturnType<typeof locate>>,
  ) => {
    const decide = access?.rules?.()
    const isBypass = access?.mode() === 'bypass'
    if (isOutside) {
      const canAsk = options.outside === 'ask' && access
      if (!canAsk || (!decide && !isBypass)) {
        throw new Error(`Path "${path}" is outside the workspace.`)
      }
    }
    // `bash` touches commands. Its rules do not match paths.
    if (!decide || !PATH_TOOLS.has(tool)) return
    const decision = decide(tool, {
      paths: [...new Set([full, real])],
      outside: isOutside ? [real] : [],
    })
    if (decision === 'deny') {
      throw new Error(
        paths.relative(full, real) === ''
          ? `The permission rules do not allow ${tool} on ${shown(real)}.`
          : `The permission rules do not allow ${tool} on ${shown(real)}, the real path of ${path}.`,
      )
    }
    if (rulesSawRealPaths || isBypass || decision === 'allow') return
    if (isOutside) {
      throw new Error(
        `Path "${path}" is outside the workspace, and no rule allows it. With a workspace for each thread, the call cannot ask for it.`,
      )
    }
    if (decision === decide(tool, { paths: [full] })) return
    throw new Error(
      `${path} is a link to ${shown(real)}, and the permission rules ask before ${tool} uses ${shown(real)}. Name ${shown(real)} in the call, so the approval covers it.`,
    )
  }

  // The boundary check uses real paths, so a link inside the workspace that
  // leads out of it counts as outside. The tools work on the resolved path.
  const reach: ToolEnv['reach'] = async (path, tool) => {
    const full = paths.resolve(here(), path)
    const located = await locate(full)
    check(path, tool, full, located)
    // `locate` does not read a UNC path of another server. After the
    // check, it is allowed, so read its real path now.
    return isUnc(full) && !isUnc(root) ? resolved(full) : located.real
  }

  const env: ToolEnv = {
    backend,
    root,
    hooks: session.hooks ?? (() => []),
    // `path` is the path from `reach`. The fixed lock order of `patch` (by
    // path) is the order of the real paths too: one root is one prefix.
    lock: async (path, fn) =>
      fileLocks(await lockKey(path), async () => {
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
        decide('read_file', {
          paths: [paths.resolve(dir, path), paths.resolve(real, path)],
        }) !== 'allow'
    },
    emit: session.emit,
  }
  // What each chat run of this binding read and wrote, so a write fails
  // when the file changed since its own chat run saw it.
  const versions = fileVersions(env, callingChat)
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
      note:
        note &&
        ((text, user) => note(text, { wake: true, ...(user ? { user } : {}) })),
      spillDir: options.spillDir,
      ...(session.scrub ? { scrub: session.scrub } : {}),
      signal: session.signal,
      jobs: session.jobs,
      emit: session.emit,
      maxJobs: options.maxJobs,
    }),
    ...(options.web === false ? [] : webTools(options.web)),
  ]

  const intro =
    options.outside === 'ask'
      ? `Your workspace is ${root}. Paths are relative to it. A path outside it needs the approval of the user.`
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
    resources,
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

/** Where `binding` is, for a message. */
const placeOf = (binding: WorkspaceBinding) =>
  binding.kind === 'host'
    ? `${binding.root} on the host ${binding.hostId}`
    : `${binding.root} in the ${binding.provider} sandbox ${binding.sandboxId}`

/**
 * The default `reattach`: only the host of a folder continues the thread,
 * and a sandbox needs a `reattach` that resumes it.
 */
const reattachNone: NonNullable<WorkspaceBinder['reattach']> = async ({
  binding,
}) => (binding.kind === 'host' ? 'pinned' : 'gone')

/**
 * The workspace of the thread of `run`, with the binding in the session
 * log. The first time, `bind` gives it, and the log gets its binding. A
 * folder on a host with a stable id also pins the log to that host. When
 * the log binds the thread to another place, `reattach` gives the
 * workspace, or tells that the thread is pinned to another host or
 * stranded. Then it throws. Last, it stops the jobs of the thread that a
 * host before this one left running.
 */
async function openWorkspace(
  run: RunContext,
  binder: WorkspaceBinder,
  session: SessionAccess,
) {
  const { log } = session
  if (!log) return binder.bind({ run })
  const { threadId } = run
  const hostId = log.hostId()
  const known = log.bound(threadId)
  // A folder with no host id is on every host.
  const isHere = (binding: WorkspaceBinding) =>
    binding.kind === 'host' &&
    (binding.hostId === undefined || binding.hostId === hostId)
  let found: BoundWorkspace
  if (known === undefined || isHere(known)) found = await binder.bind({ run })
  else {
    const reattach = binder.reattach ?? reattachNone
    const reattached = await reattach({ run, binding: known })
    if (reattached === 'pinned' && known.kind === 'host' && known.hostId) {
      // Only that host takes the log from now on.
      await log.pin(known.hostId)
    }
    if (reattached === 'pinned' || reattached === 'gone') {
      const message =
        reattached === 'pinned'
          ? `The workspace of this thread is ${placeOf(known)}. Only that host can continue the thread.`
          : `The workspace of this thread, ${placeOf(known)}, is gone, so the tools cannot work on it.`
      if (reattached === 'gone') {
        session.emit?.(WorkspaceStranded, { threadId, binding: known, message })
        // The harness event of the same fact, for any client.
        log.stranded({
          operationId: run.runId,
          ...(known.kind === 'host' && known.hostId
            ? { hostId: known.hostId }
            : {}),
        })
      }
      throw new Error(message)
    }
    found = reattached
  }
  const sandbox = found.binding?.()
  const binding: WorkspaceBinding = sandbox
    ? { ...sandbox, root: found.root }
    : { kind: 'host', ...(hostId ? { hostId } : {}), root: found.root }
  if (JSON.stringify(binding) !== JSON.stringify(known)) {
    await log.bind({ threadId, binding })
    if (binding.kind === 'host' && hostId) await log.pin(hostId)
  }
  // A host before this one started these jobs. Background jobs do not move
  // with a session, so each one is stopped and reported. A backend with no
  // `killJob`, or one that cannot check the job (it throws), cannot tell:
  // the job may still run, so the log keeps it.
  for (const { jobId, backendId } of log.lostJobs(threadId)) {
    const isStopped = await (
      found.killJob?.(backendId) ?? Promise.resolve(undefined)
    ).catch(() => undefined)
    if (isStopped === undefined) {
      await session.note?.(
        `Background job ${jobId} may still run: it ran on a host before this one, and this host cannot stop it.`,
      )
      continue
    }
    await session.note?.(
      isStopped
        ? `Background job ${jobId} was stopped: it ran on a host before the session moved to this one.`
        : `Background job ${jobId} stopped when the host restarted.`,
    )
    session.jobs?.ended({ jobId, threadId })
  }
  return found
}

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
  // The workspace of each bound thread, by the log and the thread too.
  const opened = new Map<string, BoundWorkspace>()
  const keyOf = (run: RunContext) => `${run.logId}\0${run.threadId}`
  // The workspaces that `bind` gave. They belong to the tools, so the tools
  // close them when the session ends. A fixed `backend` option belongs to
  // the caller and is never closed here.
  const workspaces = new Set<BoundWorkspace>()
  // A session close is not the end of its thread: an idle close, a host
  // that stops for a deploy, or a move to another host all keep the
  // thread, and the next host reattaches its workspace. So the close is
  // `'moved'`: a sandbox stays, and the session signal stops the jobs of
  // this host (see `bashTools`).
  // Only the end of the thread (`end`, from the thread purge) is `'closed'`.
  session.signal?.addEventListener(
    'abort',
    () => {
      for (const workspace of workspaces) {
        void workspace.close?.({ reason: 'moved' }).catch(() => undefined)
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
    const binding = openWorkspace(run, binder, session).then((workspace) => {
      workspaces.add(workspace)
      opened.set(key, workspace)
      const tools = bindTools(
        { backend: workspace, root: workspace.root },
        options,
        session,
        false,
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
    false,
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
   * `root`. The real paths are not known either: `check` in `bindTools`
   * refuses what the rules did not see.
   */
  const fromHere = (path: string) => {
    const cwd = session.access?.cwd?.()
    return cwd && !isAbsolutePath(path) ? `${cwd}/${path}` : path
  }
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
  /** See `ThreadWorkspaces.ending`. */
  const ending = async (run: RunContext) => {
    const key = keyOf(run)
    // A bind that runs now ends first. A failed one leaves no workspace.
    await bindings.get(key)?.catch(() => undefined)
    const known = opened.get(key)
    if (known) return known
    const { log } = session
    const binding = log?.bound(run.threadId)
    if (!log || !binding) return undefined
    const hostId = log.hostId()
    const isHere =
      binding.kind === 'host' &&
      (binding.hostId === undefined || binding.hostId === hostId)
    const found = isHere
      ? await binder.bind({ run })
      : await (binder.reattach ?? reattachNone)({ run, binding })
    if (found === 'pinned' || found === 'gone') return undefined
    workspaces.add(found)
    opened.set(key, found)
    return found
  }
  /** The thread of `run` ended: close its workspace as `'closed'`. */
  const end = async (run: RunContext) => {
    const workspace = await ending(run)
    if (!workspace) return
    const key = keyOf(run)
    workspaces.delete(workspace)
    opened.delete(key)
    bound.delete(key)
    bindings.delete(key)
    await workspace.close?.({ reason: 'closed' })
  }
  const threads: ThreadWorkspaces = {
    perThread: true,
    of: async (run) => {
      await bind(run)
      return opened.get(keyOf(run))
    },
    bound: (threadId) =>
      [...opened].find(([key]) => key.endsWith(`\0${threadId}`))?.[1],
    ending,
  }
  return { tools, prompt, bind, resources, threads, end }
}

/**
 * The tools of {@link workspaceTools} for one session, and what each call
 * touches for `PermissionResources`. `permissions()` decides them before the
 * call runs, so no tool asks while it runs. `access` gives the rules and the
 * mode. `hooks` are the hooks that plugins added. `note` tells the model
 * that a background `bash` job ended, and `signal` kills the jobs that still
 * run.
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
  // Each call runs with its run and its chat run in `calls`.
  const tools = source.tools.map((tool): AnyTool => {
    const { execute } = tool
    if (!execute) return tool
    return {
      ...tool,
      execute: (args: unknown, context?: ToolExecutionContext) =>
        calls.run({ run: runOf(context), chat: context?.abortSignal }, () =>
          execute(args, context),
        ),
    }
  })
  return {
    tools,
    resources: source.resources,
    prompt: source.prompt,
    bind: source.bind,
    threads: source.threads,
    end: source.end,
  }
}

/**
 * The tools for one workspace folder `root`, for every thread. The session
 * log gets the binding of each thread, at its first tool call.
 */
function fixedTools(
  root: string,
  options: WorkspaceToolsOptions,
  session: SessionAccess,
) {
  const backend = options.backend ?? hostBackend
  const own = bindTools({ backend, root }, options, session)
  const workspace: BoundWorkspace = { ...backend, root }
  // Every host has the same backend: only a folder on another host is
  // another place.
  const binder: WorkspaceBinder = {
    bind: async () => workspace,
    reattach: async ({ binding }) =>
      binding.kind === 'host' ? 'pinned' : workspace,
  }
  // By the log and the thread of the run. A failed check is not kept.
  const checks = new Map<string, Promise<unknown>>()
  const check = (run: RunContext | undefined) => {
    if (!run || !session.log) return undefined
    const key = `${run.logId}\0${run.threadId}`
    const known = checks.get(key)
    if (known) return known
    const opened = openWorkspace(run, binder, session)
    opened.catch(() => {
      if (checks.get(key) === opened) checks.delete(key)
    })
    checks.set(key, opened)
    return opened
  }
  const tools = own.tools.map((tool): AnyTool => {
    const { execute } = tool
    if (!execute) return tool
    return {
      ...tool,
      execute: async (args: unknown, context?: ToolExecutionContext) => {
        await check(runOf(context))
        return execute(args, context)
      },
    }
  })
  // One workspace for every thread: the other plugins keep their own root.
  const threads: ThreadWorkspaces = {
    perThread: false,
    of: async () => undefined,
    bound: () => undefined,
    ending: async () => undefined,
  }
  return {
    tools,
    prompt: () => own.prompt(),
    bind: async () => own,
    // The paths and the real paths, from the working folder.
    resources: own.resources,
    threads,
    // The folder and the backend belong to the caller: the end of a thread
    // closes nothing.
    end: async (_run: RunContext) => {},
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
 * the permission rules which paths or commands it touches, before the call
 * runs.
 *
 * The workspace is `root` for every thread, or with `workspace.bind`, a
 * workspace for each thread. Its root is the boundary of every tool: a path
 * outside it is refused, or with `outside: 'ask'` it needs an approval. A
 * link that leads out of the root counts as outside, the rules see the real
 * path of a link, and the working folder must be in the root. Other plugins
 * add {@link WorkspaceHooks} to run code after a read or a write.
 *
 * The tools use `backend` for files and commands. The default,
 * `hostBackend`, runs on this machine with the host's authority. Its
 * commands get only a few variables of this process. Use a sandbox backend
 * for code you do not trust.
 *
 * @example
 * ```ts
 * workspaceTools({ root: process.cwd(), outside: 'ask' })
 * // A folder for each thread. `workspaceRoot` keeps a thread id from a
 * // client in its own folder:
 * workspaceTools({
 *   workspace: {
 *     bind: async ({ run }) => ({
 *       ...hostBackend,
 *       root: workspaceRoot('/srv/work', run.tenantId ?? 'default', run.threadId),
 *     }),
 *   },
 * })
 * ```
 */
export function workspaceTools(options: WorkspaceToolsOptions) {
  return definePlugin({
    name: 'tanstack/workspace-tools',
    optionalRequires: [PermissionDecisionCapability],
    provides: [ThreadWorkspace],
    setup: async (ctx) => {
      const hooks = ctx.collect(WorkspaceHooks)
      const { tools, prompt, resources, bind, threads, end } =
        createWorkspaceTools(options, {
          access: {
            mode: () => ctx.config.get('mode'),
            // The working folder is the thread's `cwd` setting, read at each call.
            cwd: () => ctx.session.threadSettings().cwd,
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
          // The wake turn of a job's note runs as the user of the run that
          // started the job, not as the sender of a turn that runs now.
          note: (text, note) => ctx.session.note(text, note),
          // Kills the background `bash` jobs when the session closes. A reload
          // keeps them. Without a session, the plugin cleanup kills them.
          signal: ctx.getOptional(SessionSignal) ?? ctx.resources.signal,
          jobs: ctx.getOptional(BackgroundJobs),
          // The binding of each thread, and the pin, go to the session log.
          log: ctx.getOptional(WorkspaceLog),
          // A `bash` spill file gets no secret that the tool result hides.
          scrub: ctx.getOptional(SessionScrub),
          // The events of the background jobs and of the changed files go
          // to the clients.
          emit: ctx.emit,
        })
      // `snapshots()` and `formatter()` read the workspace of each thread.
      ctx.provide(ThreadWorkspace, threads)
      // The thread purge destroys the workspace that `bind` gave the thread.
      const ends = ctx.getOptional(ThreadEnds)
      if (ends) {
        await ctx.resources.acquire(
          () => ends.add(({ run }) => end(run)),
          (remove) => remove(),
        )
      }
      return {
        tools,
        prompts: [(turn) => prompt(turn.run)],
        // Bind the workspace of the thread before the turn, so the prompt
        // names its root.
        ...(options.workspace
          ? {
              onTurnStart: async (turn) => {
                await bind(turn.run)
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
