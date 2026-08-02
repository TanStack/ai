import { describe, expect, it } from 'vitest'
import { bootstrapWorkspace } from '../src/bootstrap'
import { createSecrets } from '../src/secrets'
import { resolveGitSkillDir } from '../src/agents-file'
import { gitSkill, gitSource, fileSkill } from '../src/workspace'
import type {
  ExecResult,
  ProcessOptions,
  SandboxHandle,
  SpawnHandle,
} from '../src/contracts'
import type { WorkspaceDefinition } from '../src/workspace'

/**
 * A scripted sentinel-driven fake `spawn`. It mirrors the protocol the
 * persistent bootstrap shell speaks: each stdin write of the form
 * `<cmd>; printf "\n__BSSH_<N>__ $?\n"` is answered by emitting the scripted
 * stdout for `<cmd>` followed by the matching sentinel line.
 *
 * `forkState()` issues `pwd` then `export -p`; we answer those so the shell
 * resolves a real `{ cwd, env }`.
 */
function makeScriptedSpawn(forkCwd: string): {
  spawn: SandboxHandle['process']['spawn']
  spawnCount: () => number
} {
  let spawnCount = 0
  return {
    spawnCount: () => spawnCount,
    spawn: (_command: string, _options?: ProcessOptions) => {
      spawnCount += 1

      const queue: Array<string> = []
      const waiters: Array<(result: IteratorResult<string>) => void> = []
      let done = false

      function emit(chunk: string): void {
        const waiter = waiters.shift()
        if (waiter !== undefined) {
          waiter({ value: chunk, done: false })
        } else {
          queue.push(chunk)
        }
      }

      const stdout: AsyncIterable<string> = {
        [Symbol.asyncIterator](): AsyncIterator<string> {
          return {
            next(): Promise<IteratorResult<string>> {
              const queued = queue.shift()
              if (queued !== undefined) {
                return Promise.resolve({ value: queued, done: false })
              }
              if (done) {
                return Promise.resolve({ value: '', done: true })
              }
              return new Promise<IteratorResult<string>>((resolve) => {
                waiters.push(resolve)
              })
            },
          }
        },
      }

      let counter = 0
      const handle: SpawnHandle = {
        pid: 1,
        stdout,
        stderr: (async function* empty() {})(),
        stdin: {
          write: (data: string) => {
            const sentinel = `__BSSH_${counter}__`
            counter += 1
            // Answer pwd / export -p so forkState resolves; everything else
            // succeeds with no stdout. Commands are wrapped as `{ <cmd> ; } 2>&1`
            // by the bootstrap shell (stderr merged into stdout), so match the
            // wrapped form rather than a bare `pwd;` / `export -p;` prefix.
            if (data.startsWith('{ pwd ')) {
              emit(`${forkCwd}\n`)
            } else if (data.startsWith('{ export -p ')) {
              emit('declare -x SETUP_VAR="from-shell"\n')
            }
            emit(`${sentinel} 0\n`)
            return Promise.resolve()
          },
          end: () => {
            done = true
            for (const waiter of waiters) {
              waiter({ value: '', done: true })
            }
            waiters.length = 0
            return Promise.resolve()
          },
        },
        wait: () => Promise.resolve(0),
        kill: () => Promise.resolve(),
      }
      return Promise.resolve(handle)
    },
  }
}

interface ExecCall {
  command: string
  options?: ProcessOptions
}

/**
 * Build a fake handle that records every `exec` and drives the persistent
 * shell via {@link makeScriptedSpawn}. The git source is treated as already
 * cloned so bootstrap skips cloning.
 *
 * `execImpl` lets a test control how each `exec` resolves (e.g. to gate
 * concurrency or to inject a non-zero exit code).
 */
function makeRecordingHandle(
  forkCwd: string,
  execImpl: (call: ExecCall) => Promise<ExecResult>,
): {
  handle: SandboxHandle
  execCalls: Array<ExecCall>
  spawnCount: () => number
} {
  const execCalls: Array<ExecCall> = []
  const scripted = makeScriptedSpawn(forkCwd)

  const handle: SandboxHandle = {
    id: 'rec',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: true,
      writableStdin: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: () => Promise.resolve(''),
      readBytes: () => Promise.resolve(new Uint8Array()),
      write: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      // Report the source as already cloned so bootstrap skips git.clone.
      exists: (path) => Promise.resolve(path.endsWith('/.git')),
    },
    git: {
      clone: () => Promise.reject(new Error('clone should be skipped')),
      status: () => Promise.resolve(''),
      add: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      push: () => Promise.resolve(),
      pull: () => Promise.resolve(),
      branch: () => Promise.resolve('main'),
    },
    process: {
      exec: (command, options) => {
        const call: ExecCall = { command, options }
        execCalls.push(call)
        return execImpl(call)
      },
      spawn: scripted.spawn,
    },
    ports: {
      connect: () => Promise.reject(new Error('ports not used')),
    },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }

  return { handle, execCalls, spawnCount: scripted.spawnCount }
}

const ok: ExecResult = { stdout: '', stderr: '', exitCode: 0 }

describe('bootstrapWorkspace setup execution', () => {
  it('runs a parallel group concurrently with the forked cwd', async () => {
    let dispatched = 0
    // Each parallel exec blocks until BOTH have been dispatched. If the two
    // calls were issued sequentially (the second only after the first
    // resolved), this barrier would never reach 2 and the test would hang —
    // so resolving proves they were launched concurrently.
    let releaseBarrier: () => void = () => {}
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve
    })

    const { handle, execCalls, spawnCount } = makeRecordingHandle(
      '/workspace/x',
      async () => {
        dispatched += 1
        if (dispatched === 2) releaseBarrier()
        await barrier
        return ok
      },
    )

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      setup: ({ serial, parallel }) => {
        serial('cd x')
        parallel(['a', 'b'])
      },
    }

    const result = await bootstrapWorkspace(handle, workspace)

    // Both parallel commands were exec'd (the serial `cd x` runs on the shell,
    // not via exec, so it is NOT in execCalls).
    const commands = execCalls.map((call) => call.command)
    expect(commands).toEqual(['a', 'b'])
    // They inherited the shell's forked cwd.
    for (const call of execCalls) {
      expect(call.options?.cwd).toBe('/workspace/x')
      expect(call.options?.env?.['SETUP_VAR']).toBe('from-shell')
    }
    // Exactly one persistent shell drove the serial step + forkState.
    expect(spawnCount()).toBe(1)
    expect(result.ranSetup).toEqual(['cd x', 'a', 'b'])
  })

  it('throws when a serial step exits non-zero', async () => {
    // Override the scripted spawn so `bad-cmd` reports a non-zero sentinel.
    const execCalls: Array<ExecCall> = []
    const handle = makeFailingSerialHandle(execCalls)

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      setup: ['bad-cmd'],
    }

    await expect(bootstrapWorkspace(handle, workspace)).rejects.toThrow(
      'setup step failed: bad-cmd (exit 7)',
    )
    // Serial steps run on the shell, never via exec.
    expect(execCalls).toHaveLength(0)
  })
})

/**
 * A handle whose persistent shell answers `bad-cmd` with exit code 7, so a
 * serial step fails. Reuses the recording exec surface (unused here).
 */
function makeFailingSerialHandle(execCalls: Array<ExecCall>): SandboxHandle {
  const handle: SandboxHandle = {
    id: 'fail',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: true,
      writableStdin: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: () => Promise.resolve(''),
      readBytes: () => Promise.resolve(new Uint8Array()),
      write: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: (path) => Promise.resolve(path.endsWith('/.git')),
    },
    git: {
      clone: () => Promise.reject(new Error('clone should be skipped')),
      status: () => Promise.resolve(''),
      add: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      push: () => Promise.resolve(),
      pull: () => Promise.resolve(),
      branch: () => Promise.resolve('main'),
    },
    process: {
      exec: (command, options) => {
        execCalls.push({ command, options })
        return Promise.resolve(ok)
      },
      spawn: () => {
        const queue: Array<string> = []
        const waiters: Array<(result: IteratorResult<string>) => void> = []
        let done = false
        function emit(chunk: string): void {
          const waiter = waiters.shift()
          if (waiter !== undefined) waiter({ value: chunk, done: false })
          else queue.push(chunk)
        }
        const stdout: AsyncIterable<string> = {
          [Symbol.asyncIterator](): AsyncIterator<string> {
            return {
              next(): Promise<IteratorResult<string>> {
                const queued = queue.shift()
                if (queued !== undefined) {
                  return Promise.resolve({ value: queued, done: false })
                }
                if (done) return Promise.resolve({ value: '', done: true })
                return new Promise<IteratorResult<string>>((resolve) => {
                  waiters.push(resolve)
                })
              },
            }
          },
        }
        let counter = 0
        const spawnHandle: SpawnHandle = {
          pid: 1,
          stdout,
          stderr: (async function* empty() {})(),
          stdin: {
            write: (_data: string) => {
              const sentinel = `__BSSH_${counter}__`
              counter += 1
              // The only serial command is `bad-cmd` → exit 7.
              emit(`${sentinel} 7\n`)
              return Promise.resolve()
            },
            end: () => {
              done = true
              for (const waiter of waiters) waiter({ value: '', done: true })
              waiters.length = 0
              return Promise.resolve()
            },
          },
          wait: () => Promise.resolve(0),
          kill: () => Promise.resolve(),
        }
        return Promise.resolve(spawnHandle)
      },
    },
    ports: { connect: () => Promise.reject(new Error('ports not used')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
  return handle
}

// ---------------------------------------------------------------------------
// Helpers for the new provisioning tests
// ---------------------------------------------------------------------------

interface CloneCall {
  url: string
  dir?: string
  auth?: { username?: string; token: string }
  depth?: number | 'full'
}

interface WriteCall {
  path: string
  content: string
}

/**
 * Build a fake handle that:
 * - Reports the source repo as already cloned (`fs.exists` → true for `/.git`).
 * - Records git.clone and fs.write calls.
 * - exec always resolves with exit 0 (symlinks succeed).
 * - No persistent shell needed: workspace has no `setup`.
 */
function makeProvisioningHandle(): {
  handle: SandboxHandle
  cloneCalls: Array<CloneCall>
  writeCalls: Array<WriteCall>
  execCalls: Array<ExecCall>
} {
  const cloneCalls: Array<CloneCall> = []
  const writeCalls: Array<WriteCall> = []
  const execCalls: Array<ExecCall> = []

  const handle: SandboxHandle = {
    id: 'prov',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: false,
      writableStdin: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: () => Promise.resolve(''),
      readBytes: () => Promise.resolve(new Uint8Array()),
      write: (path, content) => {
        writeCalls.push({ path, content: String(content) })
        return Promise.resolve()
      },
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      // Source is already cloned; skill dirs are not yet present.
      exists: (path) => Promise.resolve(path.endsWith('/.git')),
    },
    git: {
      clone: (opts) => {
        cloneCalls.push(opts as CloneCall)
        return Promise.resolve()
      },
      status: () => Promise.resolve(''),
      add: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      push: () => Promise.resolve(),
      pull: () => Promise.resolve(),
      branch: () => Promise.resolve('main'),
    },
    process: {
      exec: (command, options) => {
        execCalls.push({ command, options })
        return Promise.resolve(ok)
      },
      spawn: () =>
        Promise.reject(new Error('spawn not expected in these tests')),
    },
    ports: { connect: () => Promise.reject(new Error('ports not used')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }

  return { handle, cloneCalls, writeCalls, execCalls }
}

// ---------------------------------------------------------------------------
// gitSkill clone tests
// ---------------------------------------------------------------------------

describe('bootstrapWorkspace gitSkill cloning', () => {
  it('clones a short owner/repo reference to the default skill dir', async () => {
    const { handle, cloneCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      skills: [gitSkill({ repo: 'me/x' })],
    }

    await bootstrapWorkspace(handle, workspace)

    expect(cloneCalls).toHaveLength(1)
    expect(cloneCalls[0]?.url).toBe('https://github.com/me/x.git')
    expect(cloneCalls[0]?.dir).toBe('/workspace/.tanstack-skills/x')
    expect(cloneCalls[0]?.depth).toBe(1)
    expect(cloneCalls[0]?.auth).toBeUndefined()
  })

  it('resolves a secret token into auth when secret is provided', async () => {
    const secrets = createSecrets({ GH: 'ghp_tok' })
    const { handle, cloneCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      secrets,
      skills: [gitSkill({ repo: 'me/x', secret: secrets.GH })],
    }

    await bootstrapWorkspace(handle, workspace)

    expect(cloneCalls).toHaveLength(1)
    expect(cloneCalls[0]?.auth?.token).toBe('ghp_tok')
    expect(cloneCalls[0]?.url).toBe('https://github.com/me/x.git')
    expect(cloneCalls[0]?.dir).toBe('/workspace/.tanstack-skills/x')
  })

  it('respects the explicit into override', async () => {
    const { handle, cloneCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      skills: [gitSkill({ repo: 'me/x', into: '/opt/myskill' })],
    }

    await bootstrapWorkspace(handle, workspace)

    expect(cloneCalls[0]?.dir).toBe('/opt/myskill')
  })

  it('passes a full HTTPS url through unchanged', async () => {
    const { handle, cloneCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      skills: [gitSkill({ repo: 'https://example.com/org/repo.git' })],
    }

    await bootstrapWorkspace(handle, workspace)

    expect(cloneCalls[0]?.url).toBe('https://example.com/org/repo.git')
  })
})

// ---------------------------------------------------------------------------
// Source clone depth forwarding tests
// ---------------------------------------------------------------------------

/**
 * Build a fake handle where `fs.exists` returns FALSE for the `.git` sentinel,
 * so `bootstrapWorkspace` runs the source git clone. Records all clone calls.
 */
function makeUnclonedHandle(): {
  handle: SandboxHandle
  cloneCalls: Array<CloneCall>
} {
  const cloneCalls: Array<CloneCall> = []

  const handle: SandboxHandle = {
    id: 'uncloned',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: false,
      writableStdin: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: () => Promise.resolve(''),
      readBytes: () => Promise.resolve(new Uint8Array()),
      write: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      // Never cloned — source clone should run.
      exists: () => Promise.resolve(false),
    },
    git: {
      clone: (opts) => {
        cloneCalls.push(opts as CloneCall)
        return Promise.resolve()
      },
      status: () => Promise.resolve(''),
      add: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      push: () => Promise.resolve(),
      pull: () => Promise.resolve(),
      branch: () => Promise.resolve('main'),
    },
    process: {
      exec: () => Promise.resolve(ok),
      spawn: () => Promise.reject(new Error('spawn not expected')),
    },
    ports: { connect: () => Promise.reject(new Error('ports not used')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }

  return { handle, cloneCalls }
}

describe('bootstrapWorkspace source clone depth', () => {
  it('forwards depth: "full" from gitSource to git.clone', async () => {
    const { handle, cloneCalls } = makeUnclonedHandle()

    const workspace: WorkspaceDefinition = {
      source: gitSource({ url: 'https://github.com/me/app', depth: 'full' }),
    }

    await bootstrapWorkspace(handle, workspace)

    expect(cloneCalls).toHaveLength(1)
    expect(cloneCalls[0]?.url).toBe('https://github.com/me/app')
    expect(cloneCalls[0]?.depth).toBe('full')
  })

  it('forwards a numeric depth from gitSource to git.clone', async () => {
    const { handle, cloneCalls } = makeUnclonedHandle()

    const workspace: WorkspaceDefinition = {
      source: gitSource({ url: 'https://github.com/me/app', depth: 10 }),
    }

    await bootstrapWorkspace(handle, workspace)

    expect(cloneCalls).toHaveLength(1)
    expect(cloneCalls[0]?.depth).toBe(10)
  })

  it('omits depth from git.clone when not specified on the source', async () => {
    const { handle, cloneCalls } = makeUnclonedHandle()

    const workspace: WorkspaceDefinition = {
      source: gitSource({ url: 'https://github.com/me/app' }),
    }

    await bootstrapWorkspace(handle, workspace)

    expect(cloneCalls).toHaveLength(1)
    expect(cloneCalls[0]?.depth).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// resolveGitSkillDir unit tests
// ---------------------------------------------------------------------------

describe('resolveGitSkillDir', () => {
  it('strips .git suffix from basename', () => {
    const skill = gitSkill({ repo: 'me/x' }) as Extract<
      ReturnType<typeof gitSkill>,
      { kind: 'git' }
    >
    // repo has no .git suffix here — should still work
    expect(resolveGitSkillDir('/workspace', skill)).toBe(
      '/workspace/.tanstack-skills/x',
    )
  })

  it('strips trailing .git when the repo url ends with .git', () => {
    const skill = gitSkill({ repo: 'me/repo.git' }) as Extract<
      ReturnType<typeof gitSkill>,
      { kind: 'git' }
    >
    expect(resolveGitSkillDir('/workspace', skill)).toBe(
      '/workspace/.tanstack-skills/repo',
    )
  })

  it('uses last path segment for full https urls', () => {
    const skill = gitSkill({
      repo: 'https://github.com/org/myskill.git',
    }) as Extract<ReturnType<typeof gitSkill>, { kind: 'git' }>
    expect(resolveGitSkillDir('/workspace', skill)).toBe(
      '/workspace/.tanstack-skills/myskill',
    )
  })
})

// ---------------------------------------------------------------------------
// AGENTS.md + instructions tests
// ---------------------------------------------------------------------------

describe('bootstrapWorkspace AGENTS.md + instructions', () => {
  it('writes AGENTS.md via fs.write when instructions is set', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      instructions: 'You are a helpful assistant.',
    }

    await bootstrapWorkspace(handle, workspace)

    const agentsWrite = writeCalls.find(
      (w) => w.path === '/workspace/AGENTS.md',
    )
    expect(agentsWrite).toBeDefined()
    expect(agentsWrite?.content).toBe('You are a helpful assistant.')
  })

  it('writes AGENTS.md from a fileSkill when instructions is absent', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      skills: [
        fileSkill({ path: 'AGENTS.md', content: 'Skill instructions.' }),
      ],
    }

    await bootstrapWorkspace(handle, workspace)

    const agentsWrite = writeCalls.find(
      (w) => w.path === '/workspace/AGENTS.md',
    )
    expect(agentsWrite).toBeDefined()
    expect(agentsWrite?.content).toBe('Skill instructions.')
  })

  it('prefers instructions over a fileSkill AGENTS.md', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      instructions: 'Direct instructions.',
      skills: [
        fileSkill({ path: 'AGENTS.md', content: 'Skill instructions.' }),
      ],
    }

    await bootstrapWorkspace(handle, workspace)

    const agentsWrites = writeCalls.filter(
      (w) => w.path === '/workspace/AGENTS.md',
    )
    // Only one AGENTS.md write; it should use the direct instructions.
    expect(agentsWrites).toHaveLength(1)
    expect(agentsWrites[0]?.content).toBe('Direct instructions.')
  })

  it('does not write AGENTS.md when instructions is empty and no fileSkill', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
    }

    await bootstrapWorkspace(handle, workspace)

    const agentsWrite = writeCalls.find((w) => w.path.endsWith('AGENTS.md'))
    expect(agentsWrite).toBeUndefined()
  })

  it('writes AGENTS.md with a Workspace scripts section when only scripts is set', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      scripts: { test: 'pnpm test', build: 'pnpm build' },
    }

    await bootstrapWorkspace(handle, workspace)

    const agentsWrite = writeCalls.find(
      (w) => w.path === '/workspace/AGENTS.md',
    )
    expect(agentsWrite).toBeDefined()
    expect(agentsWrite?.content).toContain('## Workspace scripts')
    expect(agentsWrite?.content).toContain('- build → pnpm build')
    expect(agentsWrite?.content).toContain('- test → pnpm test')
  })

  it('merges instructions with the Workspace scripts section', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      instructions: 'You are a helpful assistant.',
      scripts: { test: 'pnpm test' },
    }

    await bootstrapWorkspace(handle, workspace)

    const agentsWrite = writeCalls.find(
      (w) => w.path === '/workspace/AGENTS.md',
    )
    expect(agentsWrite?.content).toBe(
      'You are a helpful assistant.\n\n## Workspace scripts\n\n- test → pnpm test',
    )
  })

  it('merges a fileSkill AGENTS.md with the Workspace scripts section', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      skills: [
        fileSkill({ path: 'AGENTS.md', content: 'Skill instructions.' }),
      ],
      scripts: { lint: 'pnpm lint' },
    }

    await bootstrapWorkspace(handle, workspace)

    const agentsWrite = writeCalls.find(
      (w) => w.path === '/workspace/AGENTS.md',
    )
    expect(agentsWrite?.content).toBe(
      'Skill instructions.\n\n## Workspace scripts\n\n- lint → pnpm lint',
    )
  })
})

// ---------------------------------------------------------------------------
// Non-AGENTS fileSkill tests
// ---------------------------------------------------------------------------

describe('bootstrapWorkspace non-AGENTS fileSkills', () => {
  it('writes a non-AGENTS fileSkill to the workspace root', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      skills: [fileSkill({ path: '.env.example', content: 'KEY=value' })],
    }

    await bootstrapWorkspace(handle, workspace)

    const fileWrite = writeCalls.find(
      (w) => w.path === '/workspace/.env.example',
    )
    expect(fileWrite).toBeDefined()
    expect(fileWrite?.content).toBe('KEY=value')
  })

  it('writes multiple non-AGENTS fileSkills', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      skills: [
        fileSkill({ path: 'a.txt', content: 'aaa' }),
        fileSkill({ path: 'b.txt', content: 'bbb' }),
      ],
    }

    await bootstrapWorkspace(handle, workspace)

    const paths = writeCalls.map((w) => w.path)
    expect(paths).toContain('/workspace/a.txt')
    expect(paths).toContain('/workspace/b.txt')
  })

  it('does not re-write an AGENTS.md fileSkill through the generic path', async () => {
    const { handle, writeCalls } = makeProvisioningHandle()

    const workspace: WorkspaceDefinition = {
      source: { type: 'git', url: 'https://github.com/me/app' },
      skills: [
        fileSkill({ path: 'AGENTS.md', content: 'Skill instructions.' }),
      ],
    }

    await bootstrapWorkspace(handle, workspace)

    // Should appear exactly once (via writeAgentsFile, not the generic loop).
    const agentsWrites = writeCalls.filter(
      (w) => w.path === '/workspace/AGENTS.md',
    )
    expect(agentsWrites).toHaveLength(1)
  })
})
