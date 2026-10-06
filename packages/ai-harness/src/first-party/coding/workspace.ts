import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { definePlugin } from '../../plugins'
import { PermissionRules, isYes } from '../permissions'
import { WorkspaceHooks } from '../workspace-hooks'
import { hostBackend } from './backend'
import { bashTools } from './bash'
import { editTools } from './edit'
import { readTools } from './read'
import { searchTools } from './search'
import type { ToolEnv, WorkspaceBackend } from './backend'

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
}

/** What the tools need from the session for a path outside the workspace. */
export interface OutsideAccess {
  /** Ask the user a question, and resolve with the answer. */
  ask: (message: string) => Promise<unknown>
  /** The permission mode of the session, for example `'bypass'`. */
  mode: () => unknown
}

/** Is `full` the folder `dir`, or a path in it? */
function within(dir: string, full: string) {
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
 * The tools of {@link workspaceTools} for one session. `access` asks the user
 * about a path outside the workspace when `options.outside` is `'ask'`.
 * `hooks` are the hooks that plugins added.
 */
export function createWorkspaceTools(
  options: WorkspaceToolsOptions,
  session: {
    access?: OutsideAccess
    hooks?: () => ReadonlyArray<WorkspaceHooks>
  } = {},
) {
  const root = resolve(options.root)
  const { access } = session
  // The outside folders the user allowed in this session, and the questions
  // that wait for an answer, by folder, so parallel calls ask once.
  const allowed: Array<string> = []
  const asking = new Map<string, Promise<boolean>>()

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

  const reach: ToolEnv['reach'] = async (path, tool, kind) => {
    const full = isAbsolute(path) ? resolve(path) : resolve(root, path)
    const isAllowed = [root, ...allowed].some((dir) => within(dir, full))
    if (isAllowed) return full
    if (options.outside !== 'ask' || !access) {
      throw new Error(`Path "${path}" is outside the workspace.`)
    }
    if (access.mode() === 'bypass') return full
    const folder = kind === 'folder' ? full : dirname(full)
    const yes = await allow(
      folder,
      `${tool} wants ${full}, outside the workspace (${root}). Allow ${folder} for this session? (y/n)`,
    )
    if (!yes) {
      throw new Error(
        `The user did not allow ${full}. It is outside the workspace.`,
      )
    }
    return full
  }

  const env: ToolEnv = {
    backend: options.backend ?? hostBackend,
    root,
    hooks: session.hooks ?? (() => []),
    // ponytail: one lock per session. Sessions on one folder do not wait
    // for each other.
    lock: createLock(),
    reach,
    shown: (full) =>
      (within(root, full) ? relative(root, full) || '.' : full)
        .split(sep)
        .join('/'),
  }
  const tools = [
    ...readTools(env),
    ...editTools(env),
    ...searchTools(env),
    ...bashTools(env, { timeoutMs: options.bashTimeoutMs }),
  ]
  const prompt =
    options.outside === 'ask'
      ? `Your workspace is ${root}. Paths are relative to it. A path outside it asks the user first.`
      : `Your workspace is ${root}. Paths are relative to it.`
  return { tools, prompt }
}

/**
 * File and shell tools for a coding agent, in `root`: `read_file`,
 * `write_file`, `edit_file`, `list_files`, `grep`, and `bash`. Edits and
 * `bash` ask for approval through `permissions()`. A path outside `root` is
 * refused, or with `outside: 'ask'` the user is asked first. Other plugins
 * add {@link WorkspaceHooks} to run code after a read or a write.
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
    setup: (ctx) => {
      const hooks = ctx.collect(WorkspaceHooks)
      const { tools, prompt } = createWorkspaceTools(options, {
        access: {
          ask: (message) => ctx.session.ask({ message }),
          mode: () => ctx.config.get('mode'),
        },
        hooks: () => hooks,
      })
      return {
        tools,
        prompts: [prompt],
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
            tool: 'bash',
            decision: 'ask',
            kind: 'execute',
          }),
        ],
      }
    },
  })
}
