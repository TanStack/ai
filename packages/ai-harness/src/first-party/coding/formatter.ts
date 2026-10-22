import { createHash, randomUUID } from 'node:crypto'
import { createPluginEvent } from '../../extensions'
import { definePlugin } from '../../plugins'
import { isRecord } from '../../utils'
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
  readText,
  stringArg,
} from './backend'
import { FormatterRewrote } from './events'
import { patchPaths } from './patch'
import { quoteArg, shellPlatform } from './search'
import { ThreadWorkspace, writingRun } from './workspace'
import type { RunContext } from '../../types'
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
  /**
   * The workspace folder. Commands run in it. Not needed when
   * `workspaceTools()` with `workspace.bind` comes before this plugin: then
   * each thread uses the workspace that `bind` gave it, and `root` and
   * `backend` are not used.
   */
  root?: string
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

/** The files that one call writes, by path, with their new text when it is known. */
export type WrittenFiles = ReadonlyMap<string, string | undefined>

/**
 * The formatters of a project: the `afterWrite` hook that runs them, and
 * the names of the formatters that a call can run, for the permission
 * rules before the call.
 *
 * The hook runs the first formatter that the project uses for the file
 * type. The project is checked at the first write, once.
 *
 * - `onFailure` gets a failure. The hook never throws.
 * - `onRewrite` gets the file and the formatter when a run changed the file.
 * - `allow` says if the formatter `name` can run on `path`. When it says no,
 *   the hook resolves to a note for the tool result.
 */
export function projectFormatters(
  options: FormatterOptions & { root: string },
  report: {
    onFailure: (failure: FormatFailure) => void
    onRewrite?: (rewrite: { path: string; formatter: string }) => void
    allow?: (name: string, path: string) => Promise<boolean>
  },
) {
  const { onFailure, onRewrite, allow } = report
  const backend = options.backend ?? hostBackend
  const { dirname, extname, join, resolve } = pathsOf(backend)
  const root = resolve(options.root)
  const timeoutMs = options.timeoutMs ?? 20_000
  const platform = shellPlatform(backend)
  const candidates = [
    ...(options.formatters ?? []),
    ...(options.builtins === false ? [] : BUILTINS),
  ]

  /** The files of `written` in the root folder, by name. */
  const topOf = (written: WrittenFiles) =>
    new Map(
      [...written]
        .filter(([path]) => dirname(path) === root)
        .map(([path, text]) => [path.slice(root.length + 1), text] as const),
    )

  /**
   * The formatters that the project uses, in order. With `written`, as the
   * project is after a call writes those files. A formatter whose check
   * reads a written file with no known text counts as used.
   */
  const detect = async (written: WrittenFiles = new Map()) => {
    const entries = await backend.readdir(root)
    const top = topOf(written)
    const names = entries.map((entry) => entry.name)
    const used = await Promise.all(
      candidates.map(async (candidate) => {
        let readsUnknown = false
        const project: FormatterProject = {
          files: [...new Set([...names, ...top.keys()])],
          read: async (name) => {
            if (!top.has(name)) {
              return readText(backend, join(root, name)).catch(() => '')
            }
            const text = top.get(name)
            if (text === undefined) readsUnknown = true
            return text ?? ''
          },
        }
        const isUsed = (await candidate.when?.(project)) ?? true
        return isUsed || readsUnknown
      }),
    )
    return candidates.filter((_, index) => used[index])
  }
  let detected: ReturnType<typeof detect> | undefined
  /** The project check of the first write, kept. A failed check is not kept. */
  const known = () =>
    (detected ??= detect().catch((error: unknown) => {
      detected = undefined
      throw error
    }))

  /** The formatters of `formatters` for the file type of `path`. */
  const matching = (formatters: ReadonlyArray<Formatter>, path: string) => {
    const extension = extname(path).toLowerCase()
    return formatters.filter((candidate) =>
      candidate.extensions.includes(extension),
    )
  }

  const format = async (path: string) => {
    const [match] = matching(await known(), path)
    if (!match) return
    if (allow && !(await allow(match.name, path))) {
      return `The formatter ${match.name} did not run: it is not allowed.`
    }
    const command = match.command(quoteArg(path, platform))
    // The bytes before the run, to tell if the formatter changed the file.
    // A file that cannot be read gives no rewrite event, and no failure.
    const read = () => backend.readFile(path).catch(() => undefined)
    const before = onRewrite && (await read())
    const result = await backend.exec(command, { cwd: root, timeoutMs })
    if (result.exitCode === 0) {
      if (!onRewrite || !before) return undefined
      const after = await read()
      const isChanged =
        after !== undefined && !Buffer.from(before).equals(after)
      if (isChanged) onRewrite({ path, formatter: match.name })
      return undefined
    }
    const reason =
      result.exitCode === 124
        ? `it took longer than ${timeoutMs / 1000} seconds`
        : result.stderr.trim().split('\n')[0] || `exit code ${result.exitCode}`
    throw new Error(`${match.name} failed: ${reason}`)
  }

  /**
   * A hash of the config of the formatter `name`: the files in the root
   * folder with the name of the formatter in their name, like
   * `prettier.config.js`, and the files that its check reads, like
   * `package.json`. With `written`, as the files are after a call writes
   * them. A written config file with no known text gives a new random value,
   * so no saved answer matches it.
   *
   * A write of such a file below the root folder, or of any file under
   * `node_modules`, gives `unsaved:<random>`: the formatter can load that
   * code, and the root hash does not see it, so the user is asked again.
   */
  const configHash = async (name: string, written: WrittenFiles) => {
    const candidate = candidates.find((each) => each.name === name)
    const top = topOf(written)
    const entries = await backend.readdir(root)
    const files = [
      ...new Set([...entries.map((each) => each.name), ...top.keys()]),
    ]
    const textOf = (file: string) =>
      top.has(file)
        ? Promise.resolve(top.get(file))
        : readText(backend, join(root, file)).catch(() => '')
    const read = new Set<string>()
    await candidate?.when?.({
      files,
      read: async (file) => {
        read.add(file)
        return (await textOf(file)) ?? ''
      },
    })
    const lower = name.toLowerCase()
    const isUnsaved = [...written.keys()].some((path) => {
      const parts = path.split(/[\\/]/)
      const file = (parts.at(-1) ?? '').toLowerCase()
      const isConfig = file.includes(lower) || read.has(file)
      return (
        parts.includes('node_modules') || (isConfig && dirname(path) !== root)
      )
    })
    if (isUnsaved) return `unsaved:${randomUUID()}`
    const config = [
      ...new Set([
        ...files.filter((file) => file.toLowerCase().includes(lower)),
        ...read,
      ]),
    ].sort()
    const hash = createHash('sha256')
    for (const file of config) {
      const text = await textOf(file)
      if (text === undefined) return randomUUID()
      hash.update(`${file}\0${text}\0`)
    }
    return hash.digest('hex').slice(0, 16)
  }

  return {
    configHash,
    afterWrite: (path: string) =>
      format(path).catch((error: unknown) =>
        onFailure({ path, message: messageOf(error) }),
      ),
    /**
     * The names of the formatters that can run after a call writes
     * `written`: each one that the project uses now, or after the write,
     * for the type of a written file. Before the first write, the project
     * check is not kept, so that write checks the project again.
     */
    formattersFor: async (written: WrittenFiles) => {
      // A project that cannot be read counts as one that uses them all, so
      // no formatter runs that the rules did not decide.
      const all = () => candidates
      const before = await (detected ?? detect()).catch(all)
      const after = await detect(written).catch(all)
      const names = [...written.keys()].flatMap((path) =>
        matching([...before, ...after], path).map((each) => each.name),
      )
      return [...new Set(names)]
    },
  }
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
 * With `workspaceTools()` and `workspace.bind` before it, the formatters of
 * each thread run in the workspace that `bind` gave it, and `root` and
 * `backend` are not used.
 *
 * Your `formatters` come first. `builtins: false` turns the list above off.
 * Each run is a command through `backend.exec` in `root`, with a time limit
 * (`timeoutMs`, default 20 seconds). A formatter that fails, times out, or
 * is not installed does not fail the tool call: the file stays as written,
 * and the plugin sends a {@link FormatFailed} event. A run that changes the
 * file sends a `tanstack/formatter:rewrote` event (`FormatterRewrote`).
 *
 * A formatter runs code from the project, like its config files. So with
 * `permissions()`, each run is a command named `formatter:<name>`, for
 * example `formatter:prettier`. It asks like `bash`, also in `acceptEdits`
 * mode. The rules decide it with the call that writes, before the call
 * runs: one approval covers the write and its formatter, and the formatter
 * runs after the write, when the file lock is free. A rule that denies the
 * formatter skips it, keeps the write, and the tool result says so.
 * Without `permissions()`, the formatter runs without a question.
 *
 * An `always` answer is tied to the formatter config. The call also names
 * `formatter:<name>@<hash>`, with a hash of the config files in `root`:
 * the files with the formatter name in their name (like
 * `prettier.config.js` or `.prettierrc`), and the files that its check
 * reads (like `package.json`). When they change, the next write asks
 * again. A rule for `formatter:<name>` that allows or denies still decides
 * alone.
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
    optionalRequires: [PermissionDecisionCapability, ThreadWorkspace],
    setup: (ctx) => {
      // `workspaceTools()` before this plugin gives it. With `workspace.bind`,
      // each thread has its own workspace, and the formatters run there.
      const threads = ctx.getOptional(ThreadWorkspace)
      const perThread = threads?.perThread === true
      if (!perThread && options.root === undefined) {
        throw new Error(
          'formatter() needs root, or workspaceTools() with workspace.bind before it.',
        )
      }
      const mode = () => {
        const value = ctx.config.get('mode')
        return PERMISSION_MODES.find((each) => each === value) ?? 'default'
      }
      const report = {
        onFailure: (failure: FormatFailure) => ctx.emit(FormatFailed, failure),
        onRewrite: (rewrite: { path: string; formatter: string }) =>
          ctx.emit(FormatterRewrote, rewrite),
        // The rules decided the call before it ran, with the formatters
        // that it can run (see `actions` below). So only a deny stops a
        // formatter here. Read at each write, so permissions() can come
        // after this plugin.
        allow: async (name: string) => {
          const decide = ctx.getOptional(PermissionDecisionCapability)
          return decide?.(`formatter:${name}`, mode()) !== 'deny'
        },
      }
      /** The formatters of a workspace, by its backend and its root. */
      const known = new WeakMap<
        WorkspaceBackend,
        Map<string, ReturnType<typeof projectFormatters>>
      >()
      const formattersOf = (backend: WorkspaceBackend, folder: string) => {
        const paths = pathsOf(backend)
        const root = paths.resolve(folder)
        const byRoot =
          known.get(backend) ??
          new Map<string, ReturnType<typeof projectFormatters>>()
        known.set(backend, byRoot)
        const found =
          byRoot.get(root) ??
          projectFormatters({ ...options, root, backend }, report)
        byRoot.set(root, found)
        return { formatters: found, paths, root }
      }
      // One workspace for every thread: its formatters are known now.
      const fixed =
        !perThread && options.root !== undefined
          ? formattersOf(options.backend ?? hostBackend, options.root)
          : undefined
      /**
       * The formatters of the workspace of `run`. Without a run (the rules
       * before a call), the workspace of the thread of the session, which
       * is bound before its first turn.
       */
      const workspaceOf = async (run: RunContext | undefined) => {
        if (fixed) return fixed
        const workspace = run
          ? await threads?.of(run)
          : threads?.bound(ctx.session.threadId)
        if (!workspace) {
          throw new Error('The workspace of this thread is not bound yet.')
        }
        return formattersOf(workspace, workspace.root)
      }
      /** The working folder of `place`, as `workspaceTools` reads it. */
      const here = ({ paths, root }: ReturnType<typeof formattersOf>) => {
        const cwd = ctx.session.threadSettings().cwd
        return cwd ? paths.resolve(root, cwd) : root
      }
      /**
       * The formatter actions of a call that writes `written`. When the
       * rules ask for a formatter, the call gets a second action with a
       * hash of the formatter config, `formatter:<name>@<hash>`. An
       * `always` answer saves both, so a changed config, like a new
       * `prettier.config.js`, asks again. A write of a config below the
       * root, or under `node_modules`, asks each time (see `configHash`).
       */
      const actionsOf = async (
        written: ReadonlyArray<readonly [string, string | undefined]>,
      ) => {
        const place = await workspaceOf(undefined)
        const { formatters, paths } = place
        const files = new Map(
          written.map(([path, text]) => [
            paths.resolve(here(place), path),
            text,
          ]),
        )
        const names = await formatters.formattersFor(files)
        const decide = ctx.getOptional(PermissionDecisionCapability)
        const actions = await Promise.all(
          names.map(async (name) => {
            const action = `formatter:${name}`
            // A rule that allows or denies the formatter decides it alone.
            if (decide?.(action, mode()) !== 'ask') return [action]
            // A config that cannot be read matches no saved answer.
            const hash = await formatters
              .configHash(name, files)
              .catch(() => randomUUID())
            return [action, `${action}@${hash}`]
          }),
        )
        return actions.flat()
      }
      return {
        contribute: [
          WorkspaceHooks.item({
            // The write goes to the workspace of the run that wrote it.
            afterWrite: async (path) => {
              const run = writingRun()
              const place = await workspaceOf(run).catch(() => undefined)
              return place?.formatters.afterWrite(path)
            },
          }),
          PermissionRules.item({
            tool: 'formatter:*',
            decision: 'ask',
            kind: 'execute',
          }),
          // The rules decide the formatter with the call that writes,
          // before the call runs, so no question waits after the write.
          PermissionResources.item({
            write_file: {
              actions: (input) =>
                actionsOf([
                  [stringArg(input, 'path'), optionalString(input, 'content')],
                ]),
            },
            edit_file: {
              actions: (input) =>
                actionsOf([[stringArg(input, 'path'), undefined]]),
            },
            patch: {
              actions: (input) =>
                actionsOf(
                  patchPaths(stringArg(input, 'patch')).map(
                    (path) => [path, undefined] as const,
                  ),
                ),
            },
          }),
        ],
      }
    },
  })
}
