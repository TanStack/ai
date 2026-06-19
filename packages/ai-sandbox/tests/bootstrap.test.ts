import { describe, expect, it } from 'vitest'
import { bootstrapWorkspace } from '../src/bootstrap'
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
            // succeeds with no stdout.
            if (data.startsWith('pwd;')) {
              emit(`${forkCwd}\n`)
            } else if (data.startsWith('export -p;')) {
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
