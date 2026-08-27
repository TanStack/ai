import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SnapshotRef,
  SpawnHandle,
  SandboxFsStat,
} from '@tanstack/ai-sandbox'
import type {
  SpriteCheckpoint,
  SpriteUrlAuth,
  SpritesClientLike,
} from './client'

export const SPRITES_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  writableStdin: false,
  killableProcesses: true,
  snapshots: true,
  networkPolicy: false,
  // The Sprite filesystem persists for the sandbox's lifetime (across exec
  // calls and idle suspend/resume) until it is deleted.
  durableFilesystem: true,
  fork: false,
}

/** The single internal HTTP port a Sprite proxies to its public URL. */
export const /** The single internal HTTP port a Sprite proxies to its public URL. */
SPRITE_DEFAULT_HTTP_PORT = 8080

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const chunk of stream) out += chunk
  return out
}

export interface SpritesHandleDeps {
  client: SpritesClientLike
  /** Sprite name — the durable id used to reconnect/destroy. */
  name: string
  /** Public URL of the Sprite (`https://<name>-<suffix>.sprites.app`). */
  url: string
  /** Working directory inside the Sprite; the `/workspace` virtual root maps here. */
  workdir: string
  /** Internal port proxied to the public URL. Defaults to 8080. */
  httpPort?: number
  /**
     * The Sprite's URL auth mode. `ports.connect()` returns a token-authenticated
     * channel when this is `'sprite'`, and a plain public URL when `'public'`;
     * it never mutates the mode. Defaults to `'public'`.
     */
  urlAuth?: SpriteUrlAuth
}

export class SpritesHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'sprites'
  readonly workspaceRoot: string
  readonly capabilities = SPRITES_CAPS
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly client: SpritesClientLike
  /** Sprite name — the durable id used to reconnect/destroy. */
  private readonly name: string
  /** Public URL of the Sprite (`https://<name>-<suffix>.sprites.app`). */
  private readonly url: string
  /** Working directory inside the Sprite; the `/workspace` virtual root maps here. */
  private readonly workdir: string
  /** Internal port proxied to the public URL. Defaults to 8080. */
  private readonly httpPort: number
  private readonly urlAuth: SpriteUrlAuth
  private readonly envVars: Record<string, string> = {}

  constructor(deps: SpritesHandleDeps) {
    this.client = deps.client
    this.name = deps.name
    this.url = deps.url
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.httpPort = deps.httpPort ?? SPRITE_DEFAULT_HTTP_PORT
    this.urlAuth = deps.urlAuth ?? 'public'
    this.id = deps.name

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: async (p) =>
        new TextDecoder().decode(
          await this.client.fsRead(this.name, this.abs(p)),
        ),
      readBytes: (p) => this.client.fsRead(this.name, this.abs(p)),
      write: (p, data) =>
        this.client.fsWrite(
          this.name,
          this.abs(p),
          typeof data === 'string' ? new TextEncoder().encode(data) : data,
        ),
      list: async (p) => {
        const entries = await this.client.fsList(this.name, this.abs(p))
        // Native paths are absolute Sprite paths; re-root them under the
        // caller's virtual path so consumers stay provider-agnostic.
        const base = p.replace(/\/$/, '')
        return entries.map((entry) => ({
          name: entry.name,
          path: `${base}/${entry.name}`,
          type: entry.type,
        }))
      },
      lstat: async (p) => this.lstat(this.abs(p)),
      mkdir: async (p) => {
        const r = await this.exec(`mkdir -p ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`mkdir failed: ${errText(r)}`)
      },
      remove: async (p) => {
        const r = await this.exec(`rm -rf ${q(this.abs(p))}`)
        if (r.exitCode !== 0) throw new Error(`remove failed: ${errText(r)}`)
      },
      rename: async (from, to) => {
        const r = await this.exec(`mv ${q(this.abs(from))} ${q(this.abs(to))}`)
        if (r.exitCode !== 0) throw new Error(`rename failed: ${errText(r)}`)
      },
      exists: async (p) => {
        const r = await this.exec(`test -e ${q(this.abs(p))}`)
        return r.exitCode === 0
      },
    }

    this.git = createExecBackedGit(this.process, this.workdir)

    this.ports = {
      connect: (port) => this.connectPort(port),
    }

    this.env = {
      set: (vars) => {
        Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /** Map the conventional `/workspace` virtual root to the Sprite workdir. */
  private abs(p: string): string {
    if (this.workdir === '/workspace') return p
    if (p === '/workspace') return this.workdir
    if (p.startsWith('/workspace/'))
      return `${this.workdir}/${p.slice('/workspace/'.length)}`
    return p
  }

  private async lstat(path: string): Promise<SandboxFsStat | undefined> {
    const r = await this.exec(lstatCommand(path))
    const pathNotFound = r.exitCode === 0 && r.stdout.trim() === LSTAT_MISSING
    if (pathNotFound) return undefined
    if (r.exitCode !== 0) {
      throw new Error(`lstat failed: ${errText(r)}`)
    }
    return parseLstatOutput(r.stdout)
  }

  private mergedEnv(extra?: Record<string, string>): Record<string, string> {
    return { ...this.envVars, ...extra }
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const stream = this.client.exec(this.name, {
      argv: ['bash', '-c', command],
      cwd: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      env: this.mergedEnv(opts?.env),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      collect(stream.stdout),
      collect(stream.stderr),
      stream.wait(),
    ])
    return { stdout, stderr, exitCode }
  }

  private spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const stream = this.client.exec(this.name, {
      argv: ['bash', '-c', command],
      cwd: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      env: this.mergedEnv(opts?.env),
      ...(opts?.signal ? { signal: opts.signal } : {}),
    })
    return Promise.resolve({
      pid: -1, // Sprite exec sessions do not surface a host-visible pid.
      stdout: stream.stdout,
      stderr: stream.stderr,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'sprites: background process stdin is not writable (see capabilities.writableStdin)',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: () => stream.wait(),
      kill: () => stream.kill(),
    })
  }

  private connectPort(port: number): Promise<SandboxChannel> {
    if (port !== this.httpPort) {
      return Promise.reject(
        new Error(
          `sprites: only the proxied HTTP port ${this.httpPort} is reachable via the public URL; port ${port} is not exposed.`,
        ),
      )
    }
    if (this.urlAuth === 'public') {
      return Promise.resolve({ url: this.url })
    }
    return Promise.resolve({
      url: this.url,
      headers: this.client.authHeader(),
    })
  }

  /**
     * Create a checkpoint of the Sprite's writable filesystem overlay. Returns a
     * {@link SnapshotRef} whose `id` is `<spriteName>#<version>` (e.g.
     * `my-sprite#v3`) so it round-trips through {@link restoreCheckpoint}.
     */
  async snapshot(label?: string): Promise<SnapshotRef> {
    const version = await this.client.createCheckpoint(this.name, {
      ...(label !== undefined ? { comment: label } : {}),
    })
    return {
      id: `${this.name}#${version}`,
      ...(label !== undefined ? { label } : {}),
    }
  }

  /** List this Sprite's checkpoints (newest live overlay shows as `Current`). */
  listCheckpoints(): Promise<Array<SpriteCheckpoint>> {
    return this.client.listCheckpoints(this.name)
  }

  /**
     * Restore a checkpoint in place and wait for the Sprite to restart. Accepts a
     * bare version (`v3`) or a {@link SnapshotRef} id (`<spriteName>#v3`).
     *
     * Restore is destructive: it replaces the current overlay. Take a
     * {@link snapshot} first if you need to keep the present state.
     */
  restoreCheckpoint(
    idOrRef: string,
    options?: { readyTimeoutMs?: number },
  ): Promise<void> {
    let version = idOrRef
    if (idOrRef.includes('#')) {
      const hash = idOrRef.indexOf('#')
      const refName = idOrRef.slice(0, hash)
      version = idOrRef.slice(hash + 1)
      if (refName !== this.name) {
        return Promise.reject(
          new Error(
            `sprites: checkpoint ref "${idOrRef}" belongs to "${refName}", not this Sprite "${this.name}".`,
          ),
        )
      }
    }
    return this.client.restoreCheckpoint(this.name, version, {
      ...options,
      // Probe the workdir so readiness reflects the restored overlay, not just
      // the (always-listable) root.
      probePath: this.workdir,
    })
  }

  fork = (): Promise<SandboxHandle> => {
    throw new UnsupportedCapabilityError('sprites', 'fork')
  }

  async destroy(): Promise<void> {
    await this.client.deleteSprite(this.name)
  }
}

/** POSIX single-quote escape for embedding paths in `bash -c`. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
const LSTAT_MISSING = '__TANSTACK_LSTAT_MISSING__'

/** Verify a missing path by listing parent entries. `test -e` also fails for inaccessible parents. */
function lstatCommand(path: string): string {
  return `tanstack_lstat_path=${q(path)}; tanstack_lstat_output=$(stat -c '%f:%s' -- "$tanstack_lstat_path" 2>&1); tanstack_lstat_status=$?; if [ "$tanstack_lstat_status" -eq 0 ]; then printf '%s\n' "$tanstack_lstat_output"; else tanstack_lstat_missing() { tanstack_missing_path=$1; case "$tanstack_missing_path" in /|.) return 1 ;; */*) tanstack_parent=${'$'}{tanstack_missing_path%/*}; tanstack_name=${'$'}{tanstack_missing_path##*/}; [ -n "$tanstack_parent" ] || tanstack_parent=/ ;; *) tanstack_parent=.; tanstack_name=$tanstack_missing_path ;; esac; tanstack_parent_mode=$(stat -L -c '%f' -- "$tanstack_parent" 2>/dev/null); tanstack_parent_status=$?; if [ "$tanstack_parent_status" -ne 0 ]; then tanstack_lstat_missing "$tanstack_parent"; else case "$tanstack_parent_mode" in 4[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]) case "$tanstack_parent" in /*) tanstack_find_parent=$tanstack_parent ;; *) tanstack_find_parent=./$tanstack_parent ;; esac; tanstack_match=$(find -H "$tanstack_find_parent" -mindepth 1 -maxdepth 1 -exec sh -c 'tanstack_target=$1; shift; for tanstack_candidate do [ "${'$'}{tanstack_candidate##*/}" = "$tanstack_target" ] && { printf 1; exit 0; }; done; exit 0' sh "$tanstack_name" '{}' + 2>/dev/null); tanstack_find_status=$?; [ "$tanstack_find_status" -eq 0 ] && [ -z "$tanstack_match" ] ;; *) return 1 ;; esac; fi; }; if tanstack_lstat_missing "$tanstack_lstat_path"; then printf '%s' '${LSTAT_MISSING}'; else printf '%s\n' "$tanstack_lstat_output" >&2; exit "$tanstack_lstat_status"; fi; fi`
}
function parseLstatOutput(output: string): SandboxFsStat {
  const fields = /^(?<mode>[0-9a-fA-F]{4}):(?<size>\d+)\n?$/.exec(output)
  const mode = fields?.groups?.mode
  const size = fields?.groups?.size
  if (!mode) throw new Error(`invalid lstat output: ${output}`)
  if (!size) throw new Error(`invalid lstat output: ${output}`)
  const parsedMode = Number.parseInt(mode, 16)
  const parsedSize = Number(size)
  const invalidLstat =
    !Number.isSafeInteger(parsedMode) ||
    !Number.isSafeInteger(parsedSize) ||
    parsedSize < 0
  if (invalidLstat) throw new Error(`invalid lstat output: ${output}`)
  const type = parsedMode & 0xf000
  if (type === 0x8000)
    return { type: 'file', mode: parsedMode, size: parsedSize }
  if (type === 0x4000) return { type: 'dir', mode: parsedMode }
  if (type === 0xa000) return { type: 'symlink', mode: parsedMode }
  return { type: 'other', mode: parsedMode }
}

/**
 * Best error text from an exec result. Near-instant commands hit the Sprite
 * agent's fast path, which folds stderr into stdout, so prefer stderr but fall
 * back to stdout to avoid throwing with an empty reason.
 */
function errText(r: { stdout: string; stderr: string }): string {
  return r.stderr.trim() || r.stdout.trim() || '(no output)'
}
