import { createPluginEvent } from '../../extensions'
import { definePlugin } from '../../plugins'
import { isRecord } from '../../utils'
import { WorkspaceHooks } from '../workspace-hooks'
import { hostBackend, pathsOf, readText } from './backend'
import { quoteArg, shellPlatform } from './search'
import type { WorkspaceBackend } from './backend'

/** What a formatter can check in the project root folder. */
export interface FormatterProject {
  /** The names of the files and folders in the root folder. */
  files: ReadonlyArray<string>
  /** The text of the file `name` in the root folder, or `''` without one. */
  read: (name: string) => Promise<string>
}

/** A formatter CLI for some file types. */
export interface Formatter {
  /** A short name, for the warning when it fails. */
  name: string
  /** The file extensions it formats, with the dot, like `'.ts'`. */
  extensions: ReadonlyArray<string>
  /**
   * The shell command that formats `file` in place. `file` is the absolute
   * path, already quoted for the shell. Put it in the command as it is.
   */
  command: (file: string) => string
  /** Does the project use this formatter? Default: yes. */
  when?: (project: FormatterProject) => boolean | Promise<boolean>
}

export interface FormatterOptions {
  /** The workspace folder. Commands run in it. */
  root: string
  /** Where the files are and commands run. Default: {@link hostBackend}. */
  backend?: WorkspaceBackend
  /** Your formatters. They come before the built-in formatters. */
  formatters?: ReadonlyArray<Formatter>
  /** `false` turns the built-in formatters off. Default: `true`. */
  builtins?: boolean
  /** The time limit of each run. Default: 20 seconds. */
  timeoutMs?: number
}

/** A formatter run that failed. The written file stays as it was. */
export interface FormatFailure {
  /** The absolute path of the file. */
  path: string
  message: string
}

/** Sent when a formatter fails. The tool call does not fail. */
export const FormatFailed = createPluginEvent<FormatFailure>(
  'tanstack/formatter:failed',
)

const SCRIPT = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']
/** The file types that prettier and oxfmt format. */
const WEB = [
  ...SCRIPT,
  ...['.json', '.jsonc', '.css', '.scss', '.less', '.html', '.vue'],
  ...['.md', '.mdx', '.yaml', '.yml', '.graphql'],
]

/** The field `key` of the project's `package.json`, or `undefined`. */
async function packageField(project: FormatterProject, key: string) {
  try {
    const value: unknown = JSON.parse(await project.read('package.json'))
    return isRecord(value) ? value[key] : undefined
  } catch {
    return undefined
  }
}

/** Does a name in the root folder start with one of the `prefixes`? */
const hasFile = (project: FormatterProject, ...prefixes: Array<string>) =>
  project.files.some((name) =>
    prefixes.some((prefix) => name.startsWith(prefix)),
  )

// ponytail: six built-in formatters. Add more with `formatters`.
const BUILTINS: ReadonlyArray<Formatter> = [
  {
    name: 'prettier',
    extensions: WEB,
    command: (file) => `npx --no-install prettier --write ${file}`,
    when: async (project) =>
      hasFile(project, '.prettierrc', 'prettier.config.') ||
      (await packageField(project, 'prettier')) !== undefined,
  },
  {
    name: 'biome',
    extensions: [...SCRIPT, '.json', '.jsonc', '.css', '.graphql'],
    command: (file) => `npx --no-install biome format --write ${file}`,
    when: (project) =>
      project.files.includes('biome.json') ||
      project.files.includes('biome.jsonc'),
  },
  {
    name: 'oxfmt',
    extensions: WEB,
    command: (file) => `npx --no-install oxfmt ${file}`,
    when: async (project) => {
      const devDependencies = await packageField(project, 'devDependencies')
      return (
        hasFile(project, '.oxfmtrc') ||
        (isRecord(devDependencies) && 'oxfmt' in devDependencies)
      )
    },
  },
  {
    name: 'ruff',
    extensions: ['.py', '.pyi'],
    command: (file) => `ruff format ${file}`,
    when: async (project) =>
      project.files.includes('ruff.toml') ||
      project.files.includes('.ruff.toml') ||
      (await project.read('pyproject.toml')).includes('[tool.ruff'),
  },
  {
    name: 'gofmt',
    extensions: ['.go'],
    command: (file) => `gofmt -w ${file}`,
    when: (project) => project.files.includes('go.mod'),
  },
  {
    name: 'rustfmt',
    extensions: ['.rs'],
    command: (file) => `rustfmt ${file}`,
    when: (project) => project.files.includes('Cargo.toml'),
  },
]

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/**
 * The `afterWrite` hook of {@link formatter}. It runs the first formatter
 * that the project uses for the file type. The project is checked at the
 * first write, once. A failure goes to `onFailure` and never throws.
 */
export function formatOnWrite(
  options: FormatterOptions,
  onFailure: (failure: FormatFailure) => void,
) {
  const backend = options.backend ?? hostBackend
  const { extname, join, resolve } = pathsOf(backend)
  const root = resolve(options.root)
  const timeoutMs = options.timeoutMs ?? 20_000
  const platform = shellPlatform(backend)
  const candidates = [
    ...(options.formatters ?? []),
    ...(options.builtins === false ? [] : BUILTINS),
  ]

  /** The formatters that the project uses, in order. */
  const detect = async () => {
    const entries = await backend.readdir(root)
    const project: FormatterProject = {
      files: entries.map((entry) => entry.name),
      read: (name) => readText(backend, join(root, name)).catch(() => ''),
    }
    const used = await Promise.all(
      candidates.map((candidate) => candidate.when?.(project) ?? true),
    )
    return candidates.filter((_, index) => used[index])
  }
  let detected: ReturnType<typeof detect> | undefined

  const format = async (path: string) => {
    const extension = extname(path).toLowerCase()
    const formatters = await (detected ??= detect())
    const match = formatters.find((candidate) =>
      candidate.extensions.includes(extension),
    )
    if (!match) return
    const command = match.command(quoteArg(path, platform))
    const result = await backend.exec(command, { cwd: root, timeoutMs })
    if (result.exitCode === 0) return
    const reason =
      result.exitCode === 124
        ? `it took longer than ${timeoutMs / 1000} seconds`
        : result.stderr.trim().split('\n')[0] || `exit code ${result.exitCode}`
    throw new Error(`${match.name} failed: ${reason}`)
  }

  return (path: string) =>
    format(path).catch((error: unknown) =>
      onFailure({ path, message: messageOf(error) }),
    )
}

/**
 * Format each file that `write_file`, `edit_file`, and `patch` write, with
 * the formatter that the project uses for its file type. Use it with
 * `workspaceTools`.
 *
 * At the first write in a session, the plugin checks the config files in
 * `root`, and keeps the result:
 *
 * - prettier: `.prettierrc*`, `prettier.config.*`, or `prettier` in
 *   `package.json`.
 * - biome: `biome.json` or `biome.jsonc`.
 * - oxfmt: `.oxfmtrc*`, or `oxfmt` in the `devDependencies`.
 * - ruff (`.py`): `ruff.toml`, or `[tool.ruff]` in `pyproject.toml`.
 * - gofmt (`.go`): `go.mod`. rustfmt (`.rs`): `Cargo.toml`.
 *
 * Your `formatters` come first. `builtins: false` turns the list above off.
 * Each run is a command through `backend.exec` in `root`, with a time limit
 * (`timeoutMs`, default 20 seconds). A formatter that fails, times out, or
 * is not installed does not fail the tool call: the file stays as written,
 * and the plugin sends a {@link FormatFailed} event.
 *
 * @example
 * ```ts
 * plugins: () => [
 *   workspaceTools({ root }),
 *   formatter({
 *     root,
 *     formatters: [
 *       { name: 'taplo', extensions: ['.toml'], command: (file) => `taplo fmt ${file}` },
 *     ],
 *   }),
 * ]
 * ```
 */
export function formatter(options: FormatterOptions) {
  return definePlugin({
    name: 'tanstack/formatter',
    setup: (ctx) => ({
      contribute: [
        WorkspaceHooks.item({
          afterWrite: formatOnWrite(options, (failure) =>
            ctx.emit(FormatFailed, failure),
          ),
        }),
      ],
    }),
  })
}
