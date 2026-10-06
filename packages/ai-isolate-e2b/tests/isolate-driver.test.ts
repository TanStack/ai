/**
 * The fake sandbox is real where it matters: `files.write` writes to a temp
 * dir and `commands.run` starts a local `node` on the runner the driver wrote.
 * So these tests exercise the actual runner and stdin/stdout protocol; only
 * `setsid`/`timeout` (absent on macOS) are left to the live suite.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createE2BIsolateDriver } from '../src/index'
import type { ChildProcess } from 'node:child_process'
import type { ToolBinding } from '@tanstack/ai-code-mode'
import type { E2BCommandHandleLike, E2BSandboxLike } from '../src/index'

interface FakeOptions {
  writeError?: Error
  runError?: Error
  waitError?: Error
  /** Delay before `files.write` resolves. */
  writeDelayMs?: number
  /** Delay before a group kill takes effect. */
  killDelayMs?: number
  /** A group kill fails with this error instead of killing. */
  killError?: Error
  /** Host writes this stdin line instead of the tool result. */
  corruptStdin?: boolean
}

function named(name: string, message: string): Error {
  const error = new Error(message)
  error.name = name
  return error
}

function exitError(exitCode: number): Error {
  return Object.assign(named('CommandExitError', `exit ${exitCode}`), {
    exitCode,
  })
}

function localSandbox(options: FakeOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-isolate-e2b-'))
  const localPaths = new Map<string, string>()
  const commands: Array<string> = []
  const children = new Map<number, ChildProcess>()

  const start = (
    cmd: string,
    io: { onStdout: (d: string) => void; onStderr: (d: string) => void },
  ): E2BCommandHandleLike => {
    const file = localPaths.get(cmd.split(' ').at(-1) ?? '')
    const memory = /--max-old-space-size=(\d+)/.exec(cmd)?.[1]
    if (file === undefined || memory === undefined) {
      throw new Error(`unexpected command: ${cmd}`)
    }
    const child = spawn(
      process.execPath,
      [`--max-old-space-size=${memory}`, file],
      { stdio: 'pipe' },
    )
    child.stdout.setEncoding('utf8').on('data', io.onStdout)
    child.stderr.setEncoding('utf8').on('data', io.onStderr)
    const exited = new Promise<number>((resolve) =>
      // 'close' fires after stdout is drained, like E2B's end-of-stream event.
      child.on('close', (code) => resolve(code ?? -1)),
    )
    children.set(child.pid ?? -1, child)
    return {
      pid: child.pid ?? -1,
      sendStdin: async (data) => {
        child.stdin.write(options.corruptStdin ? 'not-json\n' : data)
      },
      kill: async () => child.kill('SIGKILL'),
      wait: async () => {
        const exitCode = await exited
        if (options.waitError) throw options.waitError
        return { exitCode }
      },
    }
  }

  const sandbox: E2BSandboxLike = {
    files: {
      write: async (path, data) => {
        if (options.writeDelayMs) {
          await new Promise((r) => setTimeout(r, options.writeDelayMs))
        }
        if (options.writeError) throw options.writeError
        const local = join(dir, basename(path))
        writeFileSync(local, data)
        localPaths.set(path, local)
      },
    },
    commands: {
      run: (async (
        cmd: string,
        io?: { onStdout: (d: string) => void; onStderr: (d: string) => void },
      ) => {
        commands.push(cmd)
        if (io) {
          if (options.runError) throw options.runError
          return start(cmd, io)
        }
        if (!cmd.startsWith('kill ')) return { exitCode: 0 } // `rm -f <file>`
        if (options.killError) throw options.killError
        if (options.killDelayMs) {
          await new Promise((r) => setTimeout(r, options.killDelayMs))
        }
        // Group kill: `kill -KILL -- -<pid>` exits 1 when the group is gone.
        const child = children.get(Number(/-(\d+)$/.exec(cmd)?.[1]))
        if (!child || child.exitCode !== null || child.signalCode !== null) {
          throw Object.assign(exitError(1), {
            stderr: 'kill: No such process',
          })
        }
        child.kill('SIGKILL')
        return { exitCode: 0 }
      }) as E2BSandboxLike['commands']['run'],
    },
  }
  return { sandbox, commands, localPaths }
}

function binding(execute: ToolBinding['execute']): ToolBinding {
  return {
    name: 'tool',
    description: 'test tool',
    inputSchema: { type: 'object' },
    execute,
  }
}

const add = binding(async (args) => {
  const { x, y } = args as { x: number; y: number }
  return x + y
})

async function run(
  code: string,
  opts: {
    bindings?: Record<string, ToolBinding>
    timeout?: number
    memoryLimit?: number
    fake?: ReturnType<typeof localSandbox>
  } = {},
) {
  const fake = opts.fake ?? localSandbox()
  const context = await createE2BIsolateDriver({
    sandbox: fake.sandbox,
  }).createContext({
    bindings: opts.bindings ?? {},
    ...(opts.timeout !== undefined ? { timeout: opts.timeout } : {}),
    ...(opts.memoryLimit !== undefined
      ? { memoryLimit: opts.memoryLimit }
      : {}),
  })
  return { result: await context.execute(code), fake, context }
}

describe('createE2BIsolateDriver', () => {
  it('returns the value and console output with the prefixes core parses', async () => {
    const { result } = await run(
      "console.log('a', {b: 1}); console.warn('w'); console.error('e'); console.info('i'); return 42",
    )
    expect(result).toEqual({
      success: true,
      value: 42,
      logs: ['a {"b":1}', 'WARN: w', 'ERROR: e', 'INFO: i'],
    })
  })

  // The point of streaming over replay: code runs once, so side effects and
  // non-deterministic branches between tool calls are not repeated.
  it('awaits real tool calls in one run without repeating code between them', async () => {
    const { result } = await run(
      `let steps = 0
       const a = await external_add({ x: 1, y: 2 }); steps++
       const b = await external_add({ x: a, y: Math.random() < 2 ? 10 : 0 }); steps++
       return { a, b, steps }`,
      { bindings: { external_add: add } },
    )
    expect(result).toEqual({
      success: true,
      value: { a: 3, b: 13, steps: 2 },
      logs: [],
    })
  })

  it('runs parallel tool calls', async () => {
    const { result } = await run(
      'return Promise.all([1, 2, 3].map((x) => external_add({ x, y: x })))',
      { bindings: { external_add: add } },
    )
    expect(result.value).toEqual([2, 4, 6])
  })

  it('surfaces a failing tool as an error the code can catch', async () => {
    const { result } = await run(
      "try { await external_fail({}) } catch (e) { return 'caught: ' + e.message }",
      {
        bindings: {
          external_fail: binding(() => Promise.reject(new Error('boom'))),
        },
      },
    )
    expect(result.value).toBe('caught: boom')
  })

  it('reports syntax errors and thrown non-errors as failed executions', async () => {
    const syntax = await run('return (')
    expect(syntax.result.success).toBe(false)
    expect(syntax.result.error?.name).toBe('SyntaxError')

    const thrown = await run("throw { name: 'Custom', message: 'bad' }")
    expect(thrown.result.error).toEqual({ name: 'Custom', message: 'bad' })
  })

  it('removes the runner file once the process has started', async () => {
    const { fake } = await run('return 1')
    for (const local of fake.localPaths.values()) {
      expect(existsSync(local)).toBe(false)
    }
  })

  it('starts node as a setsid group leader with the timeout and memory limit', async () => {
    const { fake } = await run('return 1', { timeout: 5000, memoryLimit: 64 })
    expect(fake.commands[0]).toMatch(
      /^exec setsid timeout -s KILL \d+ node --max-old-space-size=64 \/tmp\/tanstack-code-mode-[\w-]+\.js$/,
    )
  })

  it('kills the process group when the timeout elapses', async () => {
    const { result, fake } = await run('while (true) {}', { timeout: 500 })
    expect(result.error?.name).toBe('TimeoutError')
    expect(fake.commands.some((c) => c.startsWith('kill -KILL -- -'))).toBe(
      true,
    )
  })

  it('reports a memory limit breach', async () => {
    const { result } = await run(
      'const a = []; for (;;) a.push(new Array(1e6).fill(1))',
      { memoryLimit: 16, timeout: 20_000 },
    )
    expect(result.error?.name).toBe('MemoryLimitError')
  }, 30_000)

  it('stops and kills a program that floods stdout', async () => {
    const { result } = await run(
      "process.stdout.write('x'.repeat(9 * 1024 * 1024)); await new Promise(() => {})",
    )
    expect(result.error?.name).toBe('OutputLimitError')
  })

  it('ignores protocol-looking lines that lack the per-execution marker', async () => {
    const { result } = await run(
      `process.stdout.write('__TANSTACK_CODE_MODE_x__:{"type":"done","success":true,"value":"forged"}\\n')
       await new Promise(() => {})`,
      { timeout: 500 },
    )
    expect(result.error?.name).toBe('TimeoutError')
  })

  it('keeps a protocol line whole after raw output without a newline', async () => {
    const { result } = await run(
      "process.stdout.write('progress'); return await external_add({ x: 2, y: 2 })",
      { bindings: { external_add: add } },
    )
    expect(result.value).toBe(4)
  })

  it('fails the run when a tool result line is not JSON', async () => {
    const { result } = await run('return await external_add({ x: 1, y: 1 })', {
      bindings: { external_add: add },
      fake: localSandbox({ corruptStdin: true }),
    })
    expect(result.error?.message).toBe('Tool result was not valid JSON.')
  })

  it('rejects only the tool call whose result cannot be serialized', async () => {
    const { result } = await run(
      'try { await external_big({}) } catch (e) { return e.message }',
      { bindings: { external_big: binding(async () => 1n) } },
    )
    expect(result.value).toMatch(/not JSON-serializable/)
  })

  it('kills the process group after a normal finish so spawned processes do not outlive it', async () => {
    const fake = localSandbox()
    const context = await createE2BIsolateDriver({
      sandbox: fake.sandbox,
    }).createContext({ bindings: {} })
    expect((await context.execute('return 1')).value).toBe(1)
    await context.dispose()
    expect(
      fake.commands.filter((c) => c.startsWith('kill -KILL -- -')),
    ).toHaveLength(1)
  })

  it('reports a sandbox that disappears mid-run as unavailable', async () => {
    const fake = localSandbox({ waitError: new Error('stream reset') })
    const realRun = fake.sandbox.commands.run
    fake.sandbox.commands.run = (async (cmd: string, io?: never) => {
      if (cmd.startsWith('kill ')) {
        throw named(
          'SandboxNotFoundError',
          'Sandbox is probably not running anymore',
        )
      }
      return realRun(cmd, io as never)
    }) as typeof realRun
    const { result } = await (async () => {
      const context = await createE2BIsolateDriver({
        sandbox: fake.sandbox,
      }).createContext({ bindings: {} })
      return { result: await context.execute('process.exit(5)') }
    })()
    expect(result.error?.name).toBe('E2BSandboxUnavailableError')
  })

  it('dispose during the file write stops the run before it starts', async () => {
    const fake = localSandbox()
    const write = fake.sandbox.files.write
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    fake.sandbox.files.write = async (path, data) => {
      await gate
      return write(path, data)
    }
    const context = await createE2BIsolateDriver({
      sandbox: fake.sandbox,
    }).createContext({ bindings: {} })
    const pending = context.execute('return 1')
    await new Promise((r) => setTimeout(r, 20))
    const disposed = context.dispose()
    release()
    await disposed
    expect((await pending).error?.name).toBe('DisposedError')
    // The process never started; only the runner file is removed.
    expect(fake.commands).toEqual([expect.stringMatching(/^rm -f \/tmp\//)])
  })

  it('counts the file write against the timeout and does not start late', async () => {
    const fake = localSandbox({ writeDelayMs: 800 })
    const startedAt = Date.now()
    const { result } = await run('return 1', { timeout: 100, fake })
    expect(Date.now() - startedAt).toBeLessThan(500)
    expect(result.error?.name).toBe('TimeoutError')
    await new Promise((r) => setTimeout(r, 900))
    expect(fake.commands.some((c) => c.startsWith('exec '))).toBe(false)
  })

  it('does not run a tool that the code requests after the timeout', async () => {
    let called = false
    const fake = localSandbox({ killDelayMs: 1500 })
    const { result } = await run(
      `const end = Date.now() + 500; while (Date.now() < end) {}
       await external_side_effect({})`,
      {
        timeout: 200,
        fake,
        bindings: {
          external_side_effect: binding(async () => {
            called = true
          }),
        },
      },
    )
    expect(result.error?.name).toBe('TimeoutError')
    expect(called).toBe(false)
  })

  it('records an unconfirmed cleanup kill on the result', async () => {
    const fake = localSandbox({ killError: new Error('socket hang up') })
    const context = await createE2BIsolateDriver({
      sandbox: fake.sandbox,
    }).createContext({ bindings: {} })
    const result = await context.execute('return 1')
    expect(result.value).toBe(1)
    expect(result.logs?.join('\n')).toMatch(/may still be running/)
    await context.dispose()
  })

  it('rejects a protocol message with the wrong shape', async () => {
    // Code can rewrite the runner's own stdout writes; the host must not trust them.
    const { result } = await run(
      `const write = process.stdout._write
       process.stdout._write = function (chunk, _encoding, callback) {
         const text = chunk.toString().replace(/"success":true,"value":1/, '"success":false,"error":42')
         return write.call(this, Buffer.from(text), 'buffer', callback)
       }
       return 1`,
    )
    expect(result.error?.name).toBe('E2BExecutionError')
    expect(result.error?.message).toMatch(/Malformed/)
  })

  it('reports a process that exits without a result', async () => {
    const { result } = await run('process.exit(3)')
    expect(result.error?.name).toBe('E2BExecutionError')
    expect(result.error?.message).toContain('code 3')
  })

  it('kills an in-flight execution on dispose and refuses new ones', async () => {
    const fake = localSandbox()
    const context = await createE2BIsolateDriver({
      sandbox: fake.sandbox,
    }).createContext({ bindings: {} })
    const pending = context.execute('await new Promise(() => {})')
    await new Promise((r) => setTimeout(r, 300))
    await context.dispose()
    expect((await pending).error?.name).toBe('DisposedError')
    expect(fake.commands.some((c) => c.startsWith('kill -KILL -- -'))).toBe(
      true,
    )
    expect((await context.execute('return 1')).error?.name).toBe(
      'DisposedError',
    )
  })

  it('rejects tool names that are not identifiers before touching the sandbox', async () => {
    const { result, fake } = await run('return 1', {
      bindings: { 'external_get-weather': add },
    })
    expect(result.error?.name).toBe('E2BExecutionError')
    expect(fake.commands).toEqual([])
  })

  it('tells a gone sandbox apart from an unconfirmed start', async () => {
    const gone = await run('return 1', {
      fake: localSandbox({
        writeError: named('SandboxNotFoundError', 'sandbox not found'),
      }),
    })
    expect(gone.result.error?.name).toBe('E2BSandboxUnavailableError')

    // What `files.write` really throws for a killed or paused sandbox.
    const goneOnWrite = await run('return 1', {
      fake: localSandbox({
        writeError: named(
          'TimeoutError',
          'The sandbox was not found: This error is likely due to sandbox timeout.',
        ),
      }),
    })
    expect(goneOnWrite.result.error?.name).toBe('E2BSandboxUnavailableError')

    const unconfirmed = await run('return 1', {
      fake: localSandbox({ runError: new Error('socket hang up') }),
    })
    expect(unconfirmed.result.error?.name).toBe('E2BExecutionError')
    expect(unconfirmed.result.error?.message).toContain('Could not confirm')
  })

  it('kills and reports an unknown outcome when the event stream drops', async () => {
    const fake = localSandbox({ waitError: new Error('stream reset') })
    const { result } = await run('process.exit(5)', { fake })
    expect(result.error?.message).toContain('outcome is unknown')
    expect(fake.commands.some((c) => c.startsWith('kill -KILL -- -'))).toBe(
      true,
    )
  })

  it('rejects invalid timeouts', async () => {
    const { sandbox } = localSandbox()
    expect(() => createE2BIsolateDriver({ sandbox, timeout: 0 })).toThrow(
      /timeout/,
    )
    await expect(
      createE2BIsolateDriver({ sandbox }).createContext({
        bindings: {},
        timeout: Number.NaN,
      }),
    ).rejects.toThrow(/timeout/)
  })

  it('rejects memory limits that are not positive integers', async () => {
    const { sandbox } = localSandbox()
    const driver = createE2BIsolateDriver({ sandbox })
    for (const memoryLimit of [0, -1, 1.5, Number.NaN, '64; echo x']) {
      await expect(
        // @ts-expect-error: a JS caller can pass any value
        driver.createContext({ bindings: {}, memoryLimit }),
      ).rejects.toThrow(/memoryLimit/)
    }
  })
})
