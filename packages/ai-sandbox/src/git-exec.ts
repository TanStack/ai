/**
 * An exec-backed {@link SandboxGit} implementation. Providers without a native
 * git API (local-process, Docker) get a uniform `sandbox.git` by desugaring to
 * `process.exec("git …")`. Providers WITH native git (Daytona, Cloudflare) may
 * supply their own implementation instead.
 *
 * Security:
 * - Every interpolated value is single-quote escaped (no shell injection).
 * - A `--` end-of-options separator precedes untrusted positionals and values
 *   are rejected if they begin with `-`, so a repo URL / ref / path can't
 *   smuggle a git flag (e.g. `--upload-pack=…`).
 * - Auth tokens NEVER appear in argv (they'd leak via `ps` / process logs).
 *   Instead a one-shot `credential.helper` reads the token from the child
 *   process ENV. The helper string is single-quoted so the OUTER shell never
 *   expands the env var — only git's own helper subshell does, at use time.
 *
 * NOTE: `SandboxProcess.exec` takes a command STRING by design (the sandbox
 * runs shell commands), so we mitigate flag smuggling with `--` + validation
 * rather than an argv array.
 */
import type { SandboxGit, SandboxProcess } from './contracts'

/** POSIX single-quote escape: wrap in '…' and escape embedded quotes. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Reject values that could be parsed as a git flag when used as a positional. */
function assertNoLeadingDash(value: string, name: string): void {
  if (value.startsWith('-')) {
    throw new Error(
      `git-exec: ${name} "${value}" must not begin with "-" (argument-injection guard).`,
    )
  }
}

// Credential helper that prints creds read from the child ENV. Single-quoted at
// the call site so the outer shell passes it literally; git expands the vars in
// its own helper subshell, keeping the token out of argv.
const CREDENTIAL_HELPER =
  '!f() { echo "username=${GIT_ASKPASS_USER}"; echo "password=${GIT_ASKPASS_TOKEN}"; }; f'

export function createExecBackedGit(
  process: SandboxProcess,
  defaultRoot: string,
): SandboxGit {
  const at = (dir?: string): string => {
    const d = dir ?? defaultRoot
    assertNoLeadingDash(d, 'dir')
    return q(d)
  }

  return {
    clone: async ({ url, dir, ref, auth, depth }) => {
      assertNoLeadingDash(url, 'url')
      const target = dir ?? defaultRoot
      assertNoLeadingDash(target, 'dir')
      if (ref !== undefined) assertNoLeadingDash(ref, 'ref')
      const refArg = ref ? `--branch ${q(ref)} ` : ''
      const resolvedDepth = depth ?? 1
      // `depth` is interpolated unquoted into the command, so validate it the
      // same way other positionals are guarded — a non-positive-integer (e.g. an
      // untyped caller passing a string) must never reach the shell.
      if (
        resolvedDepth !== 'full' &&
        (!Number.isInteger(resolvedDepth) || resolvedDepth <= 0)
      ) {
        throw new Error('git-exec: depth must be a positive integer or "full".')
      }
      const depthArg =
        resolvedDepth === 'full' ? '' : `--depth ${resolvedDepth} --single-branch `

      if (auth?.token) {
        await process.exec(
          `git -c credential.helper=${q(CREDENTIAL_HELPER)} clone ${refArg}${depthArg}-- ${q(url)} ${q(target)}`,
          {
            // Token lives only in the child env, never in argv.
            env: {
              GIT_ASKPASS_USER: auth.username ?? 'x-access-token',
              GIT_ASKPASS_TOKEN: auth.token,
              GIT_TERMINAL_PROMPT: '0',
            },
          },
        )
        return
      }

      await process.exec(`git clone ${refArg}${depthArg}-- ${q(url)} ${q(target)}`)
    },
    status: async (dir) =>
      (await process.exec(`git -C ${at(dir)} status --porcelain`)).stdout,
    add: async (paths, dir) => {
      paths.forEach((p, i) => assertNoLeadingDash(p, `path[${i}]`))
      await process.exec(`git -C ${at(dir)} add -- ${paths.map(q).join(' ')}`)
    },
    commit: async (message, dir) => {
      await process.exec(`git -C ${at(dir)} commit -m ${q(message)}`)
    },
    push: async (dir) => {
      await process.exec(`git -C ${at(dir)} push`)
    },
    pull: async (dir) => {
      await process.exec(`git -C ${at(dir)} pull`)
    },
    branch: async (dir) =>
      (
        await process.exec(`git -C ${at(dir)} rev-parse --abbrev-ref HEAD`)
      ).stdout.trim(),
  }
}
