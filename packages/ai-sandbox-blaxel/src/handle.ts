/**
 * SandboxHandle backed by a Blaxel cloud sandbox. Real
 * isolation: fs/exec/git operate inside the remote sandbox and paths are real
 * sandbox paths (default workspace root `/workspace`).
 *
 * Filesystem data ops (read/readBytes/write/list/mkdir/remove) use Blaxel's
 * native filesystem endpoints; `rename` and `exists` desugar to `exec` because
 * the filesystem API has no move or stat call. Commands run through Blaxel's
 * process API, which reports stdout, stderr, and the exit code as separate
 * fields, so no output demultiplexing is needed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createExecBackedGit } from '@tanstack/ai-sandbox'
import { abortable, errorStatus, isNotFound } from './utils'
import type {
  ExecResult,
  ProcessOptions,
  SandboxCapabilities,
  SandboxChannel,
  SandboxHandle,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

export const BLAXEL_CAPS: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  ports: true,
  backgroundProcesses: true,
  // Blaxel's process API streams stdout and stderr but exposes no host→process
  // stdin channel, so adapters that feed a prompt over stdin must write it to a
  // file and redirect instead.
  writableStdin: false,
  // The SDK exposes a server-side kill endpoint, but child-process-group
  // termination has not yet been measured against a live sandbox. Keep journal
  // follow mode disabled until that conformance test can prove it leaves no
  // remote process behind.
  killableProcesses: false,
  // Blaxel's source-scoped snapshot/fork API is a private preview, offers no
  // entitlement probe, and does not document snapshots surviving deletion.
  // TanStack's snapshot contract must reconstruct a sandbox after resume says
  // the source is gone, so neither capability is advertised here.
  snapshots: false,
  // Blaxel supports workspace-level network rules, but this provider does not
  // yet translate `SandboxPolicy` into them. Advertised false until it does.
  networkPolicy: false,
  // The sandbox filesystem persists for the sandbox's lifetime, across exec
  // calls and idle suspend/resume, until it is deleted or its TTL expires.
  durableFilesystem: true,
  fork: false,
}

/** Default workspace root created inside the sandbox. */
export const BLAXEL_DEFAULT_WORKDIR = '/workspace'

/** How long a minted preview token stays valid. */
const PREVIEW_TOKEN_TTL_MS = 60 * 60 * 1000

/** Maximum unread stdout or stderr retained per spawned process. */
const STREAM_BUFFER_LIMIT_BYTES = 8 * 1024 * 1024
const PROCESS_REGISTRATION_RECONCILIATION_MS = 10_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The Blaxel sandbox surface this handle uses, expressed structurally so a real
 * `SandboxInstance` from `@blaxel/core` satisfies it and unit tests can inject a
 * fake without touching the network.
 */
export interface BlaxelSandboxLike {
  metadata?: { labels?: Record<string, string> }
  status?: string
  fs: {
    read: (path: string) => Promise<string>
    readBinary: (path: string) => Promise<Blob>
    write: (path: string, content: string) => Promise<unknown>
    writeBinary: (path: string, content: Uint8Array) => Promise<unknown>
    ls: (path: string) => Promise<BlaxelDirectoryLike>
    mkdir: (path: string, permissions?: string) => Promise<unknown>
    rm: (path: string, recursive?: boolean) => Promise<unknown>
    watch: (
      path: string,
      callback: (event: BlaxelWatchEventLike) => void | Promise<void>,
      options?: { onError?: (error: Error) => void; withContent: boolean },
    ) => { close: () => void }
  }
  process: {
    exec: (request: BlaxelProcessRequestLike) => Promise<BlaxelProcessLike>
    wait: (
      identifier: string,
      options?: { maxWait?: number; interval?: number },
    ) => Promise<BlaxelProcessLike>
    kill: (identifier: string) => Promise<unknown>
    streamLogs: (
      identifier: string,
      options?: {
        onStdout?: (chunk: string) => void
        onStderr?: (chunk: string) => void
        onError?: (error: Error) => void
      },
    ) => { close: () => void; wait: () => Promise<void> }
  }
  previews: {
    createIfNotExists: (preview: {
      metadata: { name: string }
      spec: { port: number; public?: boolean; ttl?: string }
    }) => Promise<BlaxelPreviewLike>
  }
  delete: () => Promise<unknown>
}

export interface BlaxelDirectoryLike {
  files?: Array<{ name: string }>
  subdirectories?: Array<{ name: string }>
}

export interface BlaxelProcessRequestLike {
  command: string
  name?: string
  workingDir?: string
  env?: Record<string, string>
  waitForCompletion?: boolean
  keepAlive?: boolean
  timeout?: number
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

export interface BlaxelProcessLike {
  name?: string
  pid?: string
  stdout?: string
  stderr?: string
  exitCode?: number
  status?: string
  close?: () => void
}

export interface BlaxelPreviewLike {
  spec?: { url?: string; public?: boolean; port?: number }
  tokens: { create: (expiresAt: Date) => Promise<{ value: string }> }
}

export interface BlaxelWatchEventLike {
  op: string
  path: string
  name?: string
}

export interface BlaxelHandleDeps {
  sandbox: BlaxelSandboxLike
  /** Sandbox name — the durable id used to reconnect and destroy. */
  name: string
  /** Working directory inside the sandbox; `/workspace` maps here. */
  workdir: string
  /** Mint public preview URLs instead of token-gated ones. */
  publicPreviews: boolean
  /** TTL applied to previews this handle creates. */
  previewTtl: string
}

export class BlaxelHandle implements SandboxHandle {
  readonly id: string
  readonly provider = 'blaxel'
  readonly workspaceRoot: string
  readonly capabilities: SandboxCapabilities
  readonly fs: SandboxHandle['fs']
  readonly git: SandboxHandle['git']
  readonly process: SandboxHandle['process']
  readonly ports: SandboxHandle['ports']
  readonly env: SandboxHandle['env']

  private readonly sandbox: BlaxelSandboxLike
  private readonly workdir: string
  private readonly publicPreviews: boolean
  private readonly previewTtl: string
  private readonly envVars: Record<string, string> = Object.create(null)
  private destroyPromise?: Promise<void>

  constructor(deps: BlaxelHandleDeps) {
    this.sandbox = deps.sandbox
    this.id = deps.name
    this.workdir = deps.workdir
    this.workspaceRoot = deps.workdir
    this.publicPreviews = deps.publicPreviews
    this.previewTtl = deps.previewTtl
    this.capabilities = BLAXEL_CAPS

    this.process = {
      exec: (command, opts) => this.exec(command, opts),
      spawn: (command, opts) => this.spawnProcess(command, opts),
    }

    this.fs = {
      read: (p) => this.sandbox.fs.read(this.abs(p)),
      readBytes: async (p) => {
        const blob = await this.sandbox.fs.readBinary(this.abs(p))
        return new Uint8Array(await blob.arrayBuffer())
      },
      write: async (p, data) => {
        if (typeof data === 'string') {
          await this.sandbox.fs.write(this.abs(p), data)
          return
        }
        await this.sandbox.fs.writeBinary(this.abs(p), data)
      },
      list: async (p) => {
        const directory = await this.sandbox.fs.ls(this.abs(p))
        // Re-root native absolute paths under the caller's virtual path so
        // consumers stay provider-agnostic.
        const base = p.replace(/\/$/, '')
        return [
          ...(directory.subdirectories ?? []).map((entry) => ({
            name: entry.name,
            path: `${base}/${entry.name}`,
            type: 'dir' as const,
          })),
          ...(directory.files ?? []).map((entry) => ({
            name: entry.name,
            path: `${base}/${entry.name}`,
            type: 'file' as const,
          })),
        ]
      },
      // Blaxel's mkdir creates parents, matching the contract's recursive intent.
      mkdir: async (p) => {
        await this.sandbox.fs.mkdir(this.abs(p))
      },
      // `remove` is unconditionally recursive per the contract; Blaxel's rm
      // needs that opt-in explicitly.
      remove: async (p) => {
        await this.sandbox.fs.rm(this.abs(p), true)
      },
      // No native move call, so shell out. `mv` also gives us the
      // overwrite-destination semantics the contract expects.
      rename: async (from, to) => {
        const result = await this.exec(
          `mv -- ${q(this.abs(from))} ${q(this.abs(to))}`,
        )
        if (result.exitCode !== 0) {
          throw new Error(`rename failed: ${errText(result)}`)
        }
      },
      // No native stat call. `test -e` answers the contract's question directly
      // and does not need the parent directory to be listable.
      exists: async (p) => {
        const result = await this.exec(`test -e ${q(this.abs(p))}`)
        return result.exitCode === 0
      },
      watch: (p, onEvent) => {
        const subscription = this.sandbox.fs.watch(
          this.abs(p),
          (event) => {
            onEvent({ type: event.op, path: this.virtual(eventPath(event)) })
          },
          { withContent: false },
        )
        return Promise.resolve({
          stop: () => {
            subscription.close()
            return Promise.resolve()
          },
        })
      },
    }

    const git = createExecBackedGit(this.process, this.workdir)
    this.git = {
      clone: (input) =>
        git.clone({
          ...input,
          ...(input.dir !== undefined ? { dir: this.abs(input.dir) } : {}),
        }),
      status: (dir) =>
        git.status(dir !== undefined ? this.abs(dir) : undefined),
      add: (paths, dir) =>
        git.add(
          paths.map((path) => this.abs(path)),
          dir !== undefined ? this.abs(dir) : undefined,
        ),
      commit: (message, dir) =>
        git.commit(message, dir !== undefined ? this.abs(dir) : undefined),
      push: (dir) => git.push(dir !== undefined ? this.abs(dir) : undefined),
      pull: (dir) => git.pull(dir !== undefined ? this.abs(dir) : undefined),
      branch: (dir) =>
        git.branch(dir !== undefined ? this.abs(dir) : undefined),
    }

    this.ports = {
      connect: (port) => this.connectPort(port),
    }

    this.env = {
      // Blaxel fixes a sandbox's environment at creation time, so later
      // additions are held here and merged into every command this handle runs.
      set: (vars) => {
        Object.assign(this.envVars, vars)
        return Promise.resolve()
      },
    }
  }

  /** Map the conventional `/workspace` virtual root onto the real workdir. */
  private abs(p: string): string {
    if (this.workdir === BLAXEL_DEFAULT_WORKDIR) return p
    if (p === BLAXEL_DEFAULT_WORKDIR) return this.workdir
    if (p.startsWith(`${BLAXEL_DEFAULT_WORKDIR}/`)) {
      return `${this.workdir}/${p.slice(BLAXEL_DEFAULT_WORKDIR.length + 1)}`
    }
    return p
  }

  /** Map a native path back onto the conventional `/workspace` root. */
  private virtual(p: string): string {
    if (this.workdir === BLAXEL_DEFAULT_WORKDIR) return p
    if (p === this.workdir) return BLAXEL_DEFAULT_WORKDIR
    if (p.startsWith(`${this.workdir}/`)) {
      return `${BLAXEL_DEFAULT_WORKDIR}/${p.slice(this.workdir.length + 1)}`
    }
    return p
  }

  private mergedEnv(extra?: Record<string, string>): Record<string, string> {
    return { ...this.envVars, ...extra }
  }

  /** Names stay unique across resumed handles for the same sandbox. */
  private processName(kind: string): string {
    return `tanstack-ai-${kind}-${randomUUID().replace(/-/g, '')}`
  }

  /**
   * Capture remote stdout/stderr live into byte-bounded files. Fixed-size wire
   * records bound the SDK's newline accumulator, and the terminal path never
   * calls cumulative wait/get.
   */
  private boundedCommand(command: string): {
    command: string
    outputDir: string
    overflowMarker: string
    recordPrefix: string
  } {
    const outputDir = `/tmp/tanstack-ai-output-${randomUUID()}`
    const overflowMarker = `__TANSTACK_AI_OUTPUT_OVERFLOW_${randomUUID()}__`
    const recordPrefix = `__TANSTACK_AI_OUTPUT_CHUNK_${randomUUID()}__:`
    const supervisorDelimiter = `__TANSTACK_AI_SUPERVISOR_${randomUUID().replace(/-/g, '')}__`
    const dir = q(outputDir)
    const outPipe = q(`${outputDir}/stdout.pipe`)
    const errPipe = q(`${outputDir}/stderr.pipe`)
    const outFile = q(`${outputDir}/stdout`)
    const errFile = q(`${outputDir}/stderr`)
    const statusFile = q(`${outputDir}/status`)
    const pidsFile = q(`${outputDir}/pids`)
    const limitsFile = q(`${outputDir}/limits`)
    const supervisorFile = q(`${outputDir}/supervisor.sh`)
    const capture = (
      pipe: string,
      file: string,
      label: 'stdout' | 'stderr',
      redirect = '',
    ): string => {
      const chunkFile = q(`${outputDir}/${label}.chunk`)
      return [
        '(',
        // Count raw bytes explicitly because `ulimit -f` units vary between
        // shells. Every completed chunk is appended before the same bytes are
        // framed for the SDK; the one-byte probe detects exclusive overflow.
        '__tanstack_capture_status=0',
        `: > ${file} || __tanstack_capture_status=1`,
        `__tanstack_remaining=${STREAM_BUFFER_LIMIT_BYTES}`,
        'while [ "$__tanstack_capture_status" -eq 0 ] && [ "$__tanstack_remaining" -gt 0 ]; do',
        '  __tanstack_block=65536',
        '  if [ "$__tanstack_remaining" -lt "$__tanstack_block" ]; then __tanstack_block="$__tanstack_remaining"; fi',
        `  : > ${chunkFile}`,
        `  dd of=${chunkFile} bs="$__tanstack_block" count=1 2>/dev/null`,
        '  __tanstack_dd_status=$?',
        '  if [ "$__tanstack_dd_status" -ne 0 ]; then __tanstack_capture_status=1; break; fi',
        `  __tanstack_chunk_size=$(wc -c < ${chunkFile})`,
        '  [ "$__tanstack_chunk_size" -gt 0 ] || break',
        `  cat ${chunkFile} >> ${file} || { __tanstack_capture_status=1; break; }`,
        `  printf '%s' ${q(recordPrefix)}`,
        `  base64 < ${chunkFile} | tr -d '\r\n'`,
        `  printf '\n'`,
        '  __tanstack_remaining=$((__tanstack_remaining - __tanstack_chunk_size))',
        'done',
        'if [ "$__tanstack_capture_status" -eq 0 ] && [ "$__tanstack_remaining" -eq 0 ]; then',
        `  : > ${chunkFile}`,
        `  dd of=${chunkFile} bs=1 count=1 2>/dev/null`,
        '  __tanstack_dd_status=$?',
        `  __tanstack_probe_size=$(wc -c < ${chunkFile})`,
        '  if [ "$__tanstack_dd_status" -ne 0 ]; then __tanstack_capture_status=1; fi',
        '  if [ "$__tanstack_probe_size" -gt 0 ]; then __tanstack_capture_status=2; fi',
        'fi',
        `rm -f -- ${chunkFile}`,
        'if [ "$__tanstack_capture_status" -ne 0 ]; then',
        `  printf '%s\n' ${q(label)} >> ${limitsFile}`,
        `  printf '%s\n' ${q(overflowMarker)}`,
        'fi',
        `) < ${pipe}${redirect} &`,
      ].join('\n')
    }

    const supervisor = [
      `mkdir -p -- ${dir}`,
      `rm -f -- ${supervisorFile}`,
      `mkfifo -- ${outPipe} ${errPipe}`,
      `: > ${limitsFile}`,
      '__tanstack_reap() {',
      '  __tanstack_reap_status="$1"',
      '  trap - HUP INT TERM',
      '  for __tanstack_pid in "${__tanstack_command:-}" "${__tanstack_stdout_reader:-}" "${__tanstack_stderr_reader:-}"; do',
      '    if [ -n "$__tanstack_pid" ]; then kill -TERM -- "-$__tanstack_pid" 2>/dev/null || true; fi',
      '  done',
      '  sleep 0.1',
      '  for __tanstack_pid in "${__tanstack_command:-}" "${__tanstack_stdout_reader:-}" "${__tanstack_stderr_reader:-}"; do',
      '    if [ -n "$__tanstack_pid" ]; then kill -KILL -- "-$__tanstack_pid" 2>/dev/null || true; fi',
      '  done',
      '  for __tanstack_pid in "${__tanstack_command:-}" "${__tanstack_stdout_reader:-}" "${__tanstack_stderr_reader:-}"; do',
      '    if [ -n "$__tanstack_pid" ]; then wait "$__tanstack_pid" 2>/dev/null || true; fi',
      '  done',
      `  rm -f -- ${outPipe} ${errPipe} ${pidsFile}`,
      '  exit "$__tanstack_reap_status"',
      '}',
      "trap '__tanstack_reap 129' HUP",
      "trap '__tanstack_reap 130' INT",
      "trap '__tanstack_reap 143' TERM",
      // Job control gives each background job a distinct process group. Both
      // this supervisor and a later host-side reaper can then terminate the
      // command and the complete capture pipelines without relying on
      // Blaxel's unproven named-process tree-kill behavior.
      'set -m',
      capture(outPipe, outFile, 'stdout'),
      '__tanstack_stdout_reader=$!',
      capture(errPipe, errFile, 'stderr', ' >&2'),
      '__tanstack_stderr_reader=$!',
      '(',
      command,
      `) > ${outPipe} 2> ${errPipe} &`,
      '__tanstack_command=$!',
      `printf '%s\\n' "$__tanstack_command" "$__tanstack_stdout_reader" "$__tanstack_stderr_reader" > ${pidsFile}`,
      'set +m',
      'wait "$__tanstack_command"',
      '__tanstack_status=$?',
      'wait "$__tanstack_stdout_reader" 2>/dev/null || true',
      'wait "$__tanstack_stderr_reader" 2>/dev/null || true',
      `printf '%s' "$__tanstack_status" > ${statusFile}`,
      `rm -f -- ${outPipe} ${errPipe} ${pidsFile}`,
      'exit "$__tanstack_status"',
    ].join('\n')
    return {
      outputDir,
      overflowMarker,
      recordPrefix,
      // Materialize the supervisor without evaluating it in Blaxel's
      // image-dependent outer shell, then run it in Bash so job-control process
      // groups have consistent semantics. The script unlinks itself on entry.
      command: [
        `mkdir -p -- ${dir}`,
        `cat > ${supervisorFile} <<${q(supervisorDelimiter)}`,
        supervisor,
        supervisorDelimiter,
        `exec bash ${supervisorFile}`,
        '',
      ].join('\n'),
    }
  }

  private async readCapturedOutput(
    outputDir: string,
    stream: 'stdout' | 'stderr',
  ): Promise<string> {
    const [text, limits] = await Promise.all([
      this.sandbox.fs.read(`${outputDir}/${stream}`),
      this.sandbox.fs.read(`${outputDir}/limits`),
    ])
    if (limits.split(/\r?\n/).includes(stream)) {
      throw new Error(
        `blaxel: ${stream} exceeded the ${STREAM_BUFFER_LIMIT_BYTES}-byte remote output limit.`,
      )
    }
    if (Buffer.byteLength(text) > STREAM_BUFFER_LIMIT_BYTES) {
      throw new Error(
        `blaxel: ${stream} exceeded the ${STREAM_BUFFER_LIMIT_BYTES}-byte remote output limit.`,
      )
    }
    return text
  }

  private async cleanupCapturedOutput(outputDir: string): Promise<void> {
    let lastError: unknown
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await this.sandbox.fs.rm(outputDir, true)
        return
      } catch (error) {
        if (isNotFound(error)) return
        lastError = error
        if (attempt < 4) await sleep(Math.min(50 * 2 ** attempt, 500))
      }
    }
    throw lastError
  }

  private async reapProcessGroups(outputDir: string): Promise<void> {
    const pidsFile = q(`${outputDir}/pids`)
    const result = await this.sandbox.process.exec({
      name: this.processName('reap'),
      command: [
        `if [ -r ${pidsFile} ]; then`,
        `  __tanstack_pids=$(cat ${pidsFile})`,
        '  for __tanstack_pid in $__tanstack_pids; do',
        '    case "$__tanstack_pid" in (""|*[!0-9]*) continue ;; esac',
        '    kill -TERM -- "-$__tanstack_pid" 2>/dev/null || true',
        '  done',
        '  sleep 0.1',
        '  for __tanstack_pid in $__tanstack_pids; do',
        '    case "$__tanstack_pid" in (""|*[!0-9]*) continue ;; esac',
        '    kill -KILL -- "-$__tanstack_pid" 2>/dev/null || true',
        '  done',
        'fi',
      ].join('\n'),
      workingDir: this.workdir,
      waitForCompletion: true,
      timeout: 30,
    })
    if ((result.exitCode ?? 0) !== 0) {
      throw new Error(
        `blaxel: remote process-group reaper exited ${result.exitCode ?? 'without a status'}.`,
      )
    }
  }

  private async killEventually(name: string): Promise<void> {
    let lastError: unknown
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await this.sandbox.process.kill(name)
        return
      } catch (error) {
        if (isNotFound(error)) return
        lastError = error
        if (attempt < 7) await sleep(Math.min(25 * 2 ** attempt, 500))
      }
    }
    throw lastError
  }

  private async terminateProcess(
    name: string,
    outputDir: string,
  ): Promise<void> {
    const errors: Array<unknown> = []
    try {
      await this.reapProcessGroups(outputDir)
    } catch (error) {
      errors.push(error)
    }
    try {
      await this.killEventually(name)
    } catch (error) {
      errors.push(error)
    }
    try {
      await this.cleanupCapturedOutput(outputDir)
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `blaxel: failed to fully terminate process ${name} and clean its capture files.`,
      )
    }
  }

  /**
   * A rejected non-idempotent POST can still register its unique name after the
   * response has been lost. Treat 404 as transient for a bounded visibility
   * window and repeat both group reaping and named-process deletion.
   */
  private async reconcileAmbiguousProcessStart(
    name: string,
    outputDir: string,
  ): Promise<void> {
    const deadline = Date.now() + PROCESS_REGISTRATION_RECONCILIATION_MS
    let attempt = 0
    for (;;) {
      const errors: Array<unknown> = []
      try {
        await this.reapProcessGroups(outputDir)
      } catch (error) {
        errors.push(error)
      }

      let killed = false
      try {
        await this.sandbox.process.kill(name)
        killed = true
      } catch (error) {
        if (!isNotFound(error)) errors.push(error)
      }

      // A successful named kill may race the PID file by a few instructions;
      // reap once more before removing the capture metadata.
      if (killed) {
        try {
          await this.reapProcessGroups(outputDir)
        } catch (error) {
          errors.push(error)
        }
      }
      try {
        await this.cleanupCapturedOutput(outputDir)
      } catch (error) {
        errors.push(error)
      }

      if (killed) {
        if (errors.length > 0) {
          throw new AggregateError(
            errors,
            `blaxel: process ${name} appeared after an ambiguous start response, but cleanup was incomplete.`,
          )
        }
        return
      }
      if (Date.now() >= deadline) {
        if (errors.length > 0) {
          throw new AggregateError(
            errors,
            `blaxel: could not reconcile ambiguous process start ${name}.`,
          )
        }
        return
      }
      attempt += 1
      await sleep(Math.min(50 * 2 ** Math.min(attempt, 4), 500))
    }
  }

  private cleanupFailure(
    error: unknown,
    cleanupError: unknown,
    name: string,
  ): AggregateError {
    return new AggregateError(
      [error, cleanupError],
      `blaxel: process ${name} failed and remote cleanup also failed.`,
    )
  }

  private async exec(
    command: string,
    opts?: ProcessOptions,
  ): Promise<ExecResult> {
    const signal = opts?.signal
    signal?.throwIfAborted()
    const name = this.processName('exec')
    const bounded = this.boundedCommand(command)
    const execution = this.sandbox.process.exec({
      name,
      command: bounded.command,
      workingDir: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      env: this.mergedEnv(opts?.env),
      waitForCompletion: true,
    })
    let termination: Promise<void> | undefined
    const terminate = (): Promise<void> =>
      (termination ??= this.terminateProcess(name, bounded.outputDir))
    let executionResolved = false
    const onAbort = (): void => {
      const cleanup = executionResolved
        ? terminate()
        : this.reconcileAmbiguousProcessStart(name, bounded.outputDir)
      void cleanup.catch(() => undefined)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const result = await abortable(execution, signal)
      executionResolved = true
      if (signal?.aborted) {
        await terminate().catch(() => undefined)
        signal.throwIfAborted()
      }
      const [stdout, stderr] = await Promise.all([
        this.readCapturedOutput(bounded.outputDir, 'stdout'),
        this.readCapturedOutput(bounded.outputDir, 'stderr'),
      ])
      await this.cleanupCapturedOutput(bounded.outputDir)
      return {
        stdout,
        stderr,
        exitCode: result.exitCode ?? 0,
      }
    } catch (error) {
      if (signal?.aborted) {
        // The SDK POST cannot be aborted. When it settles, repeat cleanup and
        // use the registration window if the eventual rejection is ambiguous.
        void execution
          .then(
            () => this.terminateProcess(name, bounded.outputDir),
            (startError: unknown) =>
              mayHaveStartedProcess(startError)
                ? this.reconcileAmbiguousProcessStart(name, bounded.outputDir)
                : this.terminateProcess(name, bounded.outputDir),
          )
          .catch(() => undefined)
      }
      try {
        if (!executionResolved && mayHaveStartedProcess(error)) {
          await this.reconcileAmbiguousProcessStart(name, bounded.outputDir)
        } else {
          await terminate()
        }
      } catch (cleanupError) {
        throw this.cleanupFailure(error, cleanupError, name)
      }
      throw error
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private async spawnProcess(
    command: string,
    opts?: ProcessOptions,
  ): Promise<SpawnHandle> {
    const signal = opts?.signal
    signal?.throwIfAborted()
    const name = this.processName('spawn')
    const stdout = new ChunkStream('stdout')
    const stderr = new ChunkStream('stderr')
    const bounded = this.boundedCommand(command)
    let termination: Promise<void> | undefined
    const terminate = (): Promise<void> =>
      (termination ??= this.terminateProcess(name, bounded.outputDir))

    const starting = this.sandbox.process.exec({
      name,
      command: bounded.command,
      workingDir: opts?.cwd ? this.abs(opts.cwd) : this.workdir,
      env: this.mergedEnv(opts?.env),
      waitForCompletion: false,
      // Keep the sandbox awake for the process and do not inherit the SDK's
      // finite keep-alive timeout.
      keepAlive: true,
      timeout: 0,
    })
    const abortStart = (): void => {
      // The SDK POST cannot be aborted and its promise may never settle. Start
      // bounded registration reconciliation now; the settlement callback below
      // remains a later fallback if the process appears after this window.
      void this.reconcileAmbiguousProcessStart(name, bounded.outputDir).catch(
        () => undefined,
      )
    }
    signal?.addEventListener('abort', abortStart, { once: true })

    let started: BlaxelProcessLike
    try {
      started = await abortable(starting, signal)
    } catch (error) {
      stdout.end()
      stderr.end()
      if (signal?.aborted) {
        void starting
          .then(
            () => this.terminateProcess(name, bounded.outputDir),
            (startError: unknown) =>
              mayHaveStartedProcess(startError)
                ? this.reconcileAmbiguousProcessStart(name, bounded.outputDir)
                : this.terminateProcess(name, bounded.outputDir),
          )
          .catch(() => undefined)
      }
      try {
        if (mayHaveStartedProcess(error)) {
          await this.reconcileAmbiguousProcessStart(name, bounded.outputDir)
        } else {
          await terminate()
        }
      } catch (cleanupError) {
        throw this.cleanupFailure(error, cleanupError, name)
      }
      throw error
    } finally {
      signal?.removeEventListener('abort', abortStart)
    }

    let transportError: unknown
    const failTransport = (error: unknown): void => {
      transportError ??= error
      stdout.fail(error)
      stderr.fail(error)
      void terminate().catch(() => undefined)
    }
    const onLine = (stream: ChunkStream, line: string): void => {
      if (line === bounded.overflowMarker) {
        failTransport(
          new Error(
            `blaxel: remote process output exceeded the ${STREAM_BUFFER_LIMIT_BYTES}-byte per-stream limit.`,
          ),
        )
        return
      }
      if (!line.startsWith(bounded.recordPrefix)) {
        failTransport(
          new Error('blaxel: received malformed framed process output.'),
        )
        return
      }
      const encoded = line.slice(bounded.recordPrefix.length)
      const bytes = Buffer.from(encoded, 'base64')
      if (bytes.length === 0 || bytes.toString('base64') !== encoded) {
        failTransport(
          new Error('blaxel: received invalid encoded process output.'),
        )
        return
      }
      if (!stream.pushBytes(bytes)) {
        void terminate().catch(() => undefined)
      }
    }
    const logs = this.sandbox.process.streamLogs(name, {
      onStdout: (line) => onLine(stdout, line),
      onStderr: (line) => onLine(stderr, line),
      onError: failTransport,
    })

    const removeAbort = (): void =>
      signal?.removeEventListener('abort', onAbort)
    const closeControls = (): void => {
      logs.close()
      started.close?.()
      removeAbort()
    }
    let killPromise: Promise<void> | undefined
    const kill = (): Promise<void> => {
      killPromise ??= terminate().finally(() => {
        closeControls()
        stdout.end()
        stderr.end()
      })
      return killPromise
    }
    const onAbort = (): void => {
      void kill().catch(() => undefined)
    }

    if (signal?.aborted) {
      await kill().catch(() => undefined)
      signal.throwIfAborted()
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    // Fixed-size encoded records preserve delimiters and keep the SDK's own
    // line accumulator bounded; the raw capture keeps the authoritative total
    // bounded. Cumulative process.wait/get is never materialized in host memory.
    const terminal = logs
      .wait()
      .then(async () => {
        if (transportError !== undefined) throw transportError
        const streamError = stdout.failure ?? stderr.failure
        if (streamError !== undefined) throw streamError
        const [finalStdout, finalStderr, statusText] = await Promise.all([
          this.readCapturedOutput(bounded.outputDir, 'stdout'),
          this.readCapturedOutput(bounded.outputDir, 'stderr'),
          this.sandbox.fs.read(`${bounded.outputDir}/status`),
        ])
        const exitCode = Number.parseInt(statusText, 10)
        if (!Number.isInteger(exitCode)) {
          throw new Error(
            `blaxel: background process ${name} ended without a valid exit status.`,
          )
        }
        stdout.finish(finalStdout)
        stderr.finish(finalStderr)
        return exitCode
      })
      .catch((error: unknown) => {
        stdout.fail(error)
        stderr.fail(error)
        throw error
      })

    const completion = terminal.then(
      async (exitCode) => {
        closeControls()
        await this.cleanupCapturedOutput(bounded.outputDir)
        return exitCode
      },
      async (error: unknown) => {
        closeControls()
        try {
          await terminate()
        } catch (cleanupError) {
          throw this.cleanupFailure(error, cleanupError, name)
        }
        throw error
      },
    )
    void completion.catch(() => undefined)

    return {
      pid: Number.parseInt(started.pid ?? '', 10) || -1,
      stdout: stdout.iterable,
      stderr: stderr.iterable,
      stdin: {
        write: () =>
          Promise.reject(
            new Error(
              'blaxel: background process stdin is not writable (see capabilities.writableStdin)',
            ),
          ),
        end: () => Promise.resolve(),
      },
      wait: () => completion,
      kill,
    }
  }

  private async connectPort(port: number): Promise<SandboxChannel> {
    const preview = await this.sandbox.previews.createIfNotExists({
      metadata: { name: previewName(port) },
      spec: {
        port,
        public: this.publicPreviews,
        ttl: this.previewTtl,
      },
    })
    const actualPort = preview.spec?.port
    if (actualPort !== port) {
      throw new Error(
        `blaxel: existing preview ${previewName(port)} targets port=${String(actualPort)}, but this provider requested port=${port}. Delete the stale preview before reconnecting.`,
      )
    }
    const actualPublic = preview.spec?.public ?? false
    if (actualPublic !== this.publicPreviews) {
      throw new Error(
        `blaxel: existing preview ${previewName(port)} has public=${String(actualPublic)}, but this provider requested public=${String(this.publicPreviews)}. Delete the stale preview before reconnecting.`,
      )
    }

    const url = preview.spec?.url
    if (!url) {
      throw new Error(
        `blaxel: preview for port ${port} did not report a URL. Retry once the sandbox reports ready.`,
      )
    }
    if (this.publicPreviews) return { url }

    // Keep the credential out of the URL and report Blaxel's explicit preview
    // header. The separate token field remains available to channel consumers.
    const token = await preview.tokens.create(
      new Date(Date.now() + PREVIEW_TOKEN_TTL_MS),
    )
    if (!token.value) {
      throw new Error(
        `blaxel: preview for port ${port} returned an empty token.`,
      )
    }
    return {
      url,
      token: token.value,
      headers: { 'X-Blaxel-Preview-Token': token.value },
    }
  }

  destroy(): Promise<void> {
    this.destroyPromise ??= this.sandbox
      .delete()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.destroyPromise = undefined
        throw error
      })
    return this.destroyPromise
  }
}

/** Preview names are scoped to their sandbox, so the port alone keeps them
 * distinct, and deriving it from the port keeps `connect()` idempotent. */
export function previewName(port: number): string {
  return `tanstack-ai-${port}`
}

/** Exposes a bounded remote capture as the `SpawnHandle` async iterable. */
class ChunkStream {
  private readonly buffer: Array<string | undefined> = []
  private readonly emittedHash = createHash('sha256')
  private readonly decoder = new TextDecoder()
  private head = 0
  private bufferedBytes = 0
  private emittedLength = 0
  private resolveNext: (() => void) | undefined
  private done = false
  private terminalError: unknown

  constructor(private readonly label: 'stdout' | 'stderr') {}

  push(chunk: string): boolean {
    if (this.done) return false
    const bytes = Buffer.byteLength(chunk)
    if (this.bufferedBytes + bytes > STREAM_BUFFER_LIMIT_BYTES) {
      this.fail(
        new Error(
          `blaxel: unread ${this.label} exceeded the ${STREAM_BUFFER_LIMIT_BYTES}-byte stream buffer limit; consume spawned output continuously.`,
        ),
      )
      return false
    }
    this.bufferedBytes += bytes
    if (chunk) this.buffer.push(chunk)
    this.wake()
    return true
  }

  /** Decode one independently framed raw-output chunk. */
  pushBytes(bytes: Uint8Array): boolean {
    return this.push(this.decoder.decode(bytes, { stream: true }))
  }

  /**
   * Reconcile live callbacks with the exact bounded remote capture. Bytes not
   * yet consumed can be replaced; already emitted bytes must match exactly.
   */
  finish(finalText: string): void {
    if (this.done) return
    const trailing = this.decoder.decode()
    if (trailing && !this.push(trailing)) throw this.terminalError
    const emittedPrefix = finalText.slice(0, this.emittedLength)
    if (
      finalText.length < this.emittedLength ||
      createHash('sha256').update(emittedPrefix).digest('hex') !==
        this.emittedHash.copy().digest('hex')
    ) {
      this.clearBuffer()
      const error = new Error(
        `blaxel: progressive ${this.label} diverged from the completed process output.`,
      )
      this.fail(error)
      throw error
    }

    const remainder = finalText.slice(this.emittedLength)
    this.clearBuffer()
    if (Buffer.byteLength(remainder) > STREAM_BUFFER_LIMIT_BYTES) {
      const error = new Error(
        `blaxel: unread ${this.label} exceeded the ${STREAM_BUFFER_LIMIT_BYTES}-byte stream buffer limit; consume spawned output continuously.`,
      )
      this.fail(error)
      throw error
    }
    if (remainder) {
      this.buffer.push(remainder)
      this.bufferedBytes = Buffer.byteLength(remainder)
    }
    this.end()
  }

  get failure(): unknown {
    return this.terminalError
  }

  fail(error: unknown): void {
    if (this.done) return
    this.terminalError = error
    this.done = true
    this.wake()
  }

  end(): void {
    if (this.done) return
    this.done = true
    this.wake()
  }

  private clearBuffer(): void {
    this.buffer.length = 0
    this.head = 0
    this.bufferedBytes = 0
  }

  private wake(): void {
    const wake = this.resolveNext
    this.resolveNext = undefined
    wake?.()
  }

  readonly iterable: AsyncIterable<string> = {
    [Symbol.asyncIterator]: (): AsyncIterator<string> => ({
      next: async (): Promise<IteratorResult<string>> => {
        for (;;) {
          const chunk = this.buffer[this.head]
          if (chunk !== undefined) {
            this.buffer[this.head] = undefined
            this.head += 1
            this.bufferedBytes -= Buffer.byteLength(chunk)
            this.emittedLength += chunk.length
            this.emittedHash.update(chunk)
            if (this.head > 1024 && this.head * 2 > this.buffer.length) {
              this.buffer.splice(0, this.head)
              this.head = 0
            }
            return { value: chunk, done: false }
          }
          if (this.done) {
            this.buffer.length = 0
            this.head = 0
            if (this.terminalError !== undefined) throw this.terminalError
            return { value: undefined, done: true }
          }
          await new Promise<void>((resolve) => {
            this.resolveNext = resolve
          })
        }
      },
    }),
  }
}

/** Blaxel reports a watch event as a directory plus an entry name. */
function eventPath(event: BlaxelWatchEventLike): string {
  if (!event.name) return event.path
  return event.path.endsWith('/')
    ? `${event.path}${event.name}`
    : `${event.path}/${event.name}`
}

/** A lost POST response can arrive before the accepted process is observable. */
function mayHaveStartedProcess(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  ) {
    return false
  }
  const status = errorStatus(error)
  return (
    status === undefined ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  )
}

/** POSIX single-quote escape for embedding paths in a shell command. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Best available error text from a failed command. */
function errText(result: ExecResult): string {
  return result.stderr.trim() || result.stdout.trim() || '(no output)'
}
