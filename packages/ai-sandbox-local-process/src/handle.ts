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
import { spawn } from 'node:child_process'
import { watch as watchFs } from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import {
  DEFAULT_WORKSPACE_ROOT,
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import type { Readable } from 'node:stream'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxHandle,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

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

export interface LocalProcessHandleOptions {
  /** Real host directory backing this sandbox (its workspace root). */
  root: string
  /** Remove the backing dir on destroy. */
  removeOnDestroy: boolean
  /** Create a fork by copying this sandbox's dir to a new root. */
  forkFactory: (sourceRoot: string) => Promise<SandboxHandle>
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
    return { ...process.env, ...this.envVars, ...extra }
  }

  private exec(command: string, opts?: ProcessOptions): Promise<ExecResult> {
    return new Promise<ExecResult>((resolve, reject) => {
      const child = spawn(command, {
        shell: true,
        cwd: this.resolveCwd(opts?.cwd),
        env: this.mergedEnv(opts?.env),
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')))
      child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')))
      const onAbort = (): void => {
        child.kill()
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
    const child = spawn(command, {
      shell: true,
      cwd: this.resolveCwd(opts?.cwd),
      env: this.mergedEnv(opts?.env),
    })
    if (opts?.signal) {
      opts.signal.addEventListener('abort', () => child.kill(), { once: true })
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
        child.kill(signal)
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
