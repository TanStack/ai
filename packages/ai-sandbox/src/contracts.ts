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
  readonly stdin: { write: (data: string) => Promise<void>; end: () => Promise<void> }
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
  list: (path: string) => Promise<Array<{ name: string; path: string; type: 'file' | 'dir' }>>
  mkdir: (path: string) => Promise<void>
  remove: (path: string) => Promise<void>
  rename: (from: string, to: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  /** Optional — present only when `capabilities.fs` providers advertise watch. */
  watch?: (
    path: string,
    onEvent: (event: { type: string; path: string }) => void,
  ) => Promise<{ stop: () => Promise<void> }>
}

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
  workspace?: WorkspaceDefinition
  policy?: SandboxPolicy
  env?: Record<string, string>
  signal?: AbortSignal
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
