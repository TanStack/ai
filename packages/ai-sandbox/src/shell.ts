/**
 * Internal persistent bootstrap shell.
 *
 * Spawns a single `sh` process via {@link SandboxHandle.process.spawn} and
 * drives it over stdin/stdout with a sentinel-echo protocol. Commands run
 * sequentially inside the same shell so `cd`, exported variables, etc. persist
 * across calls — exactly the exec model the bootstrap setup plan needs.
 *
 * Providers WITHOUT a writable host→process stdin (`capabilities.writableStdin
 * === false`, e.g. Cloudflare / Daytona / Vercel) can't be driven over stdin, so
 * {@link createBootstrapShell} transparently falls back to an exec-backed shell
 * ({@link createExecBootstrapShell}) that threads `cwd`/env across `exec` calls
 * to reproduce the same persistent-shell semantics.
 *
 * This module is internal-only and must NOT be re-exported from
 * `packages/ai-sandbox/src/index.ts`.
 */
import type { SandboxHandle } from './contracts'

/**
 * Parse the output of `export -p` (or `declare -x`) into a plain env map.
 * Shared by the stdin shell's `forkState` and the exec-backed shell.
 */
function parseExports(output: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of output.split('\n')) {
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
  return env
}

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
  // Providers without a writable host→process stdin can't run the sentinel-echo
  // protocol below (it feeds commands over stdin), so use the exec-backed shell.
  if (!handle.capabilities.writableStdin) {
    return createExecBootstrapShell(handle, opts)
  }
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

    // Write the command followed by a sentinel printf to stdin. Merge the
    // command's stderr into stdout (`{ … ; } 2>&1`) so a failing setup step's
    // error text is captured and can be surfaced — otherwise only the exit code
    // is visible. `$?` after the group is still the command's own exit code.
    await proc.stdin.write(
      `{ ${command} ; } 2>&1; printf "\\n${sentinel} $?\\n"\n`,
    )

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
    return { cwd, env: parseExports(exportResult.stdout) }
  }

  async function dispose(): Promise<void> {
    await proc.stdin.end()
    await proc.kill()
    // Drain the stdout iterator to completion so there are no dangling promises.
    await drainPromise
  }

  return { run, forkState, dispose }
}

/**
 * Exec-backed {@link BootstrapShell} for providers WITHOUT a writable stdin.
 *
 * There is no persistent process to feed commands into, so persistence of `cd`
 * and exported variables is reproduced by threading state across discrete
 * {@link SandboxHandle.process.exec} calls: each `run()` executes the command in
 * the tracked cwd+env, then captures the resulting `pwd` and `export -p` (via
 * marker lines) so the NEXT command inherits any directory change or exports.
 */
export function createExecBootstrapShell(
  handle: SandboxHandle,
  opts: BootstrapShellOptions = {},
): BootstrapShell {
  let cwd = opts.cwd ?? '/'
  let env: Record<string, string> = {}
  let counter = 0

  async function run(
    command: string,
  ): Promise<{ exitCode: number; stdout: string }> {
    const id = counter
    counter += 1
    const sentinel = `__BSSH_${id}__`

    // Run the command, then emit its exit code, cwd and exported env behind
    // marker lines so we can recover state even when the command itself fails
    // (no `set -e`). Capturing `$?` immediately after the command keeps the
    // reported exit code the command's own, not the trailing introspection's.
    const script = [
      command,
      `__bssh_rc=$?`,
      `printf '\\n%s %s\\n' '${sentinel}' "$__bssh_rc"`,
      `printf '%s\\n' '${sentinel}_CWD'`,
      `pwd`,
      `printf '%s\\n' '${sentinel}_ENV'`,
      `export -p`,
    ].join('\n')

    const res = await handle.process.exec(script, { cwd, env })

    const cmdOut: Array<string> = []
    const cwdLines: Array<string> = []
    const envLines: Array<string> = []
    let exitCode = res.exitCode
    let phase: 'cmd' | 'await-cwd' | 'cwd' | 'env' = 'cmd'

    for (const line of res.stdout.split('\n')) {
      if (phase === 'cmd') {
        if (line.startsWith(`${sentinel} `)) {
          const parsed = parseInt(line.slice(sentinel.length + 1).trim(), 10)
          exitCode = Number.isFinite(parsed) ? parsed : res.exitCode
          phase = 'await-cwd'
          continue
        }
        cmdOut.push(line)
      } else if (phase === 'await-cwd') {
        if (line === `${sentinel}_CWD`) phase = 'cwd'
      } else if (phase === 'cwd') {
        if (line === `${sentinel}_ENV`) phase = 'env'
        else cwdLines.push(line)
      } else {
        envLines.push(line)
      }
    }

    // `pwd` prints a single line; the last non-empty one is the new cwd.
    const newCwd = cwdLines
      .map((l) => l.trim())
      .filter(Boolean)
      .pop()
    if (newCwd) cwd = newCwd
    const newEnv = parseExports(envLines.join('\n'))
    if (Object.keys(newEnv).length > 0) env = newEnv

    return { exitCode, stdout: cmdOut.join('\n') }
  }

  function forkState(): Promise<{ cwd: string; env: Record<string, string> }> {
    return Promise.resolve({ cwd, env: { ...env } })
  }

  function dispose(): Promise<void> {
    // Nothing to tear down — there is no persistent process.
    return Promise.resolve()
  }

  return { run, forkState, dispose }
}
