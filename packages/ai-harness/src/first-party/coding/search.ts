import { relative, resolve, sep } from 'node:path'
import { toolDefinition } from '@tanstack/ai'
import { globToRegExp } from '../glob'
import { clip, optionalString, readText, stringArg } from './backend'
import type { ToolEnv, WorkspaceBackend } from './backend'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.nx', '.turbo'])

/** The path of `file` from the folder `base`, with `/`, for a glob. */
const fromBase = (base: string, file: string) =>
  relative(base, file).split(sep).join('/')

/** Add the files in `dir` and its folders to `out`. Stops after 5000. */
async function walk(
  backend: WorkspaceBackend,
  dir: string,
  out: Array<string>,
) {
  const entries = await backend.readdir(dir)
  for (const entry of entries) {
    if (entry.type === 'dir') {
      if (!SKIP_DIRS.has(entry.name))
        await walk(backend, resolve(dir, entry.name), out)
    } else out.push(resolve(dir, entry.name))
    if (out.length > 5000) return
  }
}

/** `list_files` and `grep`. Both skip dependency and build folders. */
export function searchTools(env: ToolEnv) {
  return [
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
      const base = await env.reach(
        optionalString(args, 'path') ?? '.',
        'list_files',
        'folder',
      )
      const pattern = optionalString(args, 'pattern')
      const files: Array<string> = []
      await walk(env.backend, base, files)
      const regex = pattern ? globToRegExp(pattern) : undefined
      const listed = files
        .filter((file) => !regex || regex.test(fromBase(base, file)))
        .map(env.shown)
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
      const base = await env.reach(
        optionalString(args, 'path') ?? '.',
        'grep',
        'folder',
      )
      const glob = optionalString(args, 'glob')
      const fileFilter = glob ? globToRegExp(glob) : undefined
      const files: Array<string> = []
      await walk(env.backend, base, files)
      const hits: Array<string> = []
      for (const file of files) {
        if (fileFilter && !fileFilter.test(fromBase(base, file))) continue
        const info = await env.backend.stat(file)
        if (!info || info.size > 1_000_000) continue
        const lines = (await readText(env.backend, file)).split('\n')
        lines.forEach((line, index) => {
          if (hits.length < 200 && regex.test(line))
            hits.push(`${env.shown(file)}:${index + 1}: ${line.trim()}`)
        })
        if (hits.length >= 200) break
      }
      return clip(hits.join('\n') || 'No matches.')
    }),
  ]
}
