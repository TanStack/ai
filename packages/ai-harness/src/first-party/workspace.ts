import { exec } from 'node:child_process'
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { toolDefinition } from '@tanstack/ai'
import { definePlugin } from '../plugins'
import { PermissionRules, isYes } from './permissions'

const MAX_OUTPUT = 20_000
const MAX_READ_LINES = 2000
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.nx', '.turbo'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringArg(args: unknown, key: string): string {
  const value = isRecord(args) ? args[key] : undefined
  if (typeof value === 'string') return value
  throw new Error(`Argument "${key}" must be a string.`)
}

function optionalString(args: unknown, key: string): string | undefined {
  const value = isRecord(args) ? args[key] : undefined
  return typeof value === 'string' ? value : undefined
}

function clip(text: string): string {
  return text.length > MAX_OUTPUT
    ? `${text.slice(0, MAX_OUTPUT)}\n[${text.length - MAX_OUTPUT} more characters]`
    : text
}

/** A simple glob to RegExp: `**` any path, `*` any name part, `?` one character. */
export function globToRegExp(glob: string): RegExp {
  let pattern = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob.charAt(index)
    if (char === '*' && glob[index + 1] === '*') {
      pattern += '.*'
      index += glob[index + 2] === '/' ? 2 : 1
    } else if (char === '*') pattern += '[^/]*'
    else if (char === '?') pattern += '[^/]'
    else pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${pattern}$`)
}

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
}

/** Is `full` the folder `dir`, or a path in it? */
function within(dir: string, full: string) {
  return full === dir || full.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

/**
 * The tools of {@link workspaceTools} for one session. `access` asks the user
 * about a path outside the workspace when `options.outside` is `'ask'`.
 */
export function createWorkspaceTools(
  options: WorkspaceToolsOptions,
  access?: OutsideAccess,
) {
  const root = resolve(options.root)
  // The outside folders the user allowed in this session, and the questions
  // that wait for an answer, by folder, so parallel calls ask once.
  const allowed: Array<string> = []
  const asking = new Map<string, Promise<boolean>>()
  /** The working folder: `root`, or the thread's `cwd` in it. */
  const here = () => {
    const cwd = access?.cwd?.()
    return cwd ? resolve(root, cwd) : root
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
   * The full path of `path`, a file or a folder. A path outside the
   * workspace is refused, or needs the user's yes for its folder.
   */
  const reach = async (path: string, tool: string, kind: 'file' | 'folder') => {
    const full = isAbsolute(path) ? resolve(path) : resolve(here(), path)
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
  /** A path for the model: from the workspace, or the full path outside it. */
  const shown = (full: string) =>
    (within(root, full) ? relative(root, full) || '.' : full)
      .split(sep)
      .join('/')

  /** The path of `file` from the folder `base`, with `/`, for a glob. */
  const fromBase = (base: string, file: string) =>
    relative(base, file).split(sep).join('/')

  async function walk(dir: string, out: Array<string>): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name))
          await walk(resolve(dir, entry.name), out)
      } else out.push(resolve(dir, entry.name))
      if (out.length > 5000) return
    }
  }

  const tools = [
    toolDefinition({
      name: 'read_file',
      description:
        'Read a text file in the workspace. Lines are numbered from 1.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'number', description: 'First line, from 1' },
          limit: { type: 'number' },
        },
        required: ['path'],
      },
      replay: 'safe',
    }).server(async (args: unknown) => {
      const full = await reach(stringArg(args, 'path'), 'read_file', 'file')
      const lines = (await readFile(full, 'utf8')).split('\n')
      const offset =
        isRecord(args) && typeof args.offset === 'number'
          ? Math.max(1, args.offset)
          : 1
      const limit =
        isRecord(args) && typeof args.limit === 'number'
          ? args.limit
          : MAX_READ_LINES
      return clip(
        lines
          .slice(offset - 1, offset - 1 + limit)
          .map((line, index) => `${offset + index}\t${line}`)
          .join('\n'),
      )
    }),
    toolDefinition({
      name: 'write_file',
      description: 'Create or replace a file in the workspace.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
      },
    }).server(async (args: unknown) => {
      const full = await reach(stringArg(args, 'path'), 'write_file', 'file')
      await mkdir(dirname(full), { recursive: true })
      await writeFile(full, stringArg(args, 'content'), 'utf8')
      return `Wrote ${shown(full)}.`
    }),
    toolDefinition({
      name: 'edit_file',
      description:
        'Replace exact text in a file. `old` must appear once, unless `replaceAll` is true.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old: { type: 'string' },
          new: { type: 'string' },
          replaceAll: { type: 'boolean' },
        },
        required: ['path', 'old', 'new'],
      },
    }).server(async (args: unknown) => {
      const full = await reach(stringArg(args, 'path'), 'edit_file', 'file')
      const before = await readFile(full, 'utf8')
      const oldText = stringArg(args, 'old')
      const newText = stringArg(args, 'new')
      const count = before.split(oldText).length - 1
      const replaceAll = isRecord(args) && args.replaceAll === true
      if (count === 0) throw new Error('The old text is not in the file.')
      if (count > 1 && !replaceAll) {
        throw new Error(
          `The old text appears ${count} times. Add context, or set replaceAll.`,
        )
      }
      await writeFile(full, before.split(oldText).join(newText), 'utf8')
      return `Edited ${shown(full)} (${replaceAll ? count : 1} change${count > 1 && replaceAll ? 's' : ''}).`
    }),
    toolDefinition({
      name: 'list_files',
      description:
        'List files in a folder (default: the workspace), optionally matching a glob like `src/**/*.ts`. The glob is from that folder.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: {
            type: 'string',
            description: 'The folder. Default: the workspace',
          },
        },
      },
      replay: 'safe',
    }).server(async (args: unknown) => {
      const base = await reach(
        optionalString(args, 'path') ?? '.',
        'list_files',
        'folder',
      )
      const pattern = optionalString(args, 'pattern')
      const files: Array<string> = []
      await walk(base, files)
      const regex = pattern ? globToRegExp(pattern) : undefined
      const listed = files
        .filter((file) => !regex || regex.test(fromBase(base, file)))
        .map(shown)
      return clip(listed.slice(0, 1000).join('\n') || 'No files.')
    }),
    toolDefinition({
      name: 'grep',
      description:
        'Search file contents in a folder (default: the workspace) with a regular expression. Returns `file:line: text`.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          glob: { type: 'string' },
          path: {
            type: 'string',
            description: 'The folder. Default: the workspace',
          },
        },
        required: ['pattern'],
      },
      replay: 'safe',
    }).server(async (args: unknown) => {
      const regex = new RegExp(stringArg(args, 'pattern'))
      const base = await reach(
        optionalString(args, 'path') ?? '.',
        'grep',
        'folder',
      )
      const glob = optionalString(args, 'glob')
      const fileFilter = glob ? globToRegExp(glob) : undefined
      const files: Array<string> = []
      await walk(base, files)
      const hits: Array<string> = []
      for (const file of files) {
        if (fileFilter && !fileFilter.test(fromBase(base, file))) continue
        if ((await stat(file)).size > 1_000_000) continue
        const lines = (await readFile(file, 'utf8')).split('\n')
        lines.forEach((line, index) => {
          if (hits.length < 200 && regex.test(line))
            hits.push(`${shown(file)}:${index + 1}: ${line.trim()}`)
        })
        if (hits.length >= 200) break
      }
      return clip(hits.join('\n') || 'No matches.')
    }),
    toolDefinition({
      name: 'bash',
      description:
        'Run a shell command in the workspace folder. Output is cut at 20,000 characters.',
      inputSchema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
      replay: 'never',
    }).server(async (args: unknown) => {
      // The shell runs in the working folder, so it must be in the workspace.
      const cwd = await reach('.', 'bash', 'folder')
      return new Promise<string>((done) => {
        exec(
          stringArg(args, 'command'),
          {
            cwd,
            timeout: options.bashTimeoutMs ?? 120_000,
            maxBuffer: 10 * 1024 * 1024,
          },
          (error, stdout, stderr) => {
            const code = error && 'code' in error ? error.code : 0
            done(
              clip(
                `exit code: ${String(code ?? 0)}\n${stdout}${stderr ? `\nstderr:\n${stderr}` : ''}`,
              ),
            )
          },
        )
      })
    }),
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
 * refused, or with `outside: 'ask'` the user is asked first.
 *
 * These tools run on this machine with the host's authority. Use a sandbox
 * for code you do not trust.
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
      // The working folder is the thread's `cwd` setting, read at each call.
      const cwd = () => ctx.session.settings().cwd
      const { tools, prompt } = createWorkspaceTools(options, {
        ask: (message) => ctx.session.ask({ message }),
        mode: () => ctx.config.get('mode'),
        cwd,
      })
      const folder = () => {
        const dir = cwd()
        return dir
          ? ` The working folder of this thread is ${resolve(options.root, dir)}. Relative paths start there.`
          : ''
      }
      return {
        tools,
        prompts: [() => prompt + folder()],
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
