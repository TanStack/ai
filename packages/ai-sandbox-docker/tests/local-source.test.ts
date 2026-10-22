/**
 * The localSource copy, with no Docker daemon.
 *
 * The daemon is faked at its two calls, `container.exec` and
 * `container.putArchive`, and the container is a temp folder on the host:
 * `putArchive` extracts the archive into it, and `exec` runs the `sh -c`
 * command in it. So the git commands meant for the container run against
 * real git, and a test can compare `git status` with the host. The handle,
 * its stream demuxing, and the tar writer are the real ones.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { pathToFileURL } from 'node:url'
import Dockerode from 'dockerode'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineWorkspace, localSource } from '@tanstack/ai-sandbox'
import { DockerHandle } from '../src/handle'
import { copyLocalSource, readLocalSource } from '../src/local-source'
import { dockerSandbox } from '../src/provider'
import type { DockerLogger } from '../src/handle'

const WORKDIR = '/workspace'
const BUNDLE = '.git/tanstack-local-source.bundle'

const scratch: Array<string> = []

beforeEach(() => {
  // Ignore the git config of this machine (Git for Windows sets core.autocrlf
  // for the whole system), so a test means the same on every host.
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null')
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(
    scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function tempDir(prefix: string) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix))
  scratch.push(dir)
  return dir
}

function git(cwd: string, ...args: Array<string>) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

/** A repository on branch `main`, with one commit of `files`. */
async function makeRepo(files: Record<string, string>) {
  const dir = await tempDir('local-source-repo-')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 't@t.test')
  git(dir, 'config', 'user.name', 't')
  for (const [file, text] of Object.entries(files)) {
    const fullPath = path.join(dir, file)
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, text)
  }
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'init')
  return dir
}

/** One archive member, as a tar reader sees it. */
interface ReadEntry {
  path: string
  /** `0` for a file, `2` for a symlink. */
  type: string
  mode: number
  linkTarget: string
  data: Buffer
}

/** A tiny tar reader: ustar headers, and PAX `path` and `linkpath` records. */
function readTar(archive: Buffer) {
  const entries: Array<ReadEntry> = []
  let pax = new Map<string, string>()
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every((byte) => byte === 0)) break
    // A text field ends at its first NUL, or fills the whole field.
    const field = (start: number, length: number) => {
      const value = header.subarray(start, start + length)
      const end = value.indexOf(0)
      return value.toString('utf8', 0, end === -1 ? length : end)
    }
    const size = parseInt(field(124, 12), 8)
    const data = archive.subarray(offset + 512, offset + 512 + size)
    offset += 512 + Math.ceil(size / 512) * 512
    const type = field(156, 1)
    if (type === 'x') {
      pax = readPax(data)
      continue
    }
    entries.push({
      path: pax.get('path') ?? field(0, 100),
      type,
      mode: parseInt(field(100, 8), 8),
      linkTarget: pax.get('linkpath') ?? field(157, 100),
      data,
    })
    pax = new Map()
  }
  return entries
}

/** PAX records are `<length> <key>=<value>\n`. The length counts itself. */
function readPax(data: Buffer) {
  const records = new Map<string, string>()
  let offset = 0
  while (offset < data.length) {
    const space = data.indexOf(' ', offset)
    const length = Number(data.toString('utf8', offset, space))
    const record = data.toString('utf8', space + 1, offset + length - 1)
    const equals = record.indexOf('=')
    records.set(record.slice(0, equals), record.slice(equals + 1))
    offset += length
  }
  return records
}

/** What a finished exec reports. The handle reads only `ExitCode`. */
const EXEC_INFO: Dockerode.ExecInspectInfo = {
  CanRemove: false,
  DetachKeys: '',
  ID: 'fake-exec',
  Running: false,
  ExitCode: 0,
  ProcessConfig: {
    privileged: false,
    user: '',
    tty: false,
    entrypoint: 'sh',
    arguments: ['-c'],
  },
  OpenStdin: false,
  OpenStderr: true,
  OpenStdout: true,
  ContainerID: 'fake-container',
  Pid: 0,
}

/** How the fake container runs one `sh -c` command. */
type Run = (
  command: string,
  cwd: string,
) => { status: number | null; stdout: Buffer; stderr: Buffer }

/** Run the command in the host folder. Env from the handle is not used. */
const runOnHost: Run = (command, cwd) =>
  spawnSync('sh', ['-c', command], { cwd })

/** One stdout (1) or stderr (2) frame of a Docker exec stream. */
function frame(stream: 1 | 2, data: Buffer) {
  const header = Buffer.alloc(8)
  header.writeUInt8(stream, 0)
  header.writeUInt32BE(data.length, 4)
  return Buffer.concat([header, data])
}

/** A container whose file system is a temp folder on the host. */
async function folderContainer(run: Run = runOnHost) {
  const root = await tempDir('local-source-container-')
  const hostPath = (containerPath: string) => path.join(root, containerPath)
  // Docker makes the work dir when it creates the container.
  await mkdir(hostPath(WORKDIR))
  const docker = new Dockerode()
  const container = docker.getContainer('fake-container')
  const commands: Array<string> = []
  const archives: Array<{ path: string; entries: Array<ReadEntry> }> = []

  container.exec = (options: Dockerode.ExecCreateOptions) => {
    // `Cmd` is `['sh', '-c', <command>]`.
    const command = options.Cmd?.[2] ?? ''
    commands.push(command)
    const result = run(command, hostPath(options.WorkingDir ?? WORKDIR))
    const stream = new PassThrough()
    const output = Buffer.concat([
      frame(1, result.stdout),
      frame(2, result.stderr),
    ])
    setImmediate(() => stream.end(output))
    const exec = new Dockerode.Exec(docker.modem, 'fake-exec')
    exec.start = () => Promise.resolve(stream)
    exec.inspect = () =>
      Promise.resolve({ ...EXEC_INFO, ExitCode: result.status })
    return Promise.resolve(exec)
  }

  container.putArchive = async (
    file: string | Buffer | NodeJS.ReadableStream,
    options: object,
  ) => {
    if (typeof file === 'string' || Buffer.isBuffer(file)) {
      throw new Error('expected a tar stream')
    }
    if (!('path' in options) || typeof options.path !== 'string') {
      throw new Error('expected a path')
    }
    const archivePath = options.path
    const entries = readTar(await buffer(file))
    archives.push({ path: archivePath, entries })
    for (const entry of entries) {
      // Links stay in `archives` only: a Windows test host cannot make them.
      if (entry.type !== '0') continue
      const dest = path.join(hostPath(archivePath), entry.path)
      await mkdir(path.dirname(dest), { recursive: true })
      await writeFile(dest, entry.data, { mode: entry.mode })
    }
    return new PassThrough()
  }

  const handle = new DockerHandle({
    docker,
    container,
    workdir: WORKDIR,
    forkFactory: () => Promise.reject(new Error('not used')),
    removeOnDestroy: false,
  })
  return { container, handle, commands, archives, workdir: hostPath(WORKDIR) }
}

/** Read `dir` on the host and copy it into a new folder container. */
async function copy(
  dir: string,
  options: { run?: Run; logger?: DockerLogger } = {},
) {
  const fake = await folderContainer(options.run)
  await copyLocalSource(await readLocalSource(dir), {
    container: fake.container,
    handle: fake.handle,
    logger: options.logger,
  })
  return fake
}

describe('localSource copy into a container', () => {
  it('copies the files and the branch, so git status matches the host', async () => {
    const repo = await makeRepo({
      '.gitignore': 'secret.env\n',
      'README.md': 'hi\n',
      'gone.txt': 'x\n',
      'src/index.ts': 'export {}\n',
    })
    await writeFile(path.join(repo, 'README.md'), 'changed\n')
    await rm(path.join(repo, 'gone.txt'))
    await writeFile(path.join(repo, 'notes.txt'), 'untracked\n')
    await writeFile(path.join(repo, 'secret.env'), 'TOKEN=1\n')
    // Guard the guard: the host has the changes that the copy must keep.
    expect(git(repo, 'status', '--porcelain')).toBe(
      ' M README.md\n D gone.txt\n?? notes.txt\n',
    )

    const fake = await copy(repo)

    // The history, the tracked files that exist, and the untracked file. Not
    // the deleted file, and not the ignored file.
    expect(
      fake.archives.map((archive) => ({
        path: archive.path,
        files: archive.entries.map((entry) => entry.path),
      })),
    ).toEqual([
      {
        path: '/workspace',
        files: [BUNDLE, '.gitignore', 'README.md', 'src/index.ts', 'notes.txt'],
      },
    ])
    expect(git(fake.workdir, 'status', '--porcelain')).toBe(
      ' M README.md\n D gone.txt\n?? notes.txt\n',
    )
    expect(await readFile(path.join(fake.workdir, 'README.md'), 'utf8')).toBe(
      'changed\n',
    )
    expect(git(fake.workdir, 'symbolic-ref', 'HEAD')).toBe('refs/heads/main\n')
    expect(git(fake.workdir, 'rev-parse', 'HEAD')).toBe(
      git(repo, 'rev-parse', 'HEAD'),
    )
    await expect(stat(path.join(fake.workdir, BUNDLE))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('keeps the exec bit, a long path, and a symlink', async () => {
    const longPath = `${'d'.repeat(60)}/${'f'.repeat(60)}.txt`
    const repo = await makeRepo({
      [longPath]: 'deep\n',
      'run.sh': '#!/bin/sh\n',
      'target.txt': 'target\n',
    })
    // Through the index, so the fixture is the same on a disk with no exec
    // bit and no symlinks.
    git(repo, 'update-index', '--chmod=+x', 'run.sh')
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
      cwd: repo,
      input: 'target.txt',
      encoding: 'utf8',
    }).trim()
    git(repo, 'update-index', '--add', '--cacheinfo', `120000,${blob},link`)
    git(repo, 'commit', '-q', '-m', 'exec bit and link')
    // A real symlink, or a plain file that holds the target without symlinks.
    git(repo, 'checkout', '--', 'link')
    await writeFile(path.join(repo, 'local.sh'), 'echo hi\n', { mode: 0o700 })

    const fake = await copy(repo)

    const entries = fake.archives[0]?.entries ?? []
    const entry = (file: string) => entries.find((e) => e.path === file)
    expect(entry('run.sh')).toMatchObject({
      type: '0',
      mode: 0o755,
      data: Buffer.from('#!/bin/sh\n'),
    })
    expect(entry('target.txt')).toMatchObject({ type: '0', mode: 0o644 })
    expect(entry(longPath)).toMatchObject({
      type: '0',
      data: Buffer.from('deep\n'),
    })
    expect(entry('link')).toMatchObject({ type: '2', linkTarget: 'target.txt' })
    // An untracked file keeps its disk mode. Windows has no exec bit.
    expect(entry('local.sh')).toMatchObject({
      type: '0',
      mode: process.platform === 'win32' ? 0o644 : 0o700,
    })
  })

  it('copies a git worktree, where .git is a file', async () => {
    const repo = await makeRepo({ 'README.md': 'hi\n' })
    const worktree = path.join(await tempDir('local-source-worktree-'), 'wt')
    git(repo, 'worktree', 'add', '-q', '-b', 'feature/wt', worktree)
    await writeFile(path.join(worktree, 'README.md'), 'edited\n')
    expect((await stat(path.join(worktree, '.git'))).isFile()).toBe(true)

    const fake = await copy(worktree)

    expect(git(fake.workdir, 'status', '--porcelain')).toBe(' M README.md\n')
    expect(git(fake.workdir, 'symbolic-ref', 'HEAD')).toBe(
      'refs/heads/feature/wt\n',
    )
    expect(git(fake.workdir, 'rev-parse', 'HEAD')).toBe(
      git(repo, 'rev-parse', 'HEAD'),
    )
  })

  it('detaches HEAD at the same commit when HEAD on the host is detached', async () => {
    const repo = await makeRepo({ 'README.md': 'hi\n' })
    await writeFile(path.join(repo, 'second.txt'), 'two\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'second')
    git(repo, 'checkout', '-q', '--detach', 'HEAD~1')

    const fake = await copy(repo)

    expect(git(fake.workdir, 'rev-parse', 'HEAD')).toBe(
      git(repo, 'rev-parse', 'HEAD'),
    )
    // symbolic-ref exits 1 when HEAD is detached.
    expect(
      spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: fake.workdir })
        .status,
    ).toBe(1)
    expect(git(fake.workdir, 'status', '--porcelain')).toBe('')
  })

  it('sends no history for an unborn branch, and only runs git init', async () => {
    const repo = await tempDir('local-source-unborn-')
    git(repo, 'init', '-q', '-b', 'main')
    await writeFile(path.join(repo, 'a.txt'), 'a\n')

    const fake = await copy(repo)

    expect(fake.commands).toEqual([
      `git init -q && git symbolic-ref HEAD 'refs/heads/main'`,
    ])
    expect(
      fake.archives.map((archive) => archive.entries.map((e) => e.path)),
    ).toEqual([['a.txt']])
    expect(git(fake.workdir, 'status', '--porcelain')).toBe('?? a.txt\n')
  })

  it('runs git init, fetch, and reset, with core.autocrlf when the host sets it', async () => {
    const repo = await makeRepo({ 'README.md': 'hi\n' })
    git(repo, 'config', 'core.autocrlf', 'input')
    const head = git(repo, 'rev-parse', 'HEAD').trim()

    const fake = await copy(repo)

    expect(fake.commands).toEqual([
      `git init -q && git config core.autocrlf 'input' && git symbolic-ref HEAD 'refs/heads/main'`,
      `git fetch -q ${BUNDLE} 'refs/heads/main' && git reset -q ${head} && rm -f ${BUNDLE}`,
    ])
    expect(git(fake.workdir, 'config', 'core.autocrlf')).toBe('input\n')
  })

  it('skips a submodule and a nested repository, with a warning for each', async () => {
    const repo = await makeRepo({ 'README.md': 'hi\n' })
    // A submodule: a gitlink in the index, and its folder on disk.
    const commit = git(repo, 'rev-parse', 'HEAD').trim()
    git(repo, 'update-index', '--add', '--cacheinfo', `160000,${commit},lib`)
    git(repo, 'commit', '-q', '-m', 'submodule')
    await mkdir(path.join(repo, 'lib'))
    // A nested repository: git lists it as one untracked folder.
    const nested = path.join(repo, 'nested')
    await mkdir(nested)
    git(nested, 'init', '-q')
    await writeFile(path.join(nested, 'inner.txt'), 'inner\n')
    const warnings: Array<Parameters<DockerLogger['warn']>> = []

    const fake = await copy(repo, {
      logger: { warn: (...args) => warnings.push(args) },
    })

    expect(fake.archives[0]?.entries.map((e) => e.path)).toEqual([
      BUNDLE,
      'README.md',
    ])
    expect(warnings).toEqual([
      [
        'docker: localSource did not copy lib: submodules and nested repositories are not copied',
        { path: 'lib' },
      ],
      [
        'docker: localSource did not copy nested/: submodules and nested repositories are not copied',
        { path: 'nested/' },
      ],
    ])
  })

  it('fails for a path that is not a folder', async () => {
    const missing = path.join(await tempDir('local-source-'), 'missing')
    await expect(readLocalSource(missing)).rejects.toThrow(
      `dockerSandbox: the localSource path ${missing} is not a folder.`,
    )
  })

  it('fails with a clear error for a shallow clone', async () => {
    const repo = await makeRepo({ 'a.txt': 'one\n' })
    await writeFile(path.join(repo, 'a.txt'), 'two\n')
    git(repo, 'commit', '-q', '-am', 'second')
    const shallow = path.join(await tempDir('local-source-shallow-'), 'clone')
    // A file:// URL, so git makes a real shallow clone of a local repo.
    git(repo, 'clone', '-q', '--depth', '1', pathToFileURL(repo).href, shallow)
    await expect(readLocalSource(shallow)).rejects.toThrow(
      `dockerSandbox: the localSource folder ${shallow} is a shallow clone.`,
    )
  })

  it('create() fails for a folder that is not a Git repository, before any Docker call', async () => {
    const dir = await tempDir('local-source-plain-')
    // No daemon behind this socket, so a Docker call would fail differently.
    const provider = dockerSandbox({
      image: 'node:24',
      dockerodeOptions: { socketPath: path.join(dir, 'no-docker.sock') },
    })
    await expect(
      provider.create({
        workspace: defineWorkspace({ source: localSource(dir) }),
      }),
    ).rejects.toThrow(
      `dockerSandbox: the localSource folder ${dir} is not a Git repository.`,
    )
  })

  it('fails with a clear error when git is not on PATH', async () => {
    const dir = await tempDir('local-source-')
    await mkdir(path.join(dir, '.git'))
    vi.stubEnv('PATH', '')
    await expect(readLocalSource(dir)).rejects.toThrow(
      'dockerSandbox: git is not on PATH.',
    )
  })

  it('fails before the upload when the image has no git', async () => {
    const repo = await makeRepo({ 'README.md': 'hi\n' })
    const fake = await folderContainer(() => ({
      status: 127,
      stdout: Buffer.alloc(0),
      stderr: Buffer.from('sh: git: not found\n'),
    }))
    await expect(
      copyLocalSource(await readLocalSource(repo), {
        container: fake.container,
        handle: fake.handle,
      }),
    ).rejects.toThrow('Use an image with git, such as node:24.')
    expect(fake.archives).toEqual([])
  })

  it('removes the bundle on the host when a git step in the container fails', async () => {
    const repo = await makeRepo({ 'README.md': 'hi\n' })
    const hostBundles = async () =>
      (await readdir(tmpdir())).filter((name) =>
        name.startsWith('tanstack-local-source-'),
      )
    const before = await hostBundles()
    const fake = await folderContainer((command, cwd) =>
      command.startsWith('git fetch')
        ? {
            status: 128,
            stdout: Buffer.alloc(0),
            stderr: Buffer.from('fatal: bad bundle\n'),
          }
        : runOnHost(command, cwd),
    )

    await expect(
      copyLocalSource(await readLocalSource(repo), {
        container: fake.container,
        handle: fake.handle,
      }),
    ).rejects.toThrow('failed in the container (exit 128): fatal: bad bundle')

    // Guard the guard: a bundle was made and sent.
    expect(fake.archives[0]?.entries[0]?.path).toBe(BUNDLE)
    expect(await hostBundles()).toEqual(before)
  })
})
