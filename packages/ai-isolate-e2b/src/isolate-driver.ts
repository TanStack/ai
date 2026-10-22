import { randomUUID } from 'node:crypto'
import { runnerSource } from './runner'
import type {
  ExecutionResult,
  IsolateConfig,
  IsolateContext,
  IsolateDriver,
  ToolBinding,
} from '@tanstack/ai-code-mode'
import type { RunnerMessage, ToolReply } from './runner'

/** The slice of an E2B `CommandHandle` the driver uses. */
export interface E2BCommandHandleLike {
  readonly pid: number
  wait: () => Promise<{ exitCode: number }>
  kill: () => Promise<boolean>
  sendStdin: (data: string) => Promise<void>
}

/**
 * The slice of an E2B `Sandbox` (from `e2b` or `@e2b/code-interpreter`) the
 * driver uses. The template must provide `node`, `setsid` and `timeout`; the
 * default E2B templates do.
 */
export interface E2BSandboxLike {
  files: {
    write: (path: string, data: string) => Promise<unknown>
  }
  commands: {
    run: {
      (
        cmd: string,
        opts: {
          background: true
          stdin: true
          timeoutMs: number
          onStdout: (data: string) => void
          onStderr: (data: string) => void
        },
      ): Promise<E2BCommandHandleLike>
      (cmd: string): Promise<unknown>
    }
  }
}

export interface E2BIsolateDriverConfig {
  /**
   * Caller-owned E2B sandbox. Each execution runs as its own `node` process
   * in it; the driver never creates, pauses or kills the sandbox itself.
   */
  sandbox: E2BSandboxLike

  /**
   * Default execution timeout in milliseconds, including tool calls
   * (default: 30000). A per-context `timeout` overrides it.
   */
  timeout?: number
}

/** Stdout plus stderr a single execution may produce before it is killed. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const STDERR_TAIL = 2048

function validateTimeout(timeout: number): number {
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('timeout must be a finite positive number')
  }
  return timeout
}

// The limit goes into a shell command, so only a plain integer may pass.
function validateMemoryLimit(memoryLimit: number): number {
  if (!Number.isSafeInteger(memoryLimit) || memoryLimit <= 0) {
    throw new Error('memoryLimit must be a positive integer (MB)')
  }
  return memoryLimit
}

function failure(
  name: string,
  message: string,
  logs: Array<string>,
): ExecutionResult<never> {
  return { success: false, error: { name, message }, logs }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A killed, expired or paused sandbox. Measured on e2b 2.51: `commands.run`
 * throws `SandboxNotFoundError`, `files.write` a `TimeoutError` whose message
 * says the sandbox was not found.
 */
function isSandboxGone(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'SandboxNotFoundError' ||
    (error.name === 'TimeoutError' &&
      error.message.includes('sandbox was not found'))
  )
}

const UNCONFIRMED_STOP =
  'The process could not be confirmed stopped and may still be running in the sandbox.'

function noteUnconfirmed<T>(result: ExecutionResult<T>): ExecutionResult<T> {
  const logs = [...(result.logs ?? []), UNCONFIRMED_STOP]
  const error = result.error
  if (result.success || error === undefined) return { ...result, logs }
  return {
    ...result,
    logs,
    error: {
      ...error,
      message: `${error.message} ${UNCONFIRMED_STOP}`,
    },
  }
}

function exitCodeOf(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null || !('exitCode' in value)) {
    return undefined
  }
  return typeof value.exitCode === 'number' ? value.exitCode : undefined
}

/** `kill` exits non-zero when the group is already gone. That is a confirmed stop. */
function groupAlreadyGone(value: unknown): boolean {
  const stderr =
    typeof value === 'object' &&
    value !== null &&
    'stderr' in value &&
    typeof value.stderr === 'string'
      ? value.stderr
      : ''
  const message = value instanceof Error ? value.message : ''
  return /no such process/i.test(`${stderr}\n${message}`)
}

/**
 * Code in the sandbox can reach the runner's stdout, so every message is
 * checked before the host acts on it.
 */
function isRunnerMessage(value: unknown): value is RunnerMessage {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  if (m.type === 'log') return typeof m.line === 'string'
  if (m.type === 'tool')
    return typeof m.id === 'string' && typeof m.name === 'string'
  if (m.type !== 'done' || typeof m.success !== 'boolean') return false
  if (m.success) return true
  const error = m.error as Record<string, unknown> | null | undefined
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof error.name === 'string' &&
    typeof error.message === 'string'
  )
}

async function runTool(
  bindings: Record<string, ToolBinding>,
  id: string,
  name: string,
  args: unknown,
): Promise<ToolReply> {
  const binding = Object.hasOwn(bindings, name) ? bindings[name] : undefined
  if (!binding) return { id, success: false, error: `Unknown tool: ${name}` }
  try {
    return { id, success: true, value: await binding.execute(args) }
  } catch (error) {
    return { id, success: false, error: errorMessage(error) }
  }
}

type KillOutcome = 'killed' | 'gone' | 'unconfirmed'

class E2BIsolateContext implements IsolateContext {
  private disposed = false
  /** Stops each in-flight execution; used by `dispose`. */
  private readonly running = new Set<() => Promise<void>>()

  constructor(
    private readonly sandbox: E2BSandboxLike,
    private readonly bindings: Record<string, ToolBinding>,
    private readonly timeoutMs: number,
    private readonly memoryLimitMb: number,
  ) {}

  /**
   * SIGKILL the process group the execution leads (`setsid`). This reaches
   * processes the code spawned, unless they moved to a group of their own
   * (`detached`). A non-zero kill is unconfirmed, except when the group is
   * already gone.
   */
  private async killGroup(handle: E2BCommandHandleLike): Promise<KillOutcome> {
    let outcome: KillOutcome = 'killed'
    try {
      const result = await this.sandbox.commands.run(
        `kill -KILL -- -${handle.pid}`,
      )
      const code = exitCodeOf(result)
      if (code !== undefined && code !== 0 && !groupAlreadyGone(result)) {
        outcome = 'unconfirmed'
      }
    } catch (error: unknown) {
      if (isSandboxGone(error)) outcome = 'gone'
      else if (!groupAlreadyGone(error)) outcome = 'unconfirmed'
    }
    // Also ends the SDK's event stream for this command.
    try {
      await handle.kill()
    } catch (error: unknown) {
      if (isSandboxGone(error)) outcome = 'gone'
      else outcome = 'unconfirmed'
    }
    return outcome
  }

  /** Best effort: the runner deletes its own file once it starts. */
  private removeFile(file: string): void {
    void this.sandbox.commands.run(`rm -f ${file}`).catch(() => undefined)
  }

  async execute<T = unknown>(code: string): Promise<ExecutionResult<T>> {
    if (this.disposed) {
      return failure('DisposedError', 'Context has been disposed', [])
    }
    const deadline = Date.now() + this.timeoutMs
    const logs: Array<string> = []
    const marker = `__TANSTACK_CODE_MODE_${randomUUID()}__:`
    const file = `/tmp/tanstack-code-mode-${randomUUID()}.js`

    let source: string
    try {
      source = runnerSource(code, Object.keys(this.bindings), marker)
    } catch (error) {
      return failure('E2BExecutionError', errorMessage(error), logs)
    }

    // The first outcome wins: the program's result, or the host stopping it.
    let finished = false
    let resolveOutcome!: (result: ExecutionResult<T>) => void
    const outcome = new Promise<ExecutionResult<T>>((r) => (resolveOutcome = r))
    const finish = (result: ExecutionResult<T>): void => {
      if (finished) return
      finished = true
      resolveOutcome(result)
    }
    // Stdout events can arrive before `commands.run` resolves.
    let started!: (h: E2BCommandHandleLike | undefined) => void
    const handle = new Promise<E2BCommandHandleLike | undefined>(
      (r) => (started = r),
    )

    let halting: Promise<void> | undefined
    let commandStarted = false
    /**
     * Stop the run. If the process has not started, report at once so a hung
     * `files.write` or `commands.run` cannot hold the caller. If it has
     * started, kill first: a dead sandbox replaces the reason.
     */
    const halt = (name: string, message: string): Promise<void> => {
      if (finished) return halting ?? Promise.resolve()
      finished = true
      halting = (async () => {
        if (!commandStarted) {
          resolveOutcome(failure(name, message, logs))
          const h = await handle
          if (h && (await this.killGroup(h)) === 'unconfirmed') {
            logs.push(UNCONFIRMED_STOP)
          }
          return
        }
        const h = await handle
        const killed = h ? await this.killGroup(h) : 'killed'
        resolveOutcome(
          killed === 'gone'
            ? failure(
                'E2BSandboxUnavailableError',
                'The E2B sandbox stopped during execution (killed, expired or paused).',
                logs,
              )
            : failure(
                name,
                killed === 'unconfirmed'
                  ? `${message} ${UNCONFIRMED_STOP}`
                  : message,
                logs,
              ),
        )
      })()
      return halting
    }
    const stopHere = (): Promise<void> =>
      halt('DisposedError', 'Context was disposed during execution.')
    this.running.add(stopHere)

    let outputBytes = 0
    let stderrTail = ''
    let outOfMemory = false
    const countOutput = (data: string): void => {
      outputBytes += Buffer.byteLength(data)
      if (outputBytes > MAX_OUTPUT_BYTES) {
        void halt(
          'OutputLimitError',
          `Execution produced more than ${MAX_OUTPUT_BYTES} bytes of output.`,
        )
      }
    }
    const reply = async (name: string, answer: ToolReply): Promise<void> => {
      let line: string
      try {
        line = JSON.stringify(answer)
      } catch (error) {
        line = JSON.stringify({
          id: answer.id,
          success: false,
          error: `${name} returned a value that is not JSON-serializable: ${errorMessage(error)}`,
        })
      }
      try {
        await (await handle)?.sendStdin(`${line}\n`)
      } catch (error) {
        await halt(
          'E2BExecutionError',
          `Could not deliver the result of ${name} to the sandbox: ${errorMessage(error)}.`,
        )
      }
    }
    const onMessage = (message: RunnerMessage): void => {
      if (finished) return
      if (message.type === 'log') {
        logs.push(message.line)
      } else if (message.type === 'done') {
        finish(
          message.success
            ? { success: true, value: message.value as T, logs }
            : { success: false, error: message.error, logs },
        )
      } else {
        const { id, name, args } = message
        void runTool(this.bindings, id, name, args).then((answer) =>
          finished ? undefined : reply(name, answer),
        )
      }
    }
    let buffered = ''
    const onStdout = (data: string): void => {
      countOutput(data)
      buffered += data
      let newline
      while ((newline = buffered.indexOf('\n')) !== -1) {
        const line = buffered.slice(0, newline)
        buffered = buffered.slice(newline + 1)
        if (!line.startsWith(marker)) continue
        let message: unknown
        try {
          message = JSON.parse(line.slice(marker.length))
        } catch {
          message = undefined
        }
        if (isRunnerMessage(message)) onMessage(message)
        else
          void halt(
            'E2BExecutionError',
            'Malformed protocol line from sandbox.',
          )
      }
    }
    const onStderr = (data: string): void => {
      countOutput(data)
      const recent = stderrTail + data
      // V8 prints this before a long stack trace that would push it out of the tail.
      if (recent.includes('heap out of memory')) outOfMemory = true
      stderrTail = recent.slice(-STDERR_TAIL)
    }

    // The budget starts now: writing the file and starting the process count.
    const timer = setTimeout(() => {
      void halt(
        'TimeoutError',
        `Exceeded E2B execution timeout (${this.timeoutMs}ms).`,
      )
    }, this.timeoutMs)
    // Start in the background so a deadline resolves while write or run is open.
    void (async () => {
      let command: E2BCommandHandleLike
      try {
        await this.sandbox.files.write(file, source)
        if (finished) {
          started(undefined)
          this.removeFile(file)
          return
        }
        const budgetSeconds = Math.ceil((deadline - Date.now()) / 1000) + 1
        command = await this.sandbox.commands.run(
          // `setsid` makes the process a group leader so a kill reaches its
          // children; `timeout` bounds an orphan if this host goes away.
          `exec setsid timeout -s KILL ${budgetSeconds} node --max-old-space-size=${this.memoryLimitMb} ${file}`,
          { background: true, stdin: true, timeoutMs: 0, onStdout, onStderr },
        )
      } catch (error) {
        started(undefined)
        this.removeFile(file)
        finish(this.startFailure(error, logs))
        return
      }
      commandStarted = true
      started(command)
      if (finished) return
      void command.wait().then(
        (result) =>
          this.exited(result.exitCode, finish, outOfMemory, stderrTail, logs),
        (error: unknown) => {
          const exit = exitCodeOf(error)
          if (exit !== undefined) {
            this.exited(exit, finish, outOfMemory, stderrTail, logs)
            return
          }
          void halt(
            'E2BExecutionError',
            `Lost the connection to the sandbox process; its outcome is unknown: ${errorMessage(error)}.`,
          )
        },
      )
    })()
    try {
      const result = await outcome
      // A halt already owns the kill. A normal finish kills here, before return,
      // so an unconfirmed stop is part of the result and `dispose` does not throw.
      if (!halting) {
        const h = await handle
        if (h) {
          const killed = await this.killGroup(h)
          if (killed === 'unconfirmed') return noteUnconfirmed(result)
        }
      }
      return result
    } finally {
      clearTimeout(timer)
      this.running.delete(stopHere)
    }
  }

  /** The process exited on its own, without sending a result. */
  private exited<T>(
    exitCode: number,
    finish: (result: ExecutionResult<T>) => void,
    outOfMemory: boolean,
    stderrTail: string,
    logs: Array<string>,
  ): void {
    finish(
      outOfMemory
        ? failure(
            'MemoryLimitError',
            `Execution exceeded the memory limit (${this.memoryLimitMb}MB).`,
            logs,
          )
        : failure(
            'E2BExecutionError',
            `Sandbox process exited with code ${exitCode} before returning a result.${stderrTail ? ` stderr: ${stderrTail}` : ''}`,
            logs,
          ),
    )
  }

  /** Writing the file or starting the process failed. */
  private startFailure(error: unknown, logs: Array<string>) {
    if (isSandboxGone(error)) {
      return failure(
        'E2BSandboxUnavailableError',
        `The E2B sandbox is not running (killed, expired or paused): ${errorMessage(error)}`,
        logs,
      )
    }
    return failure(
      'E2BExecutionError',
      `Could not confirm that the program started in the E2B sandbox: ${errorMessage(error)}`,
      logs,
    )
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.all([...this.running].map((stopRun) => stopRun()))
  }
}

/**
 * Code Mode isolate driver that runs generated code in a caller-owned E2B
 * sandbox and keeps tool implementations on the host.
 */
export function createE2BIsolateDriver(
  config: E2BIsolateDriverConfig,
): IsolateDriver {
  const defaultTimeout = validateTimeout(config.timeout ?? 30_000)
  return {
    // Async so a bad per-context option rejects instead of throwing.
    async createContext(isolateConfig: IsolateConfig): Promise<IsolateContext> {
      return new E2BIsolateContext(
        config.sandbox,
        isolateConfig.bindings,
        validateTimeout(isolateConfig.timeout ?? defaultTimeout),
        validateMemoryLimit(isolateConfig.memoryLimit ?? 128),
      )
    },
  }
}
