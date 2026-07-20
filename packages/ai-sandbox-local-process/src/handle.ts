/**
 * SandboxHandle backed by the host machine — no isolation. The "sandbox" is a
 * real host directory; fs/exec/git operate directly on it.
 *
 * TRUST BOUNDARY: local-process runs commands and file writes on the HOST with
 * the privileges of the current process. It provides NO isolation, NO network
 * policy, and `exec` runs through a shell. Use it only in trusted/dev contexts
 * (the fast no-Docker dev loop); never expose it to untrusted prompts in a
 * context where host compromise matters. For isolation use the Docker or
 * Cloudflare providers.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, watch as watchFs } from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import {
  DEFAULT_WORKSPACE_ROOT,
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import type { ChildProcess } from 'node:child_process'
import type { Readable } from 'node:stream'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxHandle,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

/**
 * Resolve a POSIX `sh` to run commands through. Commands are built with POSIX
 * single-quote quoting (e.g. `--permission-mode 'bypassPermissions'`), so they
 * must run under a POSIX shell on EVERY platform — on native Windows, `cmd.exe`
 * (what Node's `shell: true` uses) does not strip single quotes and breaks them.
 *
 * - Unix: `sh` resolves via PATH (`/bin/sh`).
 * - Windows: no POSIX shell on the default PATH, so locate git-bash / WSL's
 *   `sh.exe` — from the `TANSTACK_SANDBOX_SH` override, derived from `git` on
 *   PATH (`…\Git\cmd` → `…\Git\usr\bin\sh.exe`), or common install dirs.
 * Cached after first resolution.
 */
let cachedShell: string | undefined
function posixShell(): string {
  if (cachedShell !== undefined) return cachedShell
  if (process.platform !== 'win32') return (cachedShell = 'sh')

  const candidates: Array<string> = []
  if (process.env.TANSTACK_SANDBOX_SH) {
    candidates.push(process.env.TANSTACK_SANDBOX_SH)
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (/\\git\\cmd\\?$/i.test(dir)) {
      candidates.push(path.join(dir, '..', 'usr', 'bin', 'sh.exe'))
      candidates.push(path.join(dir, '..', 'bin', 'sh.exe'))
    }
  }
  candidates.push(
    'C:\\Program Files\\Git\\usr\\bin\\sh.exe',
    'C:\\Program Files\\Git\\bin\\sh.exe',
  )
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return (cachedShell = candidate)
  }
  // Last resort: rely on PATH (a clear ENOENT if no POSIX sh is installed).
  return (cachedShell = 'sh')
}

/**
 * Extra PATH dirs so a Windows git-bash `sh` can find its Unix tools (`sed`,
 * `dirname`, `uname`, `git`, …). Node spawns `sh.exe` with the bare Windows PATH,
 * which omits git-bash's `usr/bin`/`mingw64/bin` — so npm CLI shims that are
 * POSIX shell scripts (e.g. `codex`) fail with "command not found". Empty on
 * non-Windows or when no real git-bash sh was resolved.
 */
let cachedShellPathDirs: Array<string> | undefined
function posixShellPathDirs(): Array<string> {
  if (cachedShellPathDirs !== undefined) return cachedShellPathDirs
  const sh = posixShell()
  if (process.platform !== 'win32' || sh === 'sh') {
    return (cachedShellPathDirs = [])
  }
  const dirs = [path.dirname(sh)] // …\Git\usr\bin — holds sed/dirname/uname/sh
  let dir = path.dirname(sh)
  for (let i = 0; i < 3; i += 1) {
    if (/\\git$/i.test(dir)) {
      for (const sub of ['usr\\bin', 'bin', 'mingw64\\bin']) {
        dirs.push(path.join(dir, sub))
      }
      break
    }
    dir = path.dirname(dir)
  }
  return (cachedShellPathDirs = [...new Set(dirs)].filter((d) => existsSync(d)))
}

export const LOCAL_PROCESS_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: true,
  snapshots: false,
  networkPolicy: false,
  durableFilesystem: true,
  fork: true,
}

async function* decodeStream(stream: Readable | null): AsyncIterable<string> {
  if (!stream) return
  for await (const chunk of stream) {
    yield typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8')
  }
}

/**
 * Kill a spawned child AND all its descendants.
 *
 * We spawn every command through `sh -c <command>`, so `child` is the `sh`
 * wrapper. `child.kill()` signals only that wrapper — its grandchildren (e.g.
 * `node` → a harness binary like `opencode serve`) keep running and hold their
 * ports, orphaning a server that then blocks the next run's port. On Windows
 * there are no POSIX process groups, so we use `taskkill /T` to walk the tree;
 * elsewhere we fall back to signalling the wrapper (sh forwards on exec).
 */
function killTree(child: ChildProcess, signal?: NodeJS.Signals | number): void {
  const pid = child.pid
  if (pid !== undefined && process.platform === 'win32') {
    const res = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
    })
    if (res.error === undefined) return
    // taskkill missing/failed → fall through to the best-effort signal.
  }
  child.kill(signal)
}

export interface LocalProcessHandleOptions {
  /** Real host directory backing this sandbox (its workspace root). */
  root: string
  /** Remove the backing dir on destroy. */
  removeOnDestroy: boolean
  /** Create a fork by copying this sandbox's dir to a new root. */
  forkFactory: (sourceRoot: string) => Promise<SandboxHandle>
  /** Env vars to delete from the inherited `process.env` before spawning. */
  scrubEnv?: Array<string>
}

export class LocalProcessHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'local-process'
  readonly capabilities = LOCAL_PROCESS_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly root: string
  private readonly options: LocalProcessHandleOptions
  private readonly envVars: Record<string, string> = {}

  constructor(options: LocalProcessHandleOptions) {
    this.root = options.root
    this.id = options.root
    this.options = options

    this.fs = {
      read: async (p) => fsp.readFile(this.resolve(p), 'utf8'),
      readBytes: async (p) =>
        new Uint8Array(await fsp.readFile(this.resolve(p))),
      write: async (p, data) => {
        const target = this.resolve(p)
        await fsp.mkdir(path.dirname(target), { recursive: true })
        await fsp.writeFile(
          target,
          typeof data === 'string' ? data : Buffer.from(data),
        )
      },
      list: async (p) => {
        const entries = await fsp.readdir(this.resolve(p), {
          withFileTypes: true,
        })
        return entries.map((e) => ({
          name: e.name,
          path: `${p.replace(/\/$/, '')}/${e.name}`,
          type: e.isDirectory() ? ('dir' as const) : ('file' as const),
        }))
      },
      mkdir: async (p) => {
        await fsp.mkdir(this.resolve(p), { recursive: true })
      },
      remove: async (p) => {
        await fsp.rm(this.resolve(p), { recursive: true, force: true })
      },
      rename: async (from, to) => {
        await fsp.rename(this.resolve(from), this.resolve(to))
      },
      exists: async (p) => {
        try {
          await fsp.access(this.resolve(p))
          return true
        } catch {
          return false
        }
      },
    }

    // Native recursive file watching is supported on Windows/macOS but not
    // Linux (Node throws ERR_FEATURE_UNAVAILABLE_ON_PLATFORM). Expose the
    // optional `fs.watch` seam only where it works; on Linux it stays
    // undefined so `watchWorkspace` falls back to the portable exec-poll path.
    if (process.platform !== 'linux') {
      this.fs.watch = (p, onEvent) => {
        const dir = this.resolve(p)
        // Emit paths under the requested watch root `p` (not a hardcoded
        // `/workspace`), so callers watching a sub-path get consistent paths.
        const base = p.replace(/\/+$/, '')
        const watcher = watchFs(
          dir,
          { recursive: true },
          (eventType, filename) => {
            if (filename === null) return
            const rel = filename.toString().split(path.sep).join('/')
            onEvent({ type: eventType, path: `${base}/${rel}` })
          },
        )
        return Promise.resolve({
          stop: () => {
            watcher.close()
            return Promise.resolve()
          },
        })
      }
    }

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.git = createExecBackedGit(this.process, this.root)

    this.ports = {
      // The host can always reach the process directly on localhost.
      connect: (port) => Promise.resolve({ url: `http://127.0.0.1:${port}` }),
    }

    this.env = {
      set: (vars) => {
        Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /** Map a virtual `/workspace` (or other absolute/relative) path onto the host root. */
  private resolve(p: string): string {
    let rel: string
    if (p === DEFAULT_WORKSPACE_ROOT) rel = ''
    else if (p.startsWith(`${DEFAULT_WORKSPACE_ROOT}/`)) {
      rel = p.slice(DEFAULT_WORKSPACE_ROOT.length + 1)
    } else if (p.startsWith('/')) rel = p.slice(1)
    else rel = p
    const resolved = path.resolve(this.root, rel)
    // Containment: never let an agent's path escape the sandbox dir.
    const rootWithSep = this.root.endsWith(path.sep)
      ? this.root
      : this.root + path.sep
    if (resolved !== this.root && !resolved.startsWith(rootWithSep)) {
      throw new Error(
        `local-process: path "${p}" resolves outside the sandbox root "${this.root}".`,
      )
    }
    return resolved
  }

  private resolveCwd(cwd: string | undefined): string {
    return cwd ? this.resolve(cwd) : this.root
  }

  private mergedEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, ...this.envVars, ...extra }
    // Drop scrubbed vars so a host CLI falls back to its own stored auth
    // (e.g. remove ANTHROPIC_API_KEY → Claude Code uses the logged-in
    // subscription instead of billing the API). Delete (not blank) so the var
    // is truly absent, not present-but-empty.
    for (const key of this.options.scrubEnv ?? []) delete env[key]
    // Prepend git-bash's tool dirs (Windows) so the POSIX `sh` can find sed/uname/
    // git/etc. that npm CLI shims depend on. Respect the existing PATH key casing
    // (Windows uses `Path`) to avoid creating a duplicate, ignored variable.
    const extraPaths = posixShellPathDirs()
    if (extraPaths.length > 0) {
      const pathKey =
        Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
      env[pathKey] = [...extraPaths, env[pathKey] ?? '']
        .filter(Boolean)
        .join(path.delimiter)
    }
    return env
  }

  private exec(command: string, opts?: ProcessOptions): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve, reject) => {
      // Run via a POSIX `sh` on every platform (see posixShell) so the adapter's
      // single-quote-quoted commands work identically — including native Windows,
      // where `shell: true` would be cmd.exe and mangle the quoting.
      const child = spawn(posixShell(), ['-c', command], {
        cwd: this.resolveCwd(opts?.cwd),
        env: this.mergedEnv(opts?.env),
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
      const onAbort = (): void => {
        killTree(child)
      }
      opts?.signal?.addEventListener('abort', onAbort, { once: true })
      child.on('error', reject)
      child.on('close', (code) => {
        opts?.signal?.removeEventListener('abort', onAbort)
        resolve({ stdout, stderr, exitCode: code ?? 0 })
      })
    })
  }

  private spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    // Via POSIX `sh` on every platform (see posixShell / exec above).
    const child = spawn(posixShell(), ['-c', command], {
      cwd: this.resolveCwd(opts?.cwd),
      env: this.mergedEnv(opts?.env),
    })
    if (opts?.signal) {
      opts.signal.addEventListener('abort', () => killTree(child), {
        once: true,
      })
    }
    const handle: SpawnHandle = {
      pid: child.pid ?? -1,
      stdout: decodeStream(child.stdout),
      stderr: decodeStream(child.stderr),
      stdin: {
        write: (data) =>
          new Promise<void>((resolve, reject) => {
            child.stdin.write(data, (err) => (err ? reject(err) : resolve()))
          }),
        end: () =>
          new Promise<void>((resolve) => {
            child.stdin.end(() => resolve())
          }),
      },
      wait: () =>
        new Promise<number>((resolve, reject) => {
          child.on('error', reject)
          child.on('close', (code) => resolve(code ?? 0))
        }),
      kill: (signal) => {
        killTree(child, signal)
        return Promise.resolve()
      },
    }
    return Promise.resolve(handle)
  }

  // local-process has no snapshot primitive; fork copies the dir instead.
  snapshot = undefined

  fork = (): Promise<SandboxHandle> => {
    if (!this.capabilities.fork) {
      throw new UnsupportedCapabilityError('local-process', 'fork')
    }
    return this.options.forkFactory(this.root)
  }

  async destroy(): Promise<void> {
    if (this.options.removeOnDestroy) {
      await fsp.rm(this.root, { recursive: true, force: true })
    }
  }
}
