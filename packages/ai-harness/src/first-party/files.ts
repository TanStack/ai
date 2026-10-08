import { existsSync, readFileSync, statSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path'
import { defineCommand } from '../commands'
import { definePlugin } from '../plugins'
import { hostBackend } from './coding/backend'
import { WorkspaceHooks } from './workspace-hooks'
import type { AnyCommand } from '../commands'

/** Prompt slots kept free for instruction files that change. */
const SPARE_SLOTS = 8

/** The mtime of the file at `path`, or `undefined` when there is none. */
function mtimeOf(path: string) {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

/** The trimmed text of the file at `path`, or `''` when there is none. */
function textOf(path: string) {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return ''
  }
}

/**
 * The folders from the repo root (the nearest folder with `.git`) down to
 * `root`, outermost first. Only `root` when no folder has `.git`.
 */
function repoFolders(root: string) {
  const folders = [root]
  let dir = root
  while (!existsSync(join(dir, '.git'))) {
    const parent = dirname(dir)
    if (parent === dir) return { folders: [root], isRepo: false }
    dir = parent
    folders.unshift(dir)
  }
  return { folders, isRepo: true }
}

/** The date, platform, working folder, and git facts, as a prompt. */
async function environment(root: string, isRepo: boolean) {
  const now = new Date()
  // toISOString is UTC. Move by the offset to get the local date.
  const date = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
  const lines = [
    `Date: ${date}`,
    `Platform: ${process.platform}`,
    `Working folder: ${root}`,
    `Git repository: ${isRepo ? 'yes' : 'no'}`,
  ]
  if (isRepo) {
    const git = await hostBackend.exec('git rev-parse --abbrev-ref HEAD', {
      cwd: root,
      timeoutMs: 5000,
    })
    if (git.exitCode === 0) lines.push(`Git branch: ${git.stdout.trim()}`)
  }
  return `Environment:\n${lines.map((line) => `- ${line}`).join('\n')}`
}

/** The note for an instruction file whose text changed from `before`. */
function changeNote(title: string, before: string, text: string) {
  if (text === '') return `${title} were removed.`
  if (before === '') return `${title}:\n${text}`
  return `${title} changed. Follow this text instead:\n${text}`
}

/**
 * Add instruction files (AGENTS.md, CLAUDE.md) and an environment block to
 * the system prompt.
 *
 * - `global`: files that come first, for example `~/.config/AGENTS.md`. `~`
 *   is the home folder.
 * - Then `files` from each folder between the repo root (the folder with
 *   `.git`) and `root`, outermost first. With no repo root, only `root`.
 * - `env` (default `true`): the date, platform, working folder, and git
 *   repository and branch, read when the session opens.
 *
 * At the start of each turn, the plugin checks the mtime of each file. A note
 * with the new text of a changed file goes after this plugin's other prompts.
 * Put this plugin last: when no prompt comes after its prompts, an adapter
 * with mid-conversation changes adds the note to the conversation, and the
 * prompt cache holds. Else the change is not additive, and the prompt cache
 * starts again.
 *
 * When `read_file` reads a file below `root`, the instruction files in the
 * folders between `root` and that file are added to the result, once per
 * file in the session.
 *
 * @example
 * ```ts
 * projectInstructions({ root: process.cwd(), global: ['~/.config/AGENTS.md'] })
 * ```
 */
export function projectInstructions(options: {
  root: string
  files?: ReadonlyArray<string>
  global?: ReadonlyArray<string>
  env?: boolean
}) {
  const { files: names = ['AGENTS.md', 'CLAUDE.md'], env = true } = options
  return definePlugin({
    name: 'tanstack/project-instructions',
    setup: async () => {
      const root = resolve(options.root)
      const { folders, isRepo } = repoFolders(root)
      const shownPath = (path: string) =>
        relative(root, path).split(sep).join('/')
      const globals = (options.global ?? []).map((path) => ({
        path: resolve(path.replace(/^~(?=$|[\\/])/, homedir())),
        title: `Global instructions from ${path}`,
      }))
      const projects = folders.flatMap((dir) =>
        names.map((name) => ({
          path: join(dir, name),
          title: `Project instructions from ${shownPath(join(dir, name))}`,
        })),
      )
      const files = [...globals, ...projects].map((file) => ({
        ...file,
        mtimeMs: mtimeOf(file.path),
        text: textOf(file.path),
      }))
      const envBlock = env ? [await environment(root, isRepo)] : []
      /** The prompt with each file as it is now. */
      const current = () => [
        ...files
          .filter((file) => file.text !== '')
          .map((file) => `${file.title}:\n${file.text}`),
        ...envBlock,
      ]
      const sections = current()
      const slots = files.length + envBlock.length + SPARE_SLOTS

      /** Add a note for each file that changed since the last check. */
      const refresh = () => {
        const notes: Array<string> = []
        for (const file of files) {
          const mtimeMs = mtimeOf(file.path)
          if (mtimeMs === file.mtimeMs) continue
          const before = file.text
          file.mtimeMs = mtimeMs
          file.text = textOf(file.path)
          if (file.text !== before)
            notes.push(changeNote(file.title, before, file.text))
        }
        // ponytail: with no spare slot left, the prompt is built again. That
        // one change is not added to the conversation.
        if (sections.length + notes.length > slots) {
          sections.splice(0, sections.length, ...current())
        } else {
          sections.push(...notes)
        }
      }

      /** Nested instruction files the model already got. */
      const given = new Set<string>()
      const afterRead = async (path: string) => {
        const inside = relative(root, path)
        const isBelowRoot =
          inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)
        if (!isBelowRoot) return undefined
        const notes: Array<string> = []
        // The folders below `root`, down to the folder of the file.
        const parts = inside.split(sep).slice(0, -1)
        let dir = root
        for (const part of parts) {
          dir = join(dir, part)
          for (const name of names) {
            const file = join(dir, name)
            if (given.has(file)) continue
            const text = textOf(file)
            if (text === '') continue
            given.add(file)
            // The model just read this file, so it has the text.
            if (file !== path) {
              notes.push(`Instructions from ${shownPath(file)}:\n${text}`)
            }
          }
        }
        return notes.length > 0 ? notes.join('\n\n') : undefined
      }

      return {
        // One prompt per slot. Empty slots are left out. The harness reads
        // the prompts in order each turn, so slot 0 checks the files first.
        prompts: Array.from({ length: slots }, (_, index) => () => {
          if (index === 0) refresh()
          return sections[index] ?? ''
        }),
        contribute: [WorkspaceHooks.item({ afterRead })],
      }
    },
  })
}

/** A frontmatter value: text, or a list from `[a, b]` or `- a` lines. */
export type FrontmatterValue = string | Array<string>

/** The text without the quotes around it: `"a"` and `'a'` become `a`. */
function unquote(value: string) {
  return value.trim().replace(/^(["'])(.*)\1$/, '$2')
}

/**
 * Split `---` frontmatter from a Markdown file. It reads `key: value`
 * lines and lists: `key: [a, b]`, or `key:` with `- a` lines under it.
 * Nested values are not read.
 */
export function splitFrontmatter(text: string) {
  const fields: Record<string, FrontmatterValue> = {}
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { fields, body: text }
  // The list that `- a` lines add to: the last `key:` with no value.
  let list: Array<string> | undefined
  const lines = (match[1] ?? '').split(/\r?\n/)
  for (const line of lines) {
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && list) {
      list.push(unquote(item[1] ?? ''))
      continue
    }
    list = undefined
    const pair = /^([\w-]+):(.*)$/.exec(line)
    if (!pair) continue
    const key = pair[1] ?? ''
    const value = (pair[2] ?? '').trim()
    const inline = /^\[(.*)\]$/.exec(value)
    if (value === '') {
      list = []
      fields[key] = list
    } else if (inline) {
      fields[key] = (inline[1] ?? '')
        .split(',')
        .map(unquote)
        .filter((entry) => entry !== '')
    } else {
      fields[key] = unquote(value)
    }
  }
  return { fields, body: text.slice(match[0].length) }
}

/**
 * The Markdown files in `dir`: the name without `.md`, the frontmatter
 * fields, and the body. A folder that cannot be read has no files.
 */
export async function readMarkdownFiles(dir: string) {
  let files: Array<string> = []
  try {
    files = (await readdir(dir)).filter((file) => extname(file) === '.md')
  } catch {
    return []
  }
  return Promise.all(
    files.map(async (file) => ({
      name: basename(file, '.md'),
      ...splitFrontmatter(await readFile(resolve(dir, file), 'utf8')),
    })),
  )
}

/**
 * One command per Markdown file in `dir` (like `.claude/commands/*.md`).
 * Running `/name args` sends the file as a prompt, with `$ARGUMENTS`
 * replaced by the args.
 */
export function fileCommands(options: { dir: string }) {
  return definePlugin({
    name: 'tanstack/file-commands',
    setup: async (ctx) => {
      const files = await readMarkdownFiles(options.dir)
      const commands: Record<string, AnyCommand> = {}
      for (const { name, fields, body } of files) {
        const { description } = fields
        commands[name] = defineCommand({
          description:
            typeof description === 'string' && description !== ''
              ? description
              : `Run ${name}.md`,
          run: (input: unknown) => {
            const args =
              typeof input === 'string'
                ? input
                : input === undefined
                  ? ''
                  : JSON.stringify(input)
            ctx.session.prompt(body.split('$ARGUMENTS').join(args).trim())
            return `Sent /${name}.`
          },
        })
      }
      return { commands }
    },
  })
}
