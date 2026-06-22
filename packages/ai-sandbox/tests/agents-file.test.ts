import { describe, expect, it } from 'vitest'
import { writeAgentsFile } from '../src/agents-file'
import type { ExecResult, SandboxHandle } from '../src/contracts'

interface FsWriteCall {
  path: string
  data: string | Uint8Array
}

interface ExecCall {
  command: string
  cwd: string | undefined
}

/**
 * Build a minimal fake {@link SandboxHandle} that records `fs.write` calls and
 * `process.exec` calls, with configurable exec exit codes.
 */
function makeFakeHandle(
  execResults: ReadonlyMap<string, ExecResult> = new Map(),
  defaultExitCode = 0,
): {
  handle: SandboxHandle
  fsWrites: Array<FsWriteCall>
  execCalls: Array<ExecCall>
} {
  const fsWrites: Array<FsWriteCall> = []
  const execCalls: Array<ExecCall> = []

  const handle: SandboxHandle = {
    id: 'fake',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: false,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: () => Promise.reject(new Error('unused')),
      readBytes: () => Promise.reject(new Error('unused')),
      write: (path, data) => {
        fsWrites.push({ path, data })
        return Promise.resolve()
      },
      list: () => Promise.reject(new Error('unused')),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.reject(new Error('unused')),
      rename: () => Promise.reject(new Error('unused')),
      exists: () => Promise.resolve(false),
    },
    git: {} as SandboxHandle['git'],
    process: {
      exec: (command, options) => {
        execCalls.push({ command, cwd: options?.cwd })
        const override = execResults.get(command)
        if (override !== undefined) {
          return Promise.resolve(override)
        }
        return Promise.resolve({
          stdout: '',
          stderr: '',
          exitCode: defaultExitCode,
        })
      },
      spawn: () => Promise.reject(new Error('unused')),
    },
    ports: { connect: () => Promise.reject(new Error('unused')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }

  return { handle, fsWrites, execCalls }
}

describe('writeAgentsFile', () => {
  it('writes AGENTS.md and exec-s ln for each symlink name', async () => {
    const { handle, fsWrites, execCalls } = makeFakeHandle()
    const root = '/sandbox/workspace'
    const content = '# Instructions\n\nDo the thing.'

    await writeAgentsFile(handle, root, content)

    // AGENTS.md must be written first with the exact content.
    expect(fsWrites[0]).toEqual({ path: `${root}/AGENTS.md`, data: content })

    // ln -s commands must be issued for every known symlink name.
    const lnCommands = execCalls.map((c) => c.command)
    expect(lnCommands).toContain(`ln -s 'AGENTS.md' 'CLAUDE.md'`)
    expect(lnCommands).toContain(`ln -s 'AGENTS.md' 'GEMINI.md'`)

    // All exec calls must use root as cwd.
    for (const call of execCalls) {
      expect(call.cwd).toBe(root)
    }

    // No copy fallbacks should happen because exec succeeded.
    expect(fsWrites).toHaveLength(1)
  })

  it('falls back to fs.write copy when ln returns non-zero', async () => {
    const content = '# Fallback content'
    const root = '/sandbox/ws'

    // Make ln -s fail for CLAUDE.md (exitCode 1) but succeed for GEMINI.md.
    const failResult: ExecResult = {
      stdout: '',
      stderr: 'ln: not supported',
      exitCode: 1,
    }
    const execResults = new Map<string, ExecResult>([
      [`ln -s 'AGENTS.md' 'CLAUDE.md'`, failResult],
    ])

    const { handle, fsWrites, execCalls } = makeFakeHandle(execResults)

    await writeAgentsFile(handle, root, content)

    // AGENTS.md written first.
    expect(fsWrites[0]).toEqual({ path: `${root}/AGENTS.md`, data: content })

    // Both ln commands were attempted.
    const lnCommands = execCalls.map((c) => c.command)
    expect(lnCommands).toContain(`ln -s 'AGENTS.md' 'CLAUDE.md'`)
    expect(lnCommands).toContain(`ln -s 'AGENTS.md' 'GEMINI.md'`)

    // CLAUDE.md must be written as a copy because ln failed.
    const claudeCopy = fsWrites.find((w) => w.path === `${root}/CLAUDE.md`)
    expect(claudeCopy).toBeDefined()
    expect(claudeCopy?.data).toBe(content)

    // GEMINI.md must NOT be written because ln succeeded.
    const geminiCopy = fsWrites.find((w) => w.path === `${root}/GEMINI.md`)
    expect(geminiCopy).toBeUndefined()
  })
})
