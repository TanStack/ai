/**
 * An exec-backed {@link SandboxGit} implementation. Providers without a native
 * git API (local-process, Docker) get a uniform `sandbox.git` by desugaring to
 * `process.exec("git …")`. Providers WITH native git (Daytona, Cloudflare) may
 * supply their own implementation instead.
 *
 * Arguments are single-quote escaped before interpolation so repo URLs, refs,
 * and commit messages can't break out of the command.
 */
import type { SandboxGit, SandboxProcess } from './contracts'

/** POSIX single-quote escape: wrap in '…' and escape embedded quotes. */
function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Inject basic credentials into an https URL for a one-shot clone. */
function withAuth(url: string, auth?: { username?: string; token: string }): string {
  if (!auth?.token) return url
  const user = auth.username ? `${encodeURIComponent(auth.username)}:` : ''
  return url.replace(/^https:\/\//, `https://${user}${encodeURIComponent(auth.token)}@`)
}

export function createExecBackedGit(
  process: SandboxProcess,
  defaultRoot: string,
): SandboxGit {
  const at = (dir?: string): string => q(dir ?? defaultRoot)

  return {
    clone: async ({ url, dir, ref, auth }) => {
      const target = dir ?? defaultRoot
      const refArg = ref ? `--branch ${q(ref)} ` : ''
      await process.exec(`git clone ${refArg}${q(withAuth(url, auth))} ${q(target)}`)
    },
    status: async (dir) =>
      (await process.exec(`git -C ${at(dir)} status --porcelain`)).stdout,
    add: async (paths, dir) => {
      await process.exec(`git -C ${at(dir)} add ${paths.map(q).join(' ')}`)
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
      (await process.exec(`git -C ${at(dir)} rev-parse --abbrev-ref HEAD`)).stdout.trim(),
  }
}
