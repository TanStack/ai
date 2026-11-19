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
/**
 * A chunk can end in the middle of the URL or the code. The last word of the
 * output is read only after the CLI was quiet for this time.
 */
const QUIET_DELAY_MS = 500

/** The URL and the code in `text`, or `undefined` when it has no URL. */
function parseDeviceCode(text: string): DeviceCode | undefined {
  const verificationUri = URL_PATTERN.exec(text)?.[0]
  if (verificationUri === undefined) return undefined
  const userCode = CODE_PATTERN.exec(text)?.[0]
  return userCode === undefined
    ? { verificationUri }
    : { verificationUri, userCode }
}

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
      let quietTimer: ReturnType<typeof setTimeout> | undefined
      const report = (code: DeviceCode) => {
        clearTimeout(quietTimer)
        if (reported) return
        reported = true
        onCode(code)
      }
      const onOutput = (output: string) => {
        if (reported) return
        const text = stripVTControlCharacters(output)
        clearTimeout(quietTimer)
        // Without the last word, which the next chunk can still make longer.
        const complete = parseDeviceCode(text.slice(0, text.search(/\S*$/)))
        if (complete?.userCode !== undefined) {
          report(complete)
          return
        }
        // The code can come in a later chunk, or the CLI waits after its
        // last word. Read all of the output after a quiet time.
        quietTimer = setTimeout(() => {
          const settled = parseDeviceCode(text)
          if (settled !== undefined) report(settled)
        }, QUIET_DELAY_MS)
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
        clearTimeout(quietTimer)
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
 * back to the host when the CLI changed it (a refreshed token) and the host
 * file did not change during the run. Then it removes the file from the
 * sandbox, also when the read-back fails.
 *
 * Runs on the same sandbox share one copy. The last `release()` writes it
 * back and removes it.
 *
 * A durable agent can outlive the stream of its host. For that run, call
 * `release({ keep: true })` to leave the login in the sandbox, and mount with
 * `adopt: true` on the host that attaches. That host then uses the login
 * that is already there, which can hold a refreshed token.
 *
 * On a `local-process` sandbox, nothing is copied: the CLI reads the host
 * file.
 *
 * @param sandbox - The sandbox of the run.
 * @param options.hostPath - Absolute host path of the login file.
 * @param options.sandboxHomePath - Path in the sandbox, relative to `$HOME`.
 * @param options.label - The CLI name for the error, for example 'Codex'.
 * @param options.connectCommand - The command that signs in, for example '/connect:codex'.
 * @param options.adopt - Keep a login that is already in the sandbox. For a host that attaches to a running agent.
 *
 * Throws an `Error` when the host has no login file, unless `adopt` finds a
 * login already in the sandbox.
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
  options: HostLoginMountOptions,
) {
  if (sandbox.provider === 'local-process') {
    return { release: () => Promise.resolve() }
  }
  // Runs on one sandbox share one copy. The last run to end releases it.
  // ponytail: per process. Two hosts on one sandbox still share no count.
  const key = `${sandbox.provider}\0${sandbox.id}\0${options.sandboxHomePath}`
  let mount = mounts.get(key)
  // A release in progress removes the file. Wait for it, then copy again.
  while (mount?.released !== undefined) {
    await mount.released.catch(() => undefined)
    mount = mounts.get(key)
  }
  if (mount === undefined) {
    mount = { runs: 0, borrowed: borrowHostLogin(sandbox, options) }
    mounts.set(key, mount)
  }
  const shared = mount
  shared.runs += 1
  let borrowed: BorrowedLogin
  try {
    borrowed = await shared.borrowed
  } catch (error) {
    shared.runs -= 1
    if (shared.runs === 0 && mounts.get(key) === shared) mounts.delete(key)
    throw error
  }
  let isReleased = false
  return {
    /** `keep: true` leaves the login in the sandbox for a host that attaches. */
    release: async (releaseOptions?: { keep?: boolean }) => {
      if (isReleased) return
      isReleased = true
      shared.runs -= 1
      if (shared.runs > 0) return
      if (releaseOptions?.keep === true) {
        if (mounts.get(key) === shared) mounts.delete(key)
        return
      }
      shared.released = returnHostLogin(
        sandbox,
        options.hostPath,
        borrowed,
      ).finally(() => {
        if (mounts.get(key) === shared) mounts.delete(key)
      })
      await shared.released
    },
  }
}

interface HostLoginMountOptions {
  hostPath: string
  sandboxHomePath: string
  label: string
  connectCommand: string
  adopt?: boolean
}

/** The sandbox path of the login and the host content that was copied. */
interface BorrowedLogin {
  path: string
  content: string
}

/** The mounts in use, by sandbox and login file. */
const mounts = new Map<
  string,
  {
    runs: number
    borrowed: Promise<BorrowedLogin>
    released?: Promise<void>
  }
>()

/** Sidecar next to the sandbox login. Holds the host bytes from the first copy. */
function hostBaselinePath(loginPath: string) {
  return `${loginPath}.tanstack-host`
}

/** Host login bytes, or `undefined` when the file is missing. */
function readHostFile(hostPath: string): Promise<string | undefined> {
  return readFile(hostPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return undefined
  })
}

/** Copy the host login file into the sandbox. */
async function borrowHostLogin(
  sandbox: SandboxHandle,
  options: HostLoginMountOptions,
): Promise<BorrowedLogin> {
  const { hostPath, sandboxHomePath, label, connectCommand } = options
  const home = await sandbox.process.exec('printf %s "$HOME"')
  const homePath = home.stdout.trim()
  if (home.exitCode !== 0 || homePath === '') {
    throw new Error(
      `Could not find $HOME in the sandbox to copy the ${label} login.\n${home.stderr}`,
    )
  }
  const path = posix.join(homePath, sandboxHomePath)
  const baselinePath = hostBaselinePath(path)
  if (options.adopt === true && (await sandbox.fs.exists(path))) {
    // Keep the bytes copied on the first mount, not a sign-in since then.
    // The host file can be missing: the sandbox login is enough to attach.
    const content =
      ((await sandbox.fs.exists(baselinePath))
        ? await sandbox.fs.read(baselinePath)
        : await readHostFile(hostPath)) ?? (await sandbox.fs.read(path))
    return { path, content }
  }
  const content = await readHostFile(hostPath)
  if (content === undefined) {
    throw new Error(`No ${label} login on this machine. Run ${connectCommand}.`)
  }
  await sandbox.fs.mkdir(posix.dirname(path))
  try {
    await sandbox.fs.write(path, content)
    await sandbox.fs.write(baselinePath, content)
  } catch (error) {
    // A failed write can still leave a file. Remove it, and keep the write error.
    await sandbox.fs.remove(path).catch(() => undefined)
    await sandbox.fs.remove(baselinePath).catch(() => undefined)
    throw error
  }
  return { path, content }
}

/**
 * Copy a refreshed token back to the host, then remove the sandbox file, also
 * when the read-back fails.
 */
async function returnHostLogin(
  sandbox: SandboxHandle,
  hostPath: string,
  { path, content }: BorrowedLogin,
): Promise<void> {
  try {
    const after = await sandbox.fs.read(path)
    if (after === content) return
    // A sign-in on the host during the run is newer. Keep it.
    const hostNow = await readFile(hostPath, 'utf8').catch(() => undefined)
    if (hostNow === content) await writeFile(hostPath, after, { mode: 0o600 })
  } finally {
    await sandbox.fs.remove(path)
    await sandbox.fs.remove(hostBaselinePath(path)).catch(() => undefined)
  }
}
