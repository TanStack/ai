/**
 * Sign in to Grok Build with a SuperGrok plan through the `grok` CLI.
 *
 * Server-only: this module starts host processes and reads host files.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { cliPlanLogin } from '@tanstack/ai-sandbox/host-login'
import type { CliExecutable } from '@tanstack/ai-sandbox/host-login'

/** Host path of the `grok` CLI login file. Resolved at call time. */
export function grokAuthFile() {
  return join(homedir(), '.grok', 'auth.json')
}

/**
 * Makes a plan login for the `grok` CLI. `signIn` runs
 * `grok login --device-auth`, `signOut` runs `grok logout`, and `status` is
 * `true` when `~/.grok/auth.json` exists. The login lives in the CLI file.
 * This code keeps no copy of the tokens.
 *
 * Pass it to `providerKeys` in `@tanstack/ai-harness` as the `login` hook, and
 * use `authMode: 'host'` on `grokBuildText` to run with that login.
 *
 * @param options.executable - The CLI command, or `[command, ...leadingArgs]`. Defaults to `'grok'`.
 * @param options.env - Extra environment variables for the CLI.
 *
 * @example
 * ```ts
 * providerKeys({
 *   providers: [{ ...grokBuildByok, login: grokBuildPlanLogin() }],
 * })
 * ```
 */
export function grokBuildPlanLogin(options?: {
  executable?: CliExecutable
  env?: Record<string, string>
}) {
  return cliPlanLogin({
    executable: options?.executable ?? 'grok',
    loginArgs: ['login', '--device-auth'],
    logoutArgs: ['logout'],
    authFile: grokAuthFile,
    planLabel: 'SuperGrok plan',
    env: options?.env,
  })
}
