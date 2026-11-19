/**
 * Sign in with a vendor CLI plan (ChatGPT, SuperGrok) on the host, and lend
 * that login to a sandbox for one run.
 *
 * Server-only: this module starts host processes and reads host files.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { access, readFile, writeFile } from 'node:fs/promises'
import { delimiter, extname, join, posix } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { SandboxHandle } from './contracts'

/** The device URL and the code that the user types on that page. */
export interface DeviceCode {
  verificationUri: string
  userCode?: string
}

/** Structural. `providerKeys` in ai-harness accepts it as `KeyProvider.login`. */
export interface PlanLogin {
  /** For `/keys` and messages, for example 'ChatGPT plan'. */
  planLabel: string
  signIn: (ctx: {
    onCode: (code: DeviceCode) => void
    signal?: AbortSignal
  }) => Promise<void>
  signOut: () => Promise<void>
  status: () => Promise<boolean>
}

/** `executable`: a command, or [command, ...leadingArgs] (tests pass [process.execPath, script]). */
export type CliExecutable = string | ReadonlyArray<string>

const URL_PATTERN = /https:\/\/\S+/
const CODE_PATTERN = /[A-Z0-9]{4,}-[A-Z0-9]{4,}/
/** When the CLI prints a URL and no code, report the URL after this quiet time. */
const URL_ONLY_DELAY_MS = 500

/**
 * Runs the CLI with no shell (Windows `.cmd` shims go through `cmd.exe`) and collects stdout and stderr together.
 * Resolves when the process closes. On abort, kills the process and rejects
 * after it closes, so no process stays behind.
 */
function runCli(options: {
  executable: CliExecutable
  args: ReadonlyArray<string>
  env?: Record<string, string>
  signal?: AbortSignal
  onOutput?: (output: string) => void
}) {
  const { executable, args, env, signal, onOutput } = options
  const [command, ...leadingArgs] =
    typeof executable === 'string' ? [executable] : executable
  const commandLine = [command, ...leadingArgs, ...args].join(' ')
  return new Promise<{
    commandLine: string
    exitCode: number | null
    output: string
  }>((resolve, reject) => {
    if (command === undefined) {
      reject(new Error('The CLI executable is empty.'))
      return
    }
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const childEnv = { ...process.env, ...env }
    const launch = windowsLaunch(command, [...leadingArgs, ...args], childEnv)
    const child = spawn(launch.command, launch.args, {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      windowsVerbatimArguments: launch.verbatim,
    })
    let output = ''
    const onData = (chunk: string) => {
      output += chunk
      onOutput?.(output)
    }
    // Decode as UTF-8 text, so a character split over two chunks stays whole.
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const onAbort = () => {
      // On Windows a `.cmd` shim starts the real CLI as a child of `cmd.exe`.
      // `taskkill /T` stops the whole tree.
      if (launch.verbatim && child.pid !== undefined) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        })
      } else child.kill()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    child.on('error', (error: NodeJS.ErrnoException) => {
      signal?.removeEventListener('abort', onAbort)
      const isMissing = error.code === 'ENOENT'
      reject(
        isMissing
          ? new Error(
              `Could not start "${command}". Install the CLI and make sure it is on the PATH.`,
            )
          : error,
      )
    })
    child.on('close', (exitCode) => {
      signal?.removeEventListener('abort', onAbort)
      if (signal?.aborted) {
        reject(signal.reason)
        return
      }
      resolve({ commandLine, exitCode, output })
    })
  })
}

/**
 * On Windows, npm installs CLIs such as `codex` as `.cmd` shims, and Node can
 * start a `.cmd` file only through `cmd.exe`. This finds a bare command on the
 * `PATH` with `PATHEXT`, and runs a `.cmd` or `.bat` match through `cmd.exe`.
 * A command that is not found stays as it is, so `spawn` reports `ENOENT`.
 */
function windowsLaunch(
  command: string,
  args: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv,
): { command: string; args: Array<string>; verbatim: boolean } {
  const direct = { command, args: [...args], verbatim: false }
  if (process.platform !== 'win32') return direct
  let resolved = command
  if (!/[\\/]/.test(command) && extname(command) === '') {
    const exts = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';')
    const dirs = (env.PATH ?? env.Path ?? '').split(delimiter)
    const found = dirs
      .flatMap((dir) => exts.map((ext) => join(dir, command + ext)))
      .find((candidate) => existsSync(candidate))
    if (found === undefined) return direct
    resolved = found
  }
  if (!/\.(cmd|bat)$/i.test(resolved)) return { ...direct, command: resolved }
  // ponytail: tokens are quoted, not escaped. A `"` in a path or argument
  // is not supported. The login and logout arguments are fixed words.
  const quote = (token: string) =>
    /[\s&|<>^()]/.test(token) ? `"${token}"` : token
  const line = [resolved, ...args].map(quote).join(' ')
  return {
    command: env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', `"${line}"`],
    verbatim: true,
  }
}

function failure(
  result: { commandLine: string; exitCode: number | null; output: string },
  hint: string,
) {
  return new Error(
    `"${result.commandLine}" failed with exit code ${result.exitCode}.${hint}\nOutput:\n${result.output}`,
  )
}

/**
 * Makes a {@link PlanLogin} for a vendor CLI that has a device-code login,
 * for example `codex login --device-auth`. The login lives in the CLI's own
 * file. This code keeps no copy of the tokens.
 *
 * @param options.executable - The CLI command, or `[command, ...leadingArgs]`.
 * @param options.loginArgs - Arguments for the device-code login.
 * @param options.logoutArgs - Arguments for sign out.
 * @param options.authFile - Returns the absolute host path of the CLI login file.
 * @param options.planLabel - A name for messages, for example 'ChatGPT plan'.
 * @param options.env - Extra environment variables for the CLI.
 *
 * `signIn` calls `onCode` once with the device URL and code, and resolves
 * when the CLI exits with 0. It rejects with an `Error` that holds the CLI
 * output when the CLI fails, and with `signal.reason` when the signal aborts.
 *
 * @example
 * ```ts
 * const login = cliPlanLogin({
 *   executable: 'codex',
 *   loginArgs: ['login', '--device-auth'],
 *   logoutArgs: ['logout'],
 *   authFile: () => join(homedir(), '.codex', 'auth.json'),
 *   planLabel: 'ChatGPT plan',
 * })
 * await login.signIn({ onCode: (code) => show(code) })
 * ```
 */
export function cliPlanLogin(options: {
  executable: CliExecutable
  loginArgs: ReadonlyArray<string>
  logoutArgs: ReadonlyArray<string>
  /** Absolute host path of the CLI login file. Resolved at call time. */
  authFile: () => string
  planLabel: string
  env?: Record<string, string>
}) {
  const { executable, loginArgs, logoutArgs, authFile, planLabel, env } =
    options
  const login: PlanLogin = {
    planLabel,
    signIn: async ({ onCode, signal }) => {
      let reported = false
      let urlOnlyTimer: ReturnType<typeof setTimeout> | undefined
      const report = (code: DeviceCode) => {
        clearTimeout(urlOnlyTimer)
        if (reported) return
        reported = true
        onCode(code)
      }
      const onOutput = (output: string) => {
        if (reported) return
        const text = stripVTControlCharacters(output)
        const verificationUri = URL_PATTERN.exec(text)?.[0]
        if (verificationUri === undefined) return
        const userCode = CODE_PATTERN.exec(text)?.[0]
        if (userCode !== undefined) {
          report({ verificationUri, userCode })
          return
        }
        // The code can come in a later chunk. Wait a short time for it.
        clearTimeout(urlOnlyTimer)
        urlOnlyTimer = setTimeout(
          () => report({ verificationUri }),
          URL_ONLY_DELAY_MS,
        )
      }
      try {
        const result = await runCli({
          executable,
          args: loginArgs,
          env,
          signal,
          onOutput,
        })
        if (result.exitCode === 0) return
        const hasUrl = URL_PATTERN.test(stripVTControlCharacters(result.output))
        throw failure(result, hasUrl ? '' : ' It printed no sign-in URL.')
      } finally {
        clearTimeout(urlOnlyTimer)
      }
    },
    signOut: async () => {
      const result = await runCli({ executable, args: logoutArgs, env })
      if (result.exitCode !== 0) throw failure(result, '')
    },
    status: () =>
      access(authFile()).then(
        () => true,
        () => false,
      ),
  }
  return login
}

/**
 * Copies the host login file of a CLI into the sandbox home for one run.
 * Call `release()` in a `finally` after the run. It writes the sandbox file
 * back to the host when the CLI changed it (a refreshed token), then removes
 * it from the sandbox, also when the read-back fails.
 *
 * On a `local-process` sandbox, nothing is copied: the CLI reads the host
 * file.
 *
 * @param sandbox - The sandbox of the run.
 * @param options.hostPath - Absolute host path of the login file.
 * @param options.sandboxHomePath - Path in the sandbox, relative to `$HOME`.
 * @param options.label - The CLI name for the error, for example 'Codex'.
 * @param options.connectCommand - The command that signs in, for example '/connect:codex'.
 *
 * Throws an `Error` when the host has no login file.
 *
 * @example
 * ```ts
 * const login = await mountHostLogin(sandbox, {
 *   hostPath: join(homedir(), '.codex', 'auth.json'),
 *   sandboxHomePath: '.codex/auth.json',
 *   label: 'Codex',
 *   connectCommand: '/connect:codex',
 * })
 * try {
 *   await run()
 * } finally {
 *   await login.release()
 * }
 * ```
 */
export async function mountHostLogin(
  sandbox: SandboxHandle,
  options: {
    hostPath: string
    sandboxHomePath: string
    label: string
    connectCommand: string
  },
) {
  const { hostPath, sandboxHomePath, label, connectCommand } = options
  if (sandbox.provider === 'local-process') {
    return { release: () => Promise.resolve() }
  }
  const content = await readFile(hostPath, 'utf8').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      throw new Error(
        `No ${label} login on this machine. Run ${connectCommand}.`,
      )
    },
  )
  const home = await sandbox.process.exec('printf %s "$HOME"')
  const homePath = home.stdout.trim()
  if (home.exitCode !== 0 || homePath === '') {
    throw new Error(
      `Could not find $HOME in the sandbox to copy the ${label} login.\n${home.stderr}`,
    )
  }
  const path = posix.join(homePath, sandboxHomePath)
  await sandbox.fs.mkdir(posix.dirname(path))
  await sandbox.fs.write(path, content)
  return {
    release: async () => {
      try {
        const after = await sandbox.fs.read(path)
        if (after !== content) {
          await writeFile(hostPath, after, { mode: 0o600 })
        }
      } finally {
        await sandbox.fs.remove(path)
      }
    },
  }
}
