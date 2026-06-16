import { describe, expect, it } from 'vitest'
import { createExecBackedGit } from '../src/git-exec'
import type {
  ExecResult,
  ProcessOptions,
  SandboxProcess,
} from '../src/contracts'

interface ExecCall {
  command: string
  options?: ProcessOptions
}

function recordingProcess(stdout = ''): {
  process: SandboxProcess
  calls: Array<ExecCall>
} {
  const calls: Array<ExecCall> = []
  const process: SandboxProcess = {
    exec: (command, options): Promise<ExecResult> => {
      calls.push({ command, options })
      return Promise.resolve({ stdout, stderr: '', exitCode: 0 })
    },
    spawn: () => Promise.reject(new Error('unused')),
  }
  return { process, calls }
}

describe('createExecBackedGit security', () => {
  it('keeps the auth token out of argv (env-only credential helper)', async () => {
    const { process, calls } = recordingProcess()
    const git = createExecBackedGit(process, '/workspace')
    await git.clone({
      url: 'https://github.com/org/repo.git',
      auth: { username: 'x-access-token', token: 'super-secret-token' },
    })
    const { command, options } = calls[0]!
    // Token must NOT appear in the command line (would leak via ps/logs).
    expect(command).not.toContain('super-secret-token')
    // It must be supplied via the child env instead.
    expect(options?.env?.GIT_ASKPASS_TOKEN).toBe('super-secret-token')
    // The helper references the env var, not the literal token.
    expect(command).toContain('credential.helper')
    expect(command).toContain('${GIT_ASKPASS_TOKEN}')
  })

  it('inserts a -- end-of-options separator before positionals', async () => {
    const { process, calls } = recordingProcess()
    const git = createExecBackedGit(process, '/workspace')
    await git.clone({ url: 'https://example.com/r.git', dir: '/workspace' })
    expect(calls[0]!.command).toContain('clone -- ')
    await git.add(['a.ts', 'b.ts'])
    expect(calls[1]!.command).toContain('add -- ')
  })

  it('rejects flag-smuggling values (leading dash)', async () => {
    const { process } = recordingProcess()
    const git = createExecBackedGit(process, '/workspace')
    await expect(
      git.clone({ url: '--upload-pack=touch /tmp/pwned' }),
    ).rejects.toThrow(/argument-injection guard/)
    await expect(git.add(['--output=/etc/x'])).rejects.toThrow(
      /argument-injection guard/,
    )
    await expect(git.status('-C/evil')).rejects.toThrow(
      /argument-injection guard/,
    )
  })

  it('escapes embedded single quotes in values', async () => {
    const { process, calls } = recordingProcess()
    const git = createExecBackedGit(process, '/workspace')
    await git.commit("it's done")
    // The command runs without throwing and the message is single-quote escaped.
    expect(calls[0]!.command).toContain(`commit -m 'it'\\''s done'`)
  })
})
