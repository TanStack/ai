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
      const isInvalidCloneDepth =
        resolvedDepth !== 'full' &&
        (!Number.isInteger(resolvedDepth) || resolvedDepth <= 0)
      if (isInvalidCloneDepth) {
        throw new Error('git-exec: depth must be a positive integer or "full".')
      }
      const depthArg =
        resolvedDepth === 'full'
          ? ''
          : `--depth ${resolvedDepth} --single-branch `

      // `git clone` does not create missing parents. gitSkill clones into
      // `<root>/.tanstack-skills/<name>`, so create that parent first.
      const parentSlash = target.lastIndexOf('/')
      if (parentSlash > 0) {
        await process.exec(`mkdir -p ${q(target.slice(0, parentSlash))}`)
      }

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

      await process.exec(
        `git clone ${refArg}${depthArg}-- ${q(url)} ${q(target)}`,
      )
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
