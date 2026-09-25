/**
 * Provider-agnostic sandbox contracts.
 *
 * A {@link SandboxProvider} owns an isolation primitive (Docker container,
 * Cloudflare DO-backed container, a local OS process tree, …) and knows how to
 * create / resume / restore / destroy a {@link SandboxHandle}. A
 * `SandboxHandle` is the uniform runtime surface every consumer (harness
 * adapters, the workspace bootstrap engine, advanced users) codes against.
 *
 * Providers differ in what they can do — see {@link SandboxCapabilities}. The
 * mandatory `fs` and `exec` capabilities are guaranteed by the contract;
 * everything else is optional and capability-gated. Calling an unsupported
 * optional method throws {@link UnsupportedCapabilityError} rather than
 * silently no-opping.
 */
import type { WorkspaceDefinition } from './workspace'
import type { SandboxPolicy } from './policy'

/** Static description of what a provider supports. */
export interface SandboxCapabilities {
  /** Read/write/list/… via {@link SandboxFs}. Always true (mandatory). */
  fs: boolean
  /** Blocking command execution via {@link SandboxProcess.exec}. Always true (mandatory). */
  exec: boolean
  /** Per-create / per-command environment variables. */
  env: boolean
  /** Expose a port and resolve a reachable channel via {@link SandboxPorts}. */
  ports: boolean
  /** Long-running/background processes via {@link SandboxProcess.spawn}. */
  backgroundProcesses: boolean
  /**
   * A spawned process exposes a writable host→process stdin
   * ({@link SpawnHandle.stdin}). `true` for host (`localProcessSandbox`).
   * `false` for Docker container, Docker Sandboxes (`sbx`), Daytona, Vercel,
   * and Cloudflare. When `false`, harness adapters that feed a prompt over
   * stdin must instead deliver it via a file + shell redirection.
   */
  writableStdin: boolean
  /**
   * A spawned process can be forcibly terminated via {@link SpawnHandle.kill}
   * and aborted mid-flight via the {@link ProcessOptions.signal} passed to
   * {@link SandboxProcess.spawn}. `true` for host and Docker container.
   * `false` for Docker Sandboxes (`sbx`) until measured, and for Daytona,
   * Vercel, and Cloudflare. Those providers implement `kill()` as a no-op or
   * have not been measured yet, so a long-running follower process
   * (e.g. `tail -f`) started there can never be stopped by the caller, only
   * polled and abandoned.
   * Callers MUST branch on this before relying on `kill`/abort to reclaim a
   * background process: a bring-your-own provider that omits it would
   * otherwise be silently treated as killable, leaking an unstoppable process
   * inside the sandbox.
   */
  killableProcesses: boolean
  /** Capture/restore filesystem snapshots via {@link SandboxHandle.snapshot}. */
  snapshots: boolean
  /** Declarative network egress allow/deny policy. */
  networkPolicy: boolean
  /** Filesystem persists across sandbox stop/restart without a snapshot. */
  durableFilesystem: boolean
  /** Branch a new sandbox from current state via {@link SandboxHandle.fork}. */
  fork: boolean
}

/** Result of a blocking command. */
export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** Options for {@link SandboxProcess.exec} / {@link SandboxProcess.spawn}. */
export interface ProcessOptions {
  /** Working directory inside the sandbox. Defaults to the workspace root. */
  cwd?: string
  /** Per-command environment variables, merged over the sandbox env. */
  env?: Record<string, string>
  /** Abort the command/process when this signal fires. */
  signal?: AbortSignal
}

/**
 * A live background process. `stdout`/`stderr` are async-iterables of decoded
 * chunks; `stdin.write` feeds the process (duplex — required for ACP harness
 * protocols such as Codex / Gemini CLI). There is intentionally NO
 * reconnect-to-a-running-process in v1 — that belongs to the durable-stream /
 * persistence layer.
 */
export interface SpawnHandle {
  readonly pid: number
  readonly stdout: AsyncIterable<string>
  readonly stderr: AsyncIterable<string>
  readonly stdin: {
    write: (data: string) => Promise<void>
    end: () => Promise<void>
  }
  /** Resolves with the exit code when the process exits. */
  wait: () => Promise<number>
  kill: (signal?: NodeJS.Signals | number) => Promise<void>
}

export interface SandboxProcess {
  /** Run a command to completion and capture stdout/stderr/exit code. */
  exec: (command: string, options?: ProcessOptions) => Promise<ExecResult>
  /** Start a long-running/background process with streamable, duplex IO. */
  spawn: (command: string, options?: ProcessOptions) => Promise<SpawnHandle>
}

/** Common, portable filesystem operations every provider implements. */
export interface SandboxFs {
  read: (path: string) => Promise<string>
  readBytes: (path: string) => Promise<Uint8Array>
  write: (path: string, data: string | Uint8Array) => Promise<void>
  list: (
    path: string,
  ) => Promise<Array<{ name: string; path: string; type: 'file' | 'dir' }>>
  mkdir: (path: string) => Promise<void>
  remove: (path: string) => Promise<void>
  rename: (from: string, to: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  /**
   * Optional metadata lookup. Implementations must not follow symlinks.
   * Returns undefined only for a confirmed missing path. All other errors reject.
   */
  lstat?: (path: string) => Promise<SandboxFsStat | undefined>
  /** Optional — present only when `capabilities.fs` providers advertise watch. */
  watch?: (
    path: string,
    onEvent: (event: { type: string; path: string }) => void,
  ) => Promise<{ stop: () => Promise<void> }>
}

export type SandboxFsStat =
  // `mode` is the complete POSIX mode value, including the file-type bits.
  | { type: 'file'; mode: number; size: number }
  | { type: 'dir'; mode: number }
  | { type: 'symlink'; mode: number }
  | { type: 'other'; mode: number }

/**
 * Uniform git surface. Implementations either delegate to the provider's
 * native git (when advertised) or desugar to `process.exec("git …")`, so the
 * contract is identical across providers.
 */
export interface SandboxGit {
  clone: (input: {
    url: string
    dir?: string
    ref?: string
    auth?: { username?: string; token: string }
    depth?: number | 'full'
  }) => Promise<void>
  status: (dir?: string) => Promise<string>
  add: (paths: Array<string>, dir?: string) => Promise<void>
  commit: (message: string, dir?: string) => Promise<void>
  push: (dir?: string) => Promise<void>
  pull: (dir?: string) => Promise<void>
  /** Returns the current branch name. */
  branch: (dir?: string) => Promise<string>
}

/** A reachable channel to a port inside the sandbox. */
export interface SandboxChannel {
  /** URL the host can reach (localhost / host-bound port / authenticated preview URL). */
  url: string
  /** Bearer token gating the channel, when the provider issues one. */
  token?: string
  /**
   * Ready-to-send HTTP headers that authenticate requests to {@link url}, when
   * the provider's auth doesn't fit a plain `Authorization: Bearer <token>`
   * (e.g. Daytona's `x-daytona-preview-token`). Consumers that speak HTTP to the
   * channel should attach these verbatim; the provider owns the header names so
   * consumers stay provider-agnostic.
   */
  headers?: Record<string, string>
}

export interface SandboxPorts {
  /** Expose `port` and resolve the best reachable channel for the host. */
  connect: (port: number) => Promise<SandboxChannel>
}

export interface SandboxEnv {
  set: (vars: Record<string, string>) => Promise<void>
}

/** Opaque reference to a stored snapshot, used to restore later. */
export interface SnapshotRef {
  id: string
  label?: string
}

/** The uniform runtime surface a sandbox exposes. */
export interface SandboxHandle {
  /** Provider-assigned id used to reconnect to this sandbox. */
  readonly id: string
  /** Provider name (e.g. "docker", "cloudflare", "local-process"). */
  readonly provider: string
  /**
   * Real filesystem path backing the virtual workspace root (`/workspace`).
   * Harness CLIs and ACP `newSession` interpret cwd literally — use
   * {@link resolveHarnessCwd} rather than the virtual path when the provider
   * maps `/workspace` elsewhere (Daytona, Vercel, local-process).
   */
  readonly workspaceRoot?: string
  /** What this sandbox can do. */
  readonly capabilities: SandboxCapabilities
  readonly fs: SandboxFs
  readonly git: SandboxGit
  readonly process: SandboxProcess
  readonly ports: SandboxPorts
  readonly env: SandboxEnv
  /** Capability-gated: throws UnsupportedCapabilityError if `capabilities.snapshots` is false. */
  snapshot?: (label?: string) => Promise<SnapshotRef>
  /** Capability-gated: throws UnsupportedCapabilityError if `capabilities.fork` is false. */
  fork?: () => Promise<SandboxHandle>
  destroy: () => Promise<void>
}

/** Input passed to {@link SandboxProvider.create}. */
export interface SandboxCreateInput {
  /**
   * Deterministic instance id the caller wants the provider to use. `ensure()`
   * passes the compound sandbox key here so the provider-assigned id is
   * reconstructable from run context (thread/workspace/tenant/reuse) instead of
   * being a random value only recoverable from the sandbox store. Providers
   * whose native id is addressable by name (e.g. Cloudflare's DO id) SHOULD
   * honor it (`input.id ?? <random>`); providers that mint their own opaque id
   * MAY ignore it. Consumers that reconnect out-of-band — e.g. attaching a
   * preview iframe to the exact sandbox an agent is editing — rely on this being
   * honored to avoid addressing two different sandboxes.
   */
  id?: string
  workspace?: WorkspaceDefinition
  policy?: SandboxPolicy
  env?: Record<string, string>
  signal?: AbortSignal
  /** Harness adapter name. Optional. Providers that do not use it ignore it. */
  adapterName?: string
}

/** Input passed to {@link SandboxProvider.resume}. */
export interface SandboxResumeInput {
  /** Provider-assigned sandbox id recorded by a prior run. */
  id: string
  signal?: AbortSignal
}

/** Input passed to {@link SandboxProvider.restoreSnapshot}. */
export interface SandboxRestoreInput {
  snapshotId: string
  workspace?: WorkspaceDefinition
  policy?: SandboxPolicy
  env?: Record<string, string>
  signal?: AbortSignal
}

/** Input passed to {@link SandboxProvider.destroy}. */
export interface SandboxDestroyInput {
  id: string
  signal?: AbortSignal
}

/**
 * Owns an isolation primitive. Implemented by `@tanstack/ai-sandbox-*`
 * provider packages.
 */
export interface SandboxProvider {
  readonly name: string
  /** Static capability descriptor. */
  capabilities: () => SandboxCapabilities
  create: (input: SandboxCreateInput) => Promise<SandboxHandle>
  /** Reconnect to an existing sandbox by id; resolves null if it's gone. */
  resume: (input: SandboxResumeInput) => Promise<SandboxHandle | null>
  /** Capability-gated: present only when `capabilities().snapshots` is true. */
  restoreSnapshot?: (input: SandboxRestoreInput) => Promise<SandboxHandle>
  destroy: (input: SandboxDestroyInput) => Promise<void>
}
