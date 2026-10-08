import { SessionSignal, definePlugin } from '../../plugins'
import {
  PERMISSION_MODES,
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
  isYes,
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
import type { PermissionDecision, ToolResources } from '../permissions'
import type { ToolEnv, WorkspaceBackend } from './backend'
import type { WebToolsOptions } from './web'

export interface WorkspaceToolsOptions {
  root: string
  bashTimeoutMs?: number
  /**
   * A path outside `root`. `'deny'` (default) refuses it. `'ask'` asks the
   * user first, and a yes allows that folder, and the folders in it, for the
   * rest of the session. The `bypass` mode of `permissions()` allows it
   * without a question.
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

/** What the tools need from the session for a path outside the workspace. */
export interface OutsideAccess {
  /** Ask the user a question, and resolve with the answer. */
  ask: (message: string) => Promise<unknown>
  /** The permission mode of the session, for example `'bypass'`. */
  mode: () => unknown
  /**
   * The working folder of the thread, from `root` (the `cwd` setting of
   * `session.configure`). Relative paths start there. Read at each call.
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
 * touches for `PermissionResources`. `access` asks the user about a path
 * outside the workspace when `options.outside` is `'ask'`. `hooks` are the
 * hooks that plugins added. `note` tells the model that a background `bash`
 * job ended, and `signal` kills the jobs that still run.
 */
export function createWorkspaceTools(
  options: WorkspaceToolsOptions,
  session: {
    access?: OutsideAccess
    hooks?: () => ReadonlyArray<WorkspaceHooks>
    note?: (text: string) => Promise<void>
    signal?: AbortSignal
  } = {},
) {
  const backend = options.backend ?? hostBackend
  const paths = pathsOf(backend)
  const root = paths.resolve(options.root)
  const { access } = session
  // The real outside folders the user allowed in this session, and the
  // questions that wait for an answer, by folder, so parallel calls ask once.
  const allowed: Array<string> = []
  const asking = new Map<string, Promise<boolean>>()
  /** The working folder: `root`, or the thread's `cwd` in it. */
  const here = () => {
    const cwd = access?.cwd?.()
    return cwd ? paths.resolve(root, cwd) : root
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

  /**
   * The real path of `full`, as the permission rules see it. In the real
   * root, it is a path in `root`, so a root that is a link (like `/tmp` on
   * macOS) does not move every path outside.
   */
  const realForRules = async (full: string) => {
    const [real, realRoot] = await Promise.all([realPath(full), realPath(root)])
    return within(realRoot, real, paths.sep)
      ? paths.join(root, paths.relative(realRoot, real))
      : real
  }

  const shown = (full: string) =>
    (within(root, full, paths.sep) ? paths.relative(root, full) || '.' : full)
      .split(paths.sep)
      .join('/')

  // What each call touches, as the tool resolves it, for the permission
  // rules with a `resource`.
  const file = (input: unknown) => [
    paths.resolve(here(), stringArg(input, 'path')),
  ]
  const folder = (input: unknown) => [
    paths.resolve(here(), optionalString(input, 'path') ?? '.'),
  ]
  const resources: Record<string, ToolResources> = {
    read_file: { paths: file },
    write_file: { paths: file },
    edit_file: { paths: file },
    list_files: { paths: folder },
    grep: { paths: folder },
    patch: {
      paths: (input) =>
        patchPaths(stringArg(input, 'patch')).map((each) =>
          paths.resolve(here(), each),
        ),
    },
    bash: { commands: bashResources },
  }

  /**
   * The rules see the path that the call names. A link can lead to a path
   * with a stricter rule, like `notes` to `.env`. So the rules check the
   * real path too, and the strictest decision wins.
   */
  const checkRealPath = async (path: string, tool: string, full: string) => {
    const decide = access?.rules?.()
    // `bash` touches commands. Its rules do not match paths.
    if (!access || !decide || !resources[tool]?.paths) return
    const real = await realForRules(full)
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
  // leads out of it counts as outside.
  const reach: ToolEnv['reach'] = async (path, tool, kind) => {
    const full = paths.resolve(here(), path)
    const real = await realPath(full)
    const folders = [await realPath(root), ...allowed]
    const isAllowed = folders.some((dir) => within(dir, real, paths.sep))
    if (!isAllowed) await allowOutside(path, tool, kind, full, real)
    await checkRealPath(path, tool, full)
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
      const real = await realForRules(dir)
      return (path) =>
        decide('read_file', [
          paths.resolve(dir, path),
          paths.resolve(real, path),
        ]) !== 'allow'
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
    }),
    ...(options.web === false ? [] : webTools(options.web)),
  ]

  const prompt =
    options.outside === 'ask'
      ? `Your workspace is ${root}. Paths are relative to it. A path outside it asks the user first.`
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
 * call tells the permission rules which paths or commands it touches. A
 * path outside `root` is refused, or with `outside: 'ask'` the user is
 * asked first. A link that leads out of `root` counts as outside. Other
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
          ask: (message) => ctx.session.ask({ message }),
          mode: () => ctx.config.get('mode'),
          cwd,
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
        note: (text) => ctx.session.note(text, { wake: true }),
        // Kills the background `bash` jobs when the session closes. A reload
        // keeps them. Without a session, the plugin cleanup kills them.
        signal: ctx.getOptional(SessionSignal) ?? ctx.resources.signal,
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
