import { describe, expect, it } from 'vitest'
import { createBootstrapShell } from '../src/shell'
import type { ExecResult, ProcessOptions, SpawnHandle } from '../src/contracts'

/**
 * A push-based async-iterable for driving fake stdout chunks in tests.
 *
 * Call `push(chunk)` to enqueue a chunk that will be yielded to the consumer.
 * Call `close()` to signal end-of-stream.
 */
function createPushIterable(): {
  iterable: AsyncIterable<string>
  push: (chunk: string) => void
  close: () => void
} {
  const queue: Array<string> = []
  const waiters: Array<(result: IteratorResult<string>) => void> = []
  let done = false

  function push(chunk: string): void {
    const waiter = waiters.shift()
    if (waiter !== undefined) {
      waiter({ value: chunk, done: false })
    } else {
      queue.push(chunk)
    }
  }

  function close(): void {
    done = true
    for (const waiter of waiters) {
      waiter({ value: undefined as unknown as string, done: true })
    }
    waiters.length = 0
  }

  const iterable: AsyncIterable<string> = {
    [Symbol.asyncIterator](): AsyncIterator<string> {
      return {
        next(): Promise<IteratorResult<string>> {
          const queued = queue.shift()
          if (queued !== undefined) {
            return Promise.resolve({ value: queued, done: false })
          }
          if (done) {
            return Promise.resolve({
              value: undefined as unknown as string,
              done: true,
            })
          }
          return new Promise<IteratorResult<string>>((resolve) => {
            waiters.push(resolve)
          })
        },
      }
    },
  }

  return { iterable, push, close }
}

/**
 * Build a fake {@link SpawnHandle} that:
 *  - records stdin writes
 *  - exposes a `push` helper to inject stdout chunks
 *  - records `kill` calls
 *  - counts how many times `spawn` was invoked (via the outer counter)
 */
interface FakeHandle {
  /** Mutable counters — read them after the fact to observe what happened. */
  counts: { spawn: number; kill: number; end: number }
  handle: Parameters<typeof createBootstrapShell>[0]
  stdinWrites: Array<string>
  pushStdout: (chunk: string) => void
  closeStdout: () => void
}

function makeFakeHandle(
  options: { closeStdoutOnKill?: boolean } = {},
): FakeHandle {
  const counts = { spawn: 0, kill: 0, end: 0 }
  const stdinWrites: Array<string> = []

  const {
    iterable,
    push: pushStdout,
    close: closeStdout,
  } = createPushIterable()

  const spawnHandle: SpawnHandle = {
    pid: 1,
    stdout: iterable,
    stderr: (async function* empty() {})(),
    stdin: {
      write: (data: string) => {
        stdinWrites.push(data)
        return Promise.resolve()
      },
      end: () => {
        counts.end += 1
        return Promise.resolve()
      },
    },
    wait: () => Promise.resolve(0),
    kill: () => {
      counts.kill += 1
      // Mirror real providers (e.g. docker exec): the stdout async-iterable
      // only terminates when the underlying stream is destroyed by kill().
      // Nothing else closes it. The bootstrap shell's dispose() must rely on
      // this to unblock its stdout drain loop, or it hangs forever.
      if (options.closeStdoutOnKill === true) closeStdout()
      return Promise.resolve()
    },
  }

  const handle: Parameters<typeof createBootstrapShell>[0] = {
    id: 'fake',
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
    fs: {} as Parameters<typeof createBootstrapShell>[0]['fs'],
    git: {} as Parameters<typeof createBootstrapShell>[0]['git'],
    process: {
      exec: () => Promise.reject(new Error('exec not used in shell tests')),
      spawn: (_cmd, _opts) => {
        counts.spawn += 1
        return Promise.resolve(spawnHandle)
      },
    },
    ports: {
      connect: () => Promise.reject(new Error('ports not used in shell tests')),
    },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }

  return { counts, handle, stdinWrites, pushStdout, closeStdout }
}

/** A scripted exec response for one `run()` of the exec-backed shell. */
interface ExecResponse {
  cmdOut: string
  rc: number
  newCwd: string
  exports: Array<string>
}

interface ExecFakeHandle {
  handle: Parameters<typeof createBootstrapShell>[0]
  calls: Array<{
    cwd: string | undefined
    env: Record<string, string> | undefined
  }>
  spawnCount: number
}

/**
 * Build a fake handle with `writableStdin: false`, so `createBootstrapShell`
 * takes the exec-backed path. Its `process.exec` returns crafted stdout matching
 * the exec shell's marker protocol; `process.spawn` MUST never be called.
 */
function makeExecFakeHandle(responses: Array<ExecResponse>): ExecFakeHandle {
  const calls: ExecFakeHandle['calls'] = []
  let spawnCount = 0
  let i = 0

  const handle: Parameters<typeof createBootstrapShell>[0] = {
    id: 'fake-exec',
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: true,
      writableStdin: false,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {} as Parameters<typeof createBootstrapShell>[0]['fs'],
    git: {} as Parameters<typeof createBootstrapShell>[0]['git'],
    process: {
      exec: (script: string, opts?: ProcessOptions): Promise<ExecResult> => {
        calls.push({ cwd: opts?.cwd, env: opts?.env })
        // The shell embeds its sentinel id in the script; echo it back.
        const sentinel = /__BSSH_\d+__/.exec(script)?.[0] ?? '__BSSH_?__'
        const resp = responses[i] ?? {
          cmdOut: '',
          rc: 0,
          newCwd: opts?.cwd ?? '/',
          exports: [],
        }
        i += 1
        const stdout =
          [
            resp.cmdOut,
            '', // the leading \n the shell prints before the sentinel
            `${sentinel} ${resp.rc}`,
            `${sentinel}_CWD`,
            resp.newCwd,
            `${sentinel}_ENV`,
            ...resp.exports,
          ].join('\n') + '\n'
        return Promise.resolve({ stdout, stderr: '', exitCode: 0 })
      },
      spawn: () => {
        spawnCount += 1
        return Promise.reject(
          new Error('spawn must not run for writableStdin:false'),
        )
      },
    },
    ports: {
      connect: () => Promise.reject(new Error('ports not used in shell tests')),
    },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }

  return {
    handle,
    calls,
    get spawnCount() {
      return spawnCount
    },
  }
}

describe('createBootstrapShell', () => {
  it('reuses a single spawn for multiple run() calls', async () => {
    const fake = makeFakeHandle()

    const shellPromise = createBootstrapShell(fake.handle)

    // The shell spawns `sh` synchronously as part of createBootstrapShell.
    // Push the responses for two run() calls in sequence.

    // We use an orchestrating async function so we can interleave push/resolve.
    const result = await new Promise<{
      r1: { exitCode: number; stdout: string }
      r2: { exitCode: number; stdout: string }
    }>(async (resolve) => {
      const shell = await shellPromise

      // Queue both run() calls but don't await them yet.
      const p1 = shell.run('echo hello')
      // Simulate stdout response for the first command.
      // The shell writes: `echo hello; printf "\n__BSSH_0__ $?\n"\n`
      // We emit: "hello\n__BSSH_0__ 0\n"
      fake.pushStdout('hello\n')
      fake.pushStdout('__BSSH_0__ 0\n')

      const r1 = await p1

      const p2 = shell.run('false')
      // `false` exits with code 1.
      fake.pushStdout('__BSSH_1__ 1\n')

      const r2 = await p2

      fake.closeStdout()
      await shell.dispose()

      resolve({ r1, r2 })
    })

    // Only ONE spawn call for both run() invocations.
    expect(fake.counts.spawn).toBe(1)
    expect(result.r1.exitCode).toBe(0)
    expect(result.r1.stdout).toBe('hello')
    expect(result.r2.exitCode).toBe(1)
  })

  it('returns the correct exit code from the sentinel', async () => {
    const fake = makeFakeHandle()

    const shellPromise = createBootstrapShell(fake.handle)

    const r = await new Promise<{ exitCode: number; stdout: string }>(
      async (resolve) => {
        const shell = await shellPromise
        const p = shell.run('exit 42 || true; echo done')
        // Emit multi-line output, then sentinel with code 42.
        fake.pushStdout('line1\n')
        fake.pushStdout('done\n')
        fake.pushStdout('__BSSH_0__ 42\n')
        const r = await p
        fake.closeStdout()
        await shell.dispose()
        resolve(r)
      },
    )

    expect(r.exitCode).toBe(42)
    expect(r.stdout).toBe('line1\ndone')
  })

  it('dispose() calls stdin.end() and kill()', async () => {
    const fake = makeFakeHandle()
    const shellPromise = createBootstrapShell(fake.handle)

    await new Promise<void>(async (resolve) => {
      const shell = await shellPromise

      // Run one command so the shell is active.
      const p = shell.run('echo hi')
      fake.pushStdout('hi\n')
      fake.pushStdout('__BSSH_0__ 0\n')
      await p

      fake.closeStdout()
      await shell.dispose()
      resolve()
    })

    expect(fake.counts.end).toBe(1)
    expect(fake.counts.kill).toBe(1)
  })

  it('dispose() completes when stdout only closes as a result of kill()', async () => {
    /*
     * Regression for the docker-exec hang: the spawned stdout async-iterable
     * never ends on its own — only when the process is killed (its underlying
     * stream destroyed). dispose() must drive that close itself and not block
     * forever on the stdout drain loop. The test deliberately never calls
     * closeStdout(); the only thing that ends the stream is dispose()'s kill().
     */
    const fake = makeFakeHandle({ closeStdoutOnKill: true })
    const shell = await createBootstrapShell(fake.handle)

    const p = shell.run('echo hi')
    fake.pushStdout('hi\n')
    fake.pushStdout('__BSSH_0__ 0\n')
    await p

    // If dispose() blocks on the never-self-closing stdout iterator, this race
    // rejects; the fix lets kill() close stdout so the drain loop completes.
    await Promise.race([
      shell.dispose(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('dispose() hung')), 2000),
      ),
    ])

    expect(fake.counts.kill).toBe(1)
    expect(fake.counts.end).toBe(1)
  })

  it('forkState() returns the current cwd and parsed exported env vars', async () => {
    const fake = makeFakeHandle()
    const shellPromise = createBootstrapShell(fake.handle)

    const result = await new Promise<{
      cwd: string
      env: Record<string, string>
    }>(async (resolve) => {
      const shell = await shellPromise

      const p = shell.forkState()

      // forkState runs `pwd` first, then `export -p`.
      // Sentinel for pwd (counter 0): __BSSH_0__ 0
      fake.pushStdout('/home/sandbox\n')
      fake.pushStdout('__BSSH_0__ 0\n')

      // Sentinel for export -p (counter 1): __BSSH_1__ 0
      // Include declare -x form, export form, and one unparseable junk line.
      fake.pushStdout('declare -x FOO="bar"\n')
      fake.pushStdout('export BAZ="qux"\n')
      fake.pushStdout('THIS LINE IS JUNK\n')
      fake.pushStdout('__BSSH_1__ 0\n')

      const r = await p
      fake.closeStdout()
      await shell.dispose()
      resolve(r)
    })

    expect(result.cwd).toBe('/home/sandbox')
    expect(result.env['FOO']).toBe('bar')
    expect(result.env['BAZ']).toBe('qux')
    // The junk line must be silently skipped — no extra keys.
    expect(Object.keys(result.env)).toHaveLength(2)
  })

  it('uses the exec-backed shell (no spawn) when writableStdin is false', async () => {
    const fake = makeExecFakeHandle([
      { cmdOut: 'installed', rc: 0, newCwd: '/work', exports: [] },
    ])
    const shell = await createBootstrapShell(fake.handle)
    const r = await shell.run('npm i -g claude')

    expect(fake.spawnCount).toBe(0) // never spawns a persistent shell
    expect(fake.calls).toHaveLength(1)
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain('installed')
  })

  it('exec-backed run() reports the command exit code (not the wrapper exit)', async () => {
    const fake = makeExecFakeHandle([
      { cmdOut: '', rc: 7, newCwd: '/', exports: [] },
    ])
    const shell = await createBootstrapShell(fake.handle)
    const r = await shell.run('exit 7')
    expect(r.exitCode).toBe(7)
  })

  it('exec-backed shell threads cwd + env across run() calls', async () => {
    const fake = makeExecFakeHandle([
      { cmdOut: '', rc: 0, newCwd: '/app', exports: ['export FOO="bar"'] },
      { cmdOut: '', rc: 0, newCwd: '/app', exports: ['export FOO="bar"'] },
    ])
    const shell = await createBootstrapShell(fake.handle, { cwd: '/workspace' })

    await shell.run('cd /app && export FOO=bar')
    await shell.run('echo "$FOO"')

    // First exec starts in the provided cwd with no accumulated env…
    expect(fake.calls[0]?.cwd).toBe('/workspace')
    expect(fake.calls[0]?.env).toEqual({})
    // …the second inherits the cwd + exported var captured from the first.
    expect(fake.calls[1]?.cwd).toBe('/app')
    expect(fake.calls[1]?.env).toEqual({ FOO: 'bar' })
  })

  it('exec-backed forkState() returns the threaded cwd + env', async () => {
    const fake = makeExecFakeHandle([
      { cmdOut: '', rc: 0, newCwd: '/app', exports: ['export TOKEN="abc"'] },
    ])
    const shell = await createBootstrapShell(fake.handle, { cwd: '/workspace' })
    await shell.run('cd /app && export TOKEN=abc')

    const state = await shell.forkState()
    expect(state.cwd).toBe('/app')
    expect(state.env).toEqual({ TOKEN: 'abc' })
  })

  it('captures stdout lines from run() correctly across chunk boundaries', async () => {
    const fake = makeFakeHandle()

    const shellPromise = createBootstrapShell(fake.handle)

    const r = await new Promise<{ exitCode: number; stdout: string }>(
      async (resolve) => {
        const shell = await shellPromise
        const p = shell.run('printf "a\\nb\\nc"')
        // Push chunks that split across line boundaries.
        fake.pushStdout('a\nb')
        fake.pushStdout('\nc\n')
        fake.pushStdout('__BSSH_0__ 0\n')
        const r = await p
        fake.closeStdout()
        await shell.dispose()
        resolve(r)
      },
    )

    expect(r.exitCode).toBe(0)
    // Lines before the sentinel: 'a', 'b', 'c', ''  -> joined with \n.
    // The empty string comes from the trailing newline before the sentinel.
    // What matters is that 'a', 'b', 'c' are present.
    expect(r.stdout).toContain('a')
    expect(r.stdout).toContain('b')
    expect(r.stdout).toContain('c')
  })
})
