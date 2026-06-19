/**
 * Internal persistent bootstrap shell.
 *
 * Spawns a single `sh` process via {@link SandboxHandle.process.spawn} and
 * drives it over stdin/stdout with a sentinel-echo protocol. Commands run
 * sequentially inside the same shell so `cd`, exported variables, etc. persist
 * across calls — exactly the exec model the bootstrap setup plan needs.
 *
 * This module is internal-only and must NOT be re-exported from
 * `packages/ai-sandbox/src/index.ts`.
 */
import type { SandboxHandle } from './contracts'

/** The surface the bootstrap engine uses. */
export interface BootstrapShell {
  /** Run a shell command and capture its stdout + exit code. */
  run: (command: string) => Promise<{ exitCode: number; stdout: string }>
  /**
   * Snapshot the shell's current working directory and exported environment.
   * Used to fork parallel exec calls that inherit the serial shell's state.
   */
  forkState: () => Promise<{ cwd: string; env: Record<string, string> }>
  /** End the shell session (closes stdin, kills the process). */
  dispose: () => Promise<void>
}

/** Options for {@link createBootstrapShell}. */
export interface BootstrapShellOptions {
  /** Working directory to start the shell in (passed as ProcessOptions.cwd). */
  cwd?: string
}

/**
 * Spawn one `sh` process and return a {@link BootstrapShell} that drives it
 * via the sentinel-echo protocol.
 *
 * Protocol: for each `run(cmd)` call, we write
 *   `<cmd>; printf "\n__BSSH_<N>__ $?\n"` to stdin, then read stdout lines
 * until we see a line matching `__BSSH_<N>__ <exitCode>`. Everything before
 * that line is the command's stdout; the trailing integer is the exit code.
 * The counter `N` is a module-level monotonic integer — no Date.now / random.
 */
export async function createBootstrapShell(
  handle: SandboxHandle,
  opts: BootstrapShellOptions = {},
): Promise<BootstrapShell> {
  const proc = await handle.process.spawn('sh', { cwd: opts.cwd })

  /*
   * We need to read stdout lines across multiple run() calls while keeping
   * the iterator open. Buffer chunks into lines manually.
   */
  const lineBuffer: Array<string> = []
  let pending: Array<(line: string) => void> = []
  let streamDone = false

  /** Feed the stdout async-iterable into the shared line queue. */
  async function drainStdout(): Promise<void> {
    let partial = ''
    for await (const chunk of proc.stdout) {
      partial += chunk
      const parts = partial.split('\n')
      // All but the last element are complete lines.
      for (let i = 0; i < parts.length - 1; i++) {
        const line = parts[i] as string
        const resolver = pending.shift()
        if (resolver !== undefined) {
          resolver(line)
        } else {
          lineBuffer.push(line)
        }
      }
      partial = parts[parts.length - 1] as string
    }
    // Flush any trailing partial line.
    if (partial.length > 0) {
      const line = partial
      const resolver = pending.shift()
      if (resolver !== undefined) {
        resolver(line)
      } else {
        lineBuffer.push(line)
      }
    }
    streamDone = true
    // Resolve any remaining waiters with an empty sentinel so they unblock.
    for (const resolver of pending) {
      resolver('')
    }
    pending = []
  }

  // Start draining immediately; do NOT await — runs concurrently.
  const drainPromise = drainStdout()

  /** Read the next line from the shared queue. */
  function nextLine(): Promise<string> {
    const buffered = lineBuffer.shift()
    if (buffered !== undefined) {
      return Promise.resolve(buffered)
    }
    if (streamDone) {
      return Promise.resolve('')
    }
    return new Promise<string>((resolve) => {
      pending.push(resolve)
    })
  }

  let counter = 0

  async function run(
    command: string,
  ): Promise<{ exitCode: number; stdout: string }> {
    const id = counter
    counter += 1
    const sentinel = `__BSSH_${id}__`

    // Write the command followed by a sentinel printf to stdin.
    await proc.stdin.write(`${command}; printf "\\n${sentinel} $?\\n"\n`)

    const outputLines: Array<string> = []

    // Read lines until we find the sentinel.
    for (;;) {
      const line = await nextLine()
      if (line.startsWith(`${sentinel} `)) {
        const codeStr = line.slice(sentinel.length + 1).trim()
        const exitCode = parseInt(codeStr, 10)
        return {
          exitCode: Number.isFinite(exitCode) ? exitCode : 1,
          stdout: outputLines.join('\n'),
        }
      }
      outputLines.push(line)
    }
  }

  async function forkState(): Promise<{
    cwd: string
    env: Record<string, string>
  }> {
    const pwdResult = await run('pwd')
    const cwd = pwdResult.stdout.trim()

    const exportResult = await run('export -p')
    const env: Record<string, string> = {}

    // Parse `declare -x NAME="VALUE"` or `export NAME="VALUE"` lines.
    for (const line of exportResult.stdout.split('\n')) {
      const trimmed = line.trim()
      // Match `declare -x KEY=...` or `export KEY=...` forms.
      const match =
        /^(?:declare\s+-x\s+|export\s+)([A-Za-z_][A-Za-z0-9_]*)(?:="((?:[^"\\]|\\.)*)")?$/.exec(
          trimmed,
        )
      if (match === null) continue
      const key = match[1]
      if (key === undefined) continue
      // Value may be absent for exported-but-unset vars; skip those.
      const raw = match[2]
      if (raw === undefined) continue
      // Unescape backslash-escaped chars inside double quotes.
      env[key] = raw.replace(/\\(.)/g, '$1')
    }

    return { cwd, env }
  }

  async function dispose(): Promise<void> {
    await proc.stdin.end()
    await proc.kill()
    // Drain the stdout iterator to completion so there are no dangling promises.
    await drainPromise
  }

  return { run, forkState, dispose }
}
