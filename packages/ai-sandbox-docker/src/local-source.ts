/**
 * Copy a `localSource` folder into a new container, so the agent works on the
 * same files and the same git branch as on the host.
 *
 * The copy holds the files that git lists: tracked files with their
 * uncommitted changes, and untracked files that `.gitignore` keeps. The
 * history of the current branch goes in as a git bundle, so git works in the
 * container, also when the folder is a git worktree (where `.git` is a file).
 * The copy goes one way, once, when the container is created.
 */
import { randomUUID } from 'node:crypto'
import { lstat, readFile, readlink, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { hasGitDir, probeGit, runGit } from './sbx/materialize'
import { tarStream } from './tar'
import type { Stats } from 'node:fs'
import type Dockerode from 'dockerode'
import type { DockerHandle, DockerLogger } from './handle'

/** File modes in the git index (`git ls-files -s`). */
const EXECUTABLE = '100755'
const SYMLINK = '120000'

/**
 * Where the history bundle waits in the container, relative to the work dir.
 * It is in `.git`, so it never shows as an untracked file.
 */
const BUNDLE = '.git/tanstack-local-source.bundle'

const GIT_NOT_ON_PATH =
  'dockerSandbox: git is not on PATH. Install git to copy a localSource folder into the container.'

const NO_GIT_IN_IMAGE =
  'dockerSandbox: the container image has no git, so it cannot hold the history of a localSource folder. Use an image with git, such as node:24.'

/** What {@link readLocalSource} found in the folder. */
export type LocalSource = Awaited<ReturnType<typeof readLocalSource>>

/**
 * Check a localSource folder and list what to copy. This runs on the host
 * before any container work, so a bad folder fails fast.
 */
export async function readLocalSource(sourcePath: string) {
  // A relative path is relative to the process cwd, as in sbxSandbox.
  const dir = path.resolve(sourcePath)
  const isFolder = await stat(dir).then(
    (info) => info.isDirectory(),
    () => false,
  )
  if (!isFolder) {
    throw new Error(
      `dockerSandbox: the localSource path ${dir} is not a folder.`,
    )
  }
  if (!(await hasGitDir(dir))) {
    throw new Error(
      `dockerSandbox: the localSource folder ${dir} is not a Git repository. dockerSandbox copies the files that git lists and the history of the current branch, so the folder must contain .git. Run \`git init\` in it, or pass the root folder of the repository.`,
    )
  }
  // No output cap: a big repository lists many MiB of paths.
  const listFiles = async (...args: Array<string>) => {
    const output = await runGit(['ls-files', '-z', ...args], {
      cwd: dir,
      maxBuffer: Infinity,
    })
    return output.split('\0').filter(Boolean)
  }
  try {
    const tracked = await listFiles('-s')
    const untracked = await listFiles('--others', '--exclude-standard')
    // Each path, with its mode in the git index. An untracked file has none.
    const files: Map<string, string | undefined> = new Map()
    for (const record of tracked) {
      // A `-s` record is `<mode> <object> <stage>\t<path>`.
      files.set(record.slice(record.indexOf('\t') + 1), record.slice(0, 6))
    }
    for (const file of untracked) files.set(file, undefined)
    const [ref, head, autocrlf, shallow] = await Promise.all([
      // No branch when HEAD is detached.
      probeGit(['symbolic-ref', '-q', 'HEAD'], dir),
      // No commit on an unborn branch.
      probeGit(['rev-parse', '-q', '--verify', 'HEAD'], dir),
      probeGit(['config', 'core.autocrlf'], dir),
      probeGit(['rev-parse', '--is-shallow-repository'], dir),
    ])
    if (shallow === 'true') {
      throw new Error(
        `dockerSandbox: the localSource folder ${dir} is a shallow clone. dockerSandbox sends the history of the current branch as a git bundle, and a bundle needs the full history. Run \`git fetch --unshallow\` in it.`,
      )
    }
    return { dir, files, ref, head, autocrlf }
  } catch (error) {
    if (isMissing(error)) throw new Error(GIT_NOT_ON_PATH)
    throw error
  }
}

/**
 * Copy the folder into the container work dir and set up git there: the same
 * branch at the same commit, so `git status` shows the uncommitted changes of
 * the host. Staged changes show as unstaged. Call it for a new container only.
 */
export async function copyLocalSource(
  source: LocalSource,
  target: {
    container: Dockerode.Container
    handle: DockerHandle
    logger?: DockerLogger
    signal?: AbortSignal
  },
) {
  const { container, handle, logger, signal } = target
  const { ref, head } = source
  const upload = (bundleFile?: string) =>
    container.putArchive(
      tarStream(archiveEntries(source, bundleFile, logger)),
      {
        path: handle.workspaceRoot,
        ...(signal ? { abortSignal: signal } : {}),
      },
    )
  // git init runs first, so an image without git fails before the upload.
  await runInContainer(handle, initCommand(source))
  // An unborn branch has no commits, so there is no history to send.
  if (head === undefined) {
    await upload()
    return
  }
  // A temp file, not stdout, so the history never goes through a string.
  const bundleFile = path.join(
    tmpdir(),
    `tanstack-local-source-${randomUUID()}.bundle`,
  )
  try {
    await runGit(['bundle', 'create', bundleFile, ref ?? 'HEAD'], {
      cwd: source.dir,
    })
    await upload(bundleFile)
    await runInContainer(handle, historyCommand(ref, head))
  } finally {
    // A failed copy removes the container, and the bundle in it, so only the
    // host file needs removing here.
    await rm(bundleFile, { force: true })
  }
}

/** `git init`, plus the line-ending setting and the branch of the host. */
function initCommand(source: LocalSource) {
  const steps = ['git init -q']
  // core.autocrlf made the line endings of the copied files (Git for Windows
  // sets it), so git in the container must read them the same way.
  if (source.autocrlf !== undefined) {
    steps.push(`git config core.autocrlf ${q(source.autocrlf)}`)
  }
  // HEAD names the branch from now on. An unborn branch stays unborn.
  if (source.ref !== undefined) {
    steps.push(`git symbolic-ref HEAD ${q(source.ref)}`)
  }
  return steps.join(' && ')
}

/**
 * Fetch the bundle and point HEAD at the commit of the host. A mixed reset
 * makes the index match HEAD and keeps the copied files as they are.
 */
function historyCommand(ref: string | undefined, head: string) {
  // HEAD already names the branch (see initCommand), so the reset creates
  // that branch at the commit.
  if (ref !== undefined) {
    return `git fetch -q ${BUNDLE} ${q(ref)} && git reset -q ${head} && rm -f ${BUNDLE}`
  }
  // A detached HEAD: the bundle holds HEAD only.
  return `git fetch -q ${BUNDLE} HEAD && git update-ref --no-deref HEAD ${head} && git reset -q && rm -f ${BUNDLE}`
}

/** Run a command in the container work dir, and throw when it fails. */
async function runInContainer(handle: DockerHandle, command: string) {
  const result = await handle.process.exec(command)
  // sh exits 127 when it cannot find a program, and that program is git here.
  if (result.exitCode === 127) throw new Error(NO_GIT_IN_IMAGE)
  if (result.exitCode !== 0) {
    throw new Error(
      `dockerSandbox: \`${command}\` failed in the container (exit ${result.exitCode}): ${result.stderr.trim()}`,
    )
  }
}

/**
 * The archive: the bundle when there is one, then each listed file as it is
 * on disk now. It reads one file at a time, so the repository is never all in
 * memory.
 */
async function* archiveEntries(
  source: LocalSource,
  bundleFile: string | undefined,
  logger: DockerLogger | undefined,
) {
  // ponytail: each file, and the bundle, is in memory whole while it streams,
  // because tarStream takes Buffers. Stream from disk if huge files matter.
  if (bundleFile !== undefined) {
    yield { path: BUNDLE, mode: 0o644, data: await readFile(bundleFile) }
  }
  for (const [file, indexMode] of source.files) {
    const fullPath = path.join(source.dir, file)
    const stats = await lstat(fullPath).catch((error: unknown) => {
      // git still lists a tracked file that is deleted in the working tree.
      if (isMissing(error)) return undefined
      throw error
    })
    if (stats === undefined) continue
    if (stats.isDirectory()) {
      // git lists a submodule, or a nested repository, as one folder.
      logger?.warn(
        `docker: localSource did not copy ${file}: submodules and nested repositories are not copied`,
        { path: file },
      )
      continue
    }
    if (stats.isSymbolicLink()) {
      const linkTarget = await readlink(fullPath)
      // Git for Windows writes link targets with `\`. The container needs `/`.
      yield {
        path: file,
        linkTarget:
          process.platform === 'win32'
            ? linkTarget.replaceAll('\\', '/')
            : linkTarget,
      }
      continue
    }
    const data = await readFile(fullPath)
    // Without symlink support (the Windows default), git checks a link out as
    // a plain file that holds the link target.
    if (indexMode === SYMLINK) yield { path: file, linkTarget: data.toString() }
    else yield { path: file, mode: fileMode(indexMode, stats), data }
  }
}

/**
 * A tracked file gets its mode from the git index, so only the exec bit
 * counts. An untracked file keeps its disk mode, except on Windows, where the
 * disk has no exec bit.
 */
function fileMode(indexMode: string | undefined, stats: Stats) {
  if (indexMode === EXECUTABLE) return 0o755
  if (indexMode !== undefined || process.platform === 'win32') return 0o644
  return stats.mode
}

/** POSIX single-quote escape, for a branch name or a config value in `sh -c`. */
function q(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** ENOENT: a program that is not on PATH, or a path that is not there. */
function isMissing(error: unknown) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
