import { exec } from 'node:child_process'
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { toolDefinition } from '@tanstack/ai'
import { definePlugin } from '../plugins'
import { PermissionRules } from './permissions'

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

/**
 * File and shell tools for a coding agent, confined to `root`: `read_file`,
 * `write_file`, `edit_file`, `list_files`, `grep`, and `bash`. Edits and
 * `bash` ask for approval through `permissions()`.
 *
 * These tools run on this machine with the host's authority. Use a sandbox
 * for code you do not trust.
 */
export function workspaceTools(options: {
  root: string
  bashTimeoutMs?: number
}) {
  const root = resolve(options.root)

  const inRoot = (path: string): string => {
    const full = isAbsolute(path) ? resolve(path) : resolve(root, path)
    if (full !== root && !full.startsWith(root + sep)) {
      throw new Error(`Path "${path}" is outside the workspace.`)
    }
    return full
  }
  const shown = (full: string) =>
    relative(root, full).split(sep).join('/') || '.'

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
      const full = inRoot(stringArg(args, 'path'))
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
      const full = inRoot(stringArg(args, 'path'))
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
      const full = inRoot(stringArg(args, 'path'))
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
        'List files in the workspace, optionally matching a glob like `src/**/*.ts`.',
      inputSchema: {
        type: 'object',
        properties: { pattern: { type: 'string' } },
      },
      replay: 'safe',
    }).server(async (args: unknown) => {
      const pattern = optionalString(args, 'pattern')
      const files: Array<string> = []
      await walk(root, files)
      const regex = pattern ? globToRegExp(pattern) : undefined
      const listed = files
        .map(shown)
        .filter((file) => !regex || regex.test(file))
      return clip(listed.slice(0, 1000).join('\n') || 'No files.')
    }),
    toolDefinition({
      name: 'grep',
      description:
        'Search file contents with a regular expression. Returns `file:line: text`.',
      inputSchema: {
        type: 'object',
        properties: { pattern: { type: 'string' }, glob: { type: 'string' } },
        required: ['pattern'],
      },
      replay: 'safe',
    }).server(async (args: unknown) => {
      const regex = new RegExp(stringArg(args, 'pattern'))
      const glob = optionalString(args, 'glob')
      const fileFilter = glob ? globToRegExp(glob) : undefined
      const files: Array<string> = []
      await walk(root, files)
      const hits: Array<string> = []
      for (const file of files) {
        if (fileFilter && !fileFilter.test(shown(file))) continue
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
    }).server(
      (args: unknown) =>
        new Promise<string>((done) => {
          exec(
            stringArg(args, 'command'),
            {
              cwd: root,
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
        }),
    ),
  ]

  return definePlugin({
    name: 'tanstack/workspace-tools',
    setup: () => ({
      tools,
      prompts: [`Your workspace is ${root}. Paths are relative to it.`],
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
        PermissionRules.item({ tool: 'grep', decision: 'allow', kind: 'read' }),
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
    }),
  })
}
