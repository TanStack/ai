import { toolDefinition } from '@tanstack/ai'
import { globToRegExp } from '../glob'
import {
  clip,
  hostBackend,
  optionalString,
  pathsOf,
  readText,
  stringArg,
} from './backend'
import type { ToolEnv, WorkspaceBackend } from './backend'

/** Folders that no search looks in. */
const SKIP = new Set(['.git', 'node_modules'])
/** The time limit of each search command. */
const TIMEOUT_MS = 30_000
const MAX_FILES = 1000
const MAX_MATCHES = 200
/** A matching line is cut after this many characters. */
const MAX_LINE = 2000
/** grep skips bigger files, the same as `rg --max-filesize 1M`. */
const MAX_SIZE = 1024 * 1024
// ponytail: the JS walk stops after 5000 files, and the tools say so. Raise
// it if folders without rg and without git get that big.
const MAX_WALK = 5000
/** The JS walk and grep run this many backend calls at a time. */
const PARALLEL = 16

const FILES_NOTE =
  '[Not all files are shown. Use a pattern or a folder to see fewer.]'
const MATCHES_NOTE =
  '[Not all matches are shown. Use a narrower pattern, glob, or folder.]'

/**
 * `git` with the settings that run a program turned off: no fsmonitor and no
 * hooks. The model can write the `.git/config` of the workspace, and git
 * reads it. Run it with {@link GIT_ENV}.
 */
export const GIT = 'git -c core.fsmonitor= -c core.hooksPath='
/** The env of every git command: git does not read the system config. */
export const GIT_ENV = { GIT_CONFIG_NOSYSTEM: '1' }
/** `git` applies the `.gitignore` files. `-z` ends each path with NUL. */
const GIT_FILES = `${GIT} ls-files -z --cached --others --exclude-standard`
/** rg flags for grep. One match more than shown tells that there are more. */
const RG_GREP = `--line-number --no-heading --color never --max-columns ${MAX_LINE} --max-columns-preview --max-filesize 1M --max-count ${MAX_MATCHES + 1}`

/** Characters that `cmd.exe` reads as special. */
const CMD_SPECIAL = /[()\][%!^"`<>&|;, *?]/g

/**
 * `value` as one argument of a shell command. The shell gives the value to
 * the program as it is. `platform` is the platform of the shell.
 *
 * - POSIX `sh`: the value goes in single quotes. No character is special
 *   in them. A single quote in the value becomes `'\''`.
 * - Windows `cmd.exe`: first the value is quoted for the program: a `"`
 *   gets a backslash, and the backslashes before a `"` are doubled. Then a
 *   `^` goes before each character that `cmd.exe` reads as special, the
 *   quotes too. So `cmd.exe` expands no `%VAR%` and runs no `&` or `|`.
 *   This needs delayed expansion off, which is the default. A line break
 *   cannot be passed safely, so it throws.
 *
 * @example
 * ```ts
 * quoteArg(`it's`, 'linux') // 'it'\''s'
 * quoteArg('a & b', 'win32') // ^"a^ ^&^ b^"
 * ```
 */
export function quoteArg(value: string, platform: NodeJS.Platform) {
  if (platform !== 'win32') return `'${value.replaceAll("'", `'\\''`)}'`
  if (/[\r\n]/.test(value)) {
    throw new Error('cmd.exe cannot take an argument with a line break.')
  }
  const quoted = `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`
  return quoted.replace(CMD_SPECIAL, '^$&')
}

/**
 * The platform of the shell that `backend.exec` uses, for {@link quoteArg}.
 * A backend without `shell` has a POSIX `sh`, like a Linux sandbox.
 */
export function shellPlatform(backend: WorkspaceBackend) {
  return backend.shell === 'cmd' ? 'win32' : 'linux'
}

/** The rg binary of `@vscode/ripgrep`, when that optional peer is there. */
async function bundledRg() {
  try {
    // Lazy and optional. The import throws when the binary package is missing.
    const { rgPath } = await import('@vscode/ripgrep')
    const info = await hostBackend.stat(rgPath)
    return info?.type === 'file' ? rgPath : undefined
  } catch {
    return undefined
  }
}

/** The command that starts rg on `backend`, or `undefined` without rg. */
async function findRg(backend: WorkspaceBackend) {
  // The bundled binary is a host file. A sandbox cannot run it. A bound
  // workspace is a copy of `hostBackend` with a root, so compare `exec`.
  if (backend.exec === hostBackend.exec) {
    const bundled = await bundledRg()
    if (bundled !== undefined) return quoteArg(bundled, process.platform)
  }
  const probe = await backend.exec('rg --version', { timeoutMs: TIMEOUT_MS })
  return probe.exitCode === 0 ? 'rg' : undefined
}

/** Run an rg command in `cwd`, and give its output. */
async function runRg(backend: WorkspaceBackend, command: string, cwd: string) {
  const { exitCode, stdout, stderr } = await backend.exec(command, {
    cwd,
    timeoutMs: TIMEOUT_MS,
  })
  // 1 means that rg found nothing. 2 with output means that rg could not
  // read some files, but searched the others.
  const isDone =
    exitCode === 0 || exitCode === 1 || (exitCode === 2 && stdout !== '')
  if (isDone) return stdout
  const reason =
    exitCode === 124
      ? `it took longer than ${TIMEOUT_MS / 1000} seconds, or gave too much output`
      : stderr.trim() || `exit code ${exitCode}`
  throw new Error(`The search failed: ${reason}`)
}

/** A line that grep found. `path` is from the searched folder, with `/`. */
interface Hit {
  path: string
  line: number
  text: string
}

/** `path` without the `./` that rg puts first. */
const fromDot = (path: string) => path.replace(/^\.\//, '')

/** Is `path` in a folder that no search looks in? */
const isSkipped = (path: string) =>
  path.split('/').some((part) => SKIP.has(part))

/** The paths without empty ones, skipped ones, or repeats, sorted. */
function tidy(paths: Array<string>) {
  const kept = paths
    .map(fromDot)
    .filter((path) => path !== '' && !isSkipped(path))
  return [...new Set(kept)].sort()
}

/** Sort by path only, so the lines of one file stay in order. */
const byPath = (a: Hit, b: Hit) =>
  Number(a.path > b.path) - Number(a.path < b.path)

/** A test for the paths that match `glob`. Without a glob, all match. */
function globMatcher(glob: string | undefined) {
  const regex = glob ? globToRegExp(glob) : undefined
  return (path: string) => !regex || regex.test(path)
}

/** The hits in rg output. Each line is the path, NUL, `line:text`. */
function rgHits(out: string) {
  const rows = out.split('\n')
  const hits: Array<Hit> = []
  for (const row of rows) {
    const nul = row.indexOf('\0')
    const colon = row.indexOf(':', nul)
    if (nul === -1 || colon === -1) continue
    hits.push({
      path: fromDot(row.slice(0, nul)),
      line: Number(row.slice(nul + 1, colon)),
      text: row.slice(colon + 1),
    })
  }
  return hits
}

/**
 * The files under `dir`, as paths from `dir` with `/`. Stops after MAX_WALK
 * files, and then gives one more, so the caller can tell. It skips links, so
 * it never leaves `dir`. It reads up to PARALLEL folders at a time.
 */
async function walk(backend: WorkspaceBackend, dir: string) {
  const { join } = pathsOf(backend)
  const out: Array<string> = []
  let folders = [{ dir, prefix: '' }]
  while (folders.length > 0 && out.length <= MAX_WALK) {
    const next: typeof folders = []
    for (
      let i = 0;
      i < folders.length && out.length <= MAX_WALK;
      i += PARALLEL
    ) {
      const listed = await Promise.all(
        folders.slice(i, i + PARALLEL).map(async (folder) => ({
          folder,
          entries: await backend.readdir(folder.dir),
        })),
      )
      for (const { folder, entries } of listed) {
        for (const entry of entries) {
          if (SKIP.has(entry.name) || entry.type === 'link') continue
          const path = folder.prefix + entry.name
          if (entry.type === 'dir') {
            next.push({ dir: join(folder.dir, entry.name), prefix: `${path}/` })
          } else out.push(path)
        }
      }
    }
    folders = next
  }
  return out.slice(0, MAX_WALK + 1)
}

/**
 * `files`, paths from `base` with `/`, without the links and the files in a
 * linked folder. git lists links, and git for Windows lists the files in a
 * junction. Each folder is read once. A name is compared without letter
 * case, so a case-insensitive file system cannot hide a link.
 */
async function withoutLinks(
  backend: WorkspaceBackend,
  base: string,
  files: Array<string>,
) {
  const linksIn = new Map<string, Promise<Set<string> | undefined>>()
  /** The links in `folder`, from `base`. `undefined` when it cannot be read. */
  const linksOf = (folder: string) => {
    let links = linksIn.get(folder)
    if (links === undefined) {
      links = backend.readdir(pathsOf(backend).resolve(base, folder)).then(
        (entries) =>
          new Set(
            entries
              .filter((entry) => entry.type === 'link')
              .map((entry) => entry.name.toLowerCase()),
          ),
        () => undefined,
      )
      linksIn.set(folder, links)
    }
    return links
  }
  const kept: Array<string> = []
  for (const file of files) {
    const parts = file.split('/')
    let folder = '.'
    let isLinked = false
    for (const part of parts) {
      const links = await linksOf(folder)
      // A folder that cannot be read fails closed: its files are skipped.
      if (links === undefined || links.has(part.toLowerCase())) {
        isLinked = true
        break
      }
      folder = `${folder}/${part}`
    }
    if (!isLinked) kept.push(file)
  }
  return kept
}

/** The hits of `regex` in one file. Too big and binary files have none. */
async function grepFile(
  backend: WorkspaceBackend,
  base: string,
  path: string,
  regex: RegExp,
) {
  const hits: Array<Hit> = []
  const full = pathsOf(backend).resolve(base, path)
  const info = await backend.stat(full)
  if (info?.type !== 'file' || info.size > MAX_SIZE) return hits
  const text = await readText(backend, full)
  // rg skips binary files too.
  if (text.includes('\0')) return hits
  const lines = text.split('\n')
  for (const [index, line] of lines.entries()) {
    if (!regex.test(line)) continue
    hits.push({ path, line: index + 1, text: line })
    if (hits.length > MAX_MATCHES) break
  }
  return hits
}

/**
 * grep in JS: read the files through the backend and test each line. It reads
 * up to PARALLEL files at a time, and keeps the hits in the order of `files`.
 */
async function grepFiles(
  backend: WorkspaceBackend,
  base: string,
  files: Array<string>,
  regex: RegExp,
) {
  const hits: Array<Hit> = []
  for (let i = 0; i < files.length; i += PARALLEL) {
    const found = await Promise.all(
      files
        .slice(i, i + PARALLEL)
        .map((path) => grepFile(backend, base, path, regex)),
    )
    for (const hit of found.flat()) {
      hits.push(hit)
      if (hits.length > MAX_MATCHES) return hits
    }
  }
  return hits
}

/**
 * `list_files` and `grep`. Both use the first engine that works:
 *
 * 1. The rg binary of `@vscode/ripgrep`, only with `hostBackend`.
 * 2. `rg` on the PATH of the backend.
 * 3. `git ls-files`, when the folder is in a git work tree.
 * 4. A walk through `backend.readdir`.
 *
 * rg and git skip the files that `.gitignore` names. No engine looks in
 * `.git` or `node_modules`, or gives links: rg does not follow them, and
 * the git list and the walk leave them out. The results have the same
 * shape whichever engine ran.
 *
 * With `permissions()`, grep skips the files that the rules protect (see
 * `ToolEnv.protectedIn`), and a note says how many. `list_files` shows
 * them: a name is not the contents.
 */
export function searchTools(env: ToolEnv) {
  const { backend } = env
  const { resolve } = pathsOf(backend)
  const platform = shellPlatform(backend)
  // Show hidden files, like git. End each path with NUL, and use `/`.
  const rgCommon = [
    '--no-config --hidden --null --path-separator /',
    ...[...SKIP].map((dir) => `--glob ${quoteArg(`!${dir}`, platform)}`),
  ].join(' ')
  let rg: Promise<string | undefined> | undefined
  /** The rg command. The first search finds it, and the tools keep it. */
  const findRgOnce = () => (rg ??= findRg(backend))

  /** Every file under `base`, sorted, as paths from `base` with `/`. */
  async function filesUnder(base: string) {
    const command = await findRgOnce()
    if (command !== undefined) {
      // The `.` path stops rg from reading stdin.
      const out = await runRg(backend, `${command} --files ${rgCommon} .`, base)
      return { files: tidy(out.split('\0')), partial: false }
    }
    const git = await backend.exec(GIT_FILES, {
      cwd: base,
      env: GIT_ENV,
      timeoutMs: TIMEOUT_MS,
    })
    if (git.exitCode === 0) {
      const listed = tidy(git.stdout.split('\0'))
      const files = await withoutLinks(backend, base, listed)
      return { files, partial: false }
    }
    const walked = await walk(backend, base)
    return { files: tidy(walked), partial: walked.length > MAX_WALK }
  }

  /**
   * The hits for `pattern` under `base`, in the files that `isWanted` keeps.
   * With `withFiles`, also every file under `base`, like `filesUnder(base)`.
   * The files are listed once: the JS engines search the list, and rg lists
   * and searches in one command.
   */
  async function grepUnder(
    base: string,
    pattern: string,
    isWanted: (path: string) => boolean,
    withFiles: boolean,
  ) {
    // A pattern that is not a valid JS regular expression throws here,
    // whichever engine runs.
    const regex = new RegExp(pattern)
    const command = await findRgOnce()
    if (command === undefined) {
      const { files, partial } = await filesUnder(base)
      const hits = await grepFiles(backend, base, files.filter(isWanted), regex)
      return { hits, partial, files }
    }
    const search = `${command} ${RG_GREP} ${rgCommon} -e ${quoteArg(pattern, platform)} .`
    const hitsOf = (out: string) =>
      rgHits(out)
        .filter((hit) => isWanted(hit.path))
        .sort(byPath)
    if (!withFiles) {
      const hits = hitsOf(await runRg(backend, search, base))
      return { hits, partial: false, files: undefined }
    }
    // One shell runs the list and the search, with a line between them that
    // no file name has. The exit code is the one of the search.
    const marker = `-- ${crypto.randomUUID()} --`
    const then = platform === 'win32' ? '&' : ';'
    const out = await runRg(
      backend,
      `${command} --files ${rgCommon} . ${then} echo ${marker} ${then} ${search}`,
      base,
    )
    const at = out.indexOf(marker)
    if (at === -1) throw new Error('The search failed: rg gave no file list.')
    const listing = out.slice(0, at)
    // `cmd.exe` keeps the space before `&` in the line of `echo`.
    const found = out.slice(at + marker.length).replace(/^[ \t]*\r?\n/, '')
    return {
      hits: hitsOf(found),
      partial: false,
      files: tidy(listing.split('\0')),
    }
  }

  return [
    toolDefinition({
      name: 'list_files',
      description:
        'List files in a folder (default: the workspace), optionally matching a glob like `src/**/*.ts`. The glob is from that folder. Files that .gitignore names are left out.',
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
      const isWanted = globMatcher(optionalString(args, 'pattern'))
      const { files, partial } = await filesUnder(base)
      const listed = files.filter(isWanted)
      const shown = listed
        .slice(0, MAX_FILES)
        .map((file) => env.shown(resolve(base, file)))
      const text = shown.join('\n') || 'No files.'
      const isCut = partial || listed.length > MAX_FILES
      return clip(isCut ? `${text}\n${FILES_NOTE}` : text)
    }),
    toolDefinition({
      name: 'grep',
      description:
        'Search file contents in a folder (default: the workspace) with a regular expression. Returns `file:line: text`. Files that .gitignore names are left out.',
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
      const pattern = stringArg(args, 'pattern')
      if (/[\r\n]/.test(pattern)) {
        throw new Error('The pattern must be one line. grep tests each line.')
      }
      const base = await env.reach(
        optionalString(args, 'path') ?? '.',
        'grep',
        'folder',
      )
      const inGlob = globMatcher(optionalString(args, 'glob'))
      // grep must not show the lines of a file that read_file could not
      // read without a question.
      const isProtected = await env.protectedIn?.(base)
      const isWanted = (path: string) =>
        inGlob(path) && !(isProtected?.(path) ?? false)
      const {
        hits,
        partial,
        files: listed,
      } = await grepUnder(base, pattern, isWanted, isProtected !== undefined)
      // The note counts the protected files in the list, not in the hits,
      // so it does not tell whether a protected file has the pattern.
      const skipped = isProtected
        ? (listed ?? []).filter((path) => inGlob(path) && isProtected(path))
            .length
        : 0
      const shown = hits.slice(0, MAX_MATCHES).map((hit) => {
        const text = hit.text.slice(0, MAX_LINE).trim()
        return `${env.shown(resolve(base, hit.path))}:${hit.line}: ${text}`
      })
      const lines = [shown.join('\n') || 'No matches.']
      if (partial || hits.length > MAX_MATCHES) lines.push(MATCHES_NOTE)
      if (skipped > 0) {
        const files = skipped === 1 ? '1 file' : `${skipped} files`
        lines.push(`[Skipped ${files} that the permission rules protect.]`)
      }
      return clip(lines.join('\n'))
    }),
  ]
}
