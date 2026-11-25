import { homedir } from 'node:os'
import { join } from 'node:path'
import { cliPlanLogin } from '@tanstack/ai-sandbox/host-login'
import type { CliExecutable } from '@tanstack/ai-sandbox/host-login'

/**
 * The host path of the Codex login file: `$CODEX_HOME/auth.json` when
 * `CODEX_HOME` is set, else `~/.codex/auth.json`.
 */
export function codexAuthFile(env: Record<string, string | undefined>) {
  const codexHome = env.CODEX_HOME
  return codexHome
    ? join(codexHome, 'auth.json')
    : join(homedir(), '.codex', 'auth.json')
}

/**
 * Signs in to Codex with a ChatGPT plan through the `codex` CLI on this
 * machine (`codex login --device-auth`). The login stays in the Codex login
 * file. This code keeps no copy of the tokens.
 *
 * Give it to `providerKeys` as the `login` of the Codex provider, and use
 * `codexText(model, { authMode: 'host' })` so the runs use this login.
 *
 * @param options.executable - The CLI command, or `[command, ...leadingArgs]`. Defaults to `'codex'`.
 * @param options.env - Extra environment variables for the CLI. `CODEX_HOME` here also moves the login file.
 *
 * @example
 * ```ts
 * const login = codexPlanLogin()
 * await login.signIn({ onCode: ({ verificationUri, userCode }) => show(verificationUri, userCode) })
 * await login.status() // true
 * ```
 */
export function codexPlanLogin(
  options: { executable?: CliExecutable; env?: Record<string, string> } = {},
) {
  const { executable = 'codex', env } = options
  return cliPlanLogin({
    executable,
    loginArgs: ['login', '--device-auth'],
    logoutArgs: ['logout'],
    authFile: () => codexAuthFile({ ...process.env, ...env }),
    planLabel: 'ChatGPT plan',
    ...(env ? { env } : {}),
  })
}
