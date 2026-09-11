/* eslint-disable @typescript-eslint/require-await -- trivial fixed-value fakes */
import { describe, expect, it, vi } from 'vitest'
import { journalReadStrategy } from '@tanstack/ai-sandbox'
import { BOXD_CAPS, BoxdHandle } from '../src/handle'
import type { BoxdClientLike, BoxdExecStream, BoxdLogger } from '../src/handle'
import type { ExecParams, StreamExecParams } from '@boxd-sh/sdk'

const enc = new TextEncoder()

/** A streaming exec whose output and exit the test drives. */
function fakeStream(
  opts: {
    stdout?: Array<Uint8Array>
    stderr?: Array<Uint8Array>
    exit?: number
  } = {},
) {
  let settle!: (code: number) => void
  const exited = new Promise<number>((resolve) => (settle = resolve))
  const writes: Array<string | Uint8Array> = []
  const stream = {
    stdout: (async function* () {
      for (const c of opts.stdout ?? []) yield c
    })(),
    stderr: (async function* () {
      for (const c of opts.stderr ?? []) yield c
    })(),
    write: (data: string | Uint8Array) => {
      writes.push(data)
    },
    end: vi.fn(),
    wait: () => exited,
    close: vi.fn(),
  } satisfies BoxdExecStream
  if (opts.exit !== undefined) settle(opts.exit)
  return { stream, writes, settle }
}

interface FakeOptions {
  exec?: (params: ExecParams) => {
    stdout?: string
    stderr?: string
    exitCode?: number
  }
  stream?: ReturnType<typeof fakeStream>
  files?: Record<string, Uint8Array>
  snapshotStatuses?: Array<'pending' | 'ready' | 'failed'>
}

function fakeClient(options: FakeOptions = {}) {
  const execCalls: Array<ExecParams> = []
  const streamCalls: Array<StreamExecParams> = []
  const files = options.files ?? {}
  const statuses = [...(options.snapshotStatuses ?? ['ready'])]
  const forkedFrom: Array<string> = []
  const client = {
    machines: {
      create: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(async () => undefined),
      start: vi.fn(),
      wake: vi.fn(),
      resume: vi.fn(),
      fork: vi.fn(async (id: string, params?: { name?: string }) => {
        forkedFrom.push(id)
        return {
          id: 'vm-fork',
          name: params?.name ?? 'unnamed',
          access: { url: 'https://fork.boxd.sh' },
        }
      }),
      exec: vi.fn(async (_id: string, params: ExecParams) => {
        execCalls.push(params)
        const r = options.exec?.(params) ?? {}
        return {
          stdout: r.stdout ?? '',
          stderr: r.stderr ?? '',
          exitCode: r.exitCode ?? 0,
          success: (r.exitCode ?? 0) === 0,
        }
      }),
      streamExec: vi.fn((_id: string, params: StreamExecParams) => {
        streamCalls.push(params)
        return (options.stream ?? fakeStream({ exit: 0 })).stream
      }),
      waitUntilReady: vi.fn(async (id: string) => ({
        id,
        name: `${id}-name`,
        access: { url: `https://${id}.boxd.sh` },
      })),
      files: {
        upload: vi.fn(async (_id: string, path: string, source: unknown) => {
          const data =
            typeof source === 'string'
              ? enc.encode(source)
              : (source as Uint8Array)
          files[path] = data
          return data.length
        }),
        download: vi.fn(async (_id: string, path: string) => {
          const data = files[path]
          if (!data) throw new Error(`not found: ${path}`)
          return data
        }),
      },
      proxies: {
        create: vi.fn(),
        list: vi.fn(async () => []),
        setPort: vi.fn(async () => undefined),
      },
    },
    snapshots: {
      create: vi.fn(async (_id: string, name: string) => ({
        id: 'snap_1',
        name,
        version: 1,
        status: 'pending' as const,
      })),
      get: vi.fn(async (name: string) => ({
        id: 'snap_1',
        name,
        status: statuses.length > 1 ? statuses.shift()! : statuses[0]!,
      })),
    },
  }
  return {
    client: client as unknown as BoxdClientLike,
    raw: client,
    execCalls,
    streamCalls,
    forkedFrom,
  }
}

function makeHandle(
  options: FakeOptions & {
    logger?: BoxdLogger
    env?: Record<string, string>
  } = {},
) {
  const { logger, env, ...rest } = options
  const fake = fakeClient(rest)
  const handle = new BoxdHandle({
    client: fake.client,
    machine: {
      id: 'vm-123',
      name: 'my-machine',
      access: { url: 'https://my-machine.boxd.sh' },
    },
    org: 'acme',
    workdir: '/home/boxd/workspace',
    ...(logger ? { logger } : {}),
    ...(env ? { env } : {}),
  })
  return { handle, ...fake }
}

const bashArg = (params: { command: string | Array<string> }): string => {
  expect(Array.isArray(params.command)).toBe(true)
  const [shell, flag, script] = params.command as Array<string>
  expect([shell, flag]).toEqual(['bash', '-c'])
  return script ?? ''
}

describe('BoxdHandle.process.exec', () => {
  it('runs the command through bash -c, cd-ing into the workdir, and forwards the result', async () => {
    const { handle, execCalls } = makeHandle({
      exec: () => ({ stdout: 'hi\n', stderr: 'warn\n', exitCode: 7 }),
    })
    const result = await handle.process.exec('echo hi')
    expect(result).toEqual({ stdout: 'hi\n', stderr: 'warn\n', exitCode: 7 })
    expect(bashArg(execCalls[0]!)).toBe(`cd '/home/boxd/workspace' && echo hi`)
  })

  it('maps /workspace cwd to the workdir and merges env.set() with per-call env', async () => {
    const { handle, execCalls } = makeHandle()
    await handle.env.set({ FOO: 'bar', KEEP: '1' })
    await handle.process.exec('env', {
      env: { FOO: 'override' },
      cwd: '/workspace/sub',
    })
    expect(bashArg(execCalls[0]!)).toBe(`cd '/home/boxd/workspace/sub' && env`)
    expect(execCalls[0]?.env).toEqual({ FOO: 'override', KEEP: '1' })
  })

  it('refuses to start when the signal is already aborted', async () => {
    const { handle, execCalls } = makeHandle()
    await expect(
      handle.process.exec('true', { signal: AbortSignal.abort() }),
    ).rejects.toThrow()
    expect(execCalls).toHaveLength(0)
  })
})

describe('BoxdHandle.fs', () => {
  it('reads and writes through the file API at the mapped absolute path', async () => {
    const { handle, raw } = makeHandle()
    await handle.fs.write('/workspace/note.txt', 'hello')
    expect(raw.machines.files.upload).toHaveBeenCalledWith(
      'vm-123',
      '/home/boxd/workspace/note.txt',
      'hello',
    )
    expect(await handle.fs.read('/workspace/note.txt')).toBe('hello')
    const bytes = new Uint8Array([0, 1, 250])
    await handle.fs.write('/etc/bin', bytes)
    expect(Array.from(await handle.fs.readBytes('/etc/bin'))).toEqual([
      0, 1, 250,
    ])
    expect(raw.machines.files.download).toHaveBeenLastCalledWith(
      'vm-123',
      '/etc/bin',
    )
  })

  it('lists entries from `ls -1Ap`, re-rooted under the virtual path', async () => {
    const { handle, execCalls } = makeHandle({
      exec: () => ({ stdout: 'a.txt\nlink\nsub/\n' }),
    })
    expect(await handle.fs.list('/workspace/')).toEqual([
      { name: 'a.txt', path: '/workspace/a.txt', type: 'file' },
      { name: 'link', path: '/workspace/link', type: 'file' },
      { name: 'sub', path: '/workspace/sub', type: 'dir' },
    ])
    expect(bashArg(execCalls[0]!)).toContain(`ls -1Ap '/home/boxd/workspace/'`)
  })

  it('answers exists from the exit code and surfaces failures of mkdir/remove/rename', async () => {
    const { handle } = makeHandle({
      exec: (p) =>
        bashArg(p).includes('test -e')
          ? { exitCode: 1 }
          : { exitCode: 2, stderr: 'nope' },
    })
    expect(await handle.fs.exists('/workspace/x')).toBe(false)
    await expect(handle.fs.mkdir('/workspace/d')).rejects.toThrow(
      'mkdir failed: nope',
    )
    await expect(handle.fs.remove('/workspace/d')).rejects.toThrow(
      'remove failed: nope',
    )
    await expect(
      handle.fs.rename('/workspace/a', '/workspace/b'),
    ).rejects.toThrow('rename failed: nope')
  })
})

describe('BoxdHandle.process.spawn', () => {
  it('wraps the command in a setsid group leader that records its pid, in the cwd, with env', async () => {
    const { handle, streamCalls } = makeHandle({
      stream: fakeStream({ exit: 0 }),
    })
    await handle.env.set({ A: '1' })
    await handle.process.spawn('echo hi', {
      cwd: '/workspace/app',
      env: { B: '2' },
    })
    const script = bashArg(streamCalls[0]!)
    expect(script).toMatch(
      /^cd '\/home\/boxd\/workspace\/app' && exec setsid -w bash -c '/,
    )
    expect(script).toContain(`echo $$ > '\\''/tmp/.tanstack-sandbox-spawn-`)
    expect(script).toContain(`bash -c '\\''echo hi'\\''; rc=$?; rm -f`)
    expect(streamCalls[0]?.env).toEqual({ A: '1', B: '2' })
    // stdin stays open: no closeStdin, so the caller can write to it.
    expect(streamCalls[0]).not.toHaveProperty('closeStdin')
  })

  it('decodes stdout and stderr as UTF-8 streams, even across a split multi-byte char', async () => {
    const euro = enc.encode('€')
    const { handle } = makeHandle({
      stream: fakeStream({
        stdout: [euro.slice(0, 1), euro.slice(1), enc.encode('!')],
        stderr: [enc.encode('warn')],
        exit: 3,
      }),
    })
    const proc = await handle.process.spawn('x')
    let out = ''
    for await (const c of proc.stdout) out += c
    let err = ''
    for await (const c of proc.stderr) err += c
    expect(out).toBe('€!')
    expect(err).toBe('warn')
    expect(await proc.wait()).toBe(3)
    expect(proc.pid).toBe(-1)
  })

  it('forwards stdin writes and end to the stream', async () => {
    const fake = fakeStream({ exit: 0 })
    const { handle } = makeHandle({ stream: fake })
    const proc = await handle.process.spawn('cat')
    await proc.stdin.write('hello\n')
    await proc.stdin.end()
    expect(fake.writes).toEqual(['hello\n'])
    expect(fake.stream.end).toHaveBeenCalledOnce()
  })

  it('kill() signals the recorded process group inside the machine, verifies, then closes the stream', async () => {
    const fake = fakeStream()
    const { handle, execCalls } = makeHandle({ stream: fake })
    const proc = await handle.process.spawn('sleep 60')
    const killed = proc.kill('SIGINT')
    fake.settle(130)
    await killed
    const script = bashArg(execCalls[0]!)
    expect(script).toContain(`cd '/' && `)
    expect(script).toContain(`pid=$(cat '/tmp/.tanstack-sandbox-spawn-`)
    expect(script).toContain(
      `kill -INT -- -"$pid" 2>/dev/null || kill -INT "$pid"`,
    )
    expect(script).toContain(`kill -KILL -- -"$pid"`)
    expect(script).toContain(`if kill -0 "$pid"`)
    expect(fake.stream.close).toHaveBeenCalledOnce()
    expect(await proc.wait()).toBe(130)
  })

  it.each([
    [undefined, 'TERM'],
    ['SIGKILL', 'KILL'],
    [9, '9'],
    ['weird; rm -rf /', 'TERM'],
  ] as const)('maps signal %s onto kill -%s', async (signal, expected) => {
    const fake = fakeStream()
    const { handle, execCalls } = makeHandle({ stream: fake })
    const proc = await handle.process.spawn('sleep 60')
    fake.settle(137)
    await proc.kill(signal as NodeJS.Signals | number | undefined)
    expect(bashArg(execCalls[0]!)).toContain(`kill -${expected} -- -"$pid"`)
  })

  it('joins concurrent kills into one in-machine kill', async () => {
    const fake = fakeStream()
    const { handle, execCalls } = makeHandle({ stream: fake })
    const proc = await handle.process.spawn('sleep 60')
    const a = proc.kill()
    const b = proc.kill()
    fake.settle(143)
    await Promise.all([a, b])
    expect(execCalls).toHaveLength(1)
  })

  it('kill() after a natural exit is a no-op (the wrapper removed its own pid file)', async () => {
    const fake = fakeStream({ exit: 0 })
    const { handle, execCalls } = makeHandle({ stream: fake })
    const proc = await handle.process.spawn('true')
    expect(await proc.wait()).toBe(0)
    await proc.kill()
    expect(execCalls).toHaveLength(0)
    expect(fake.stream.close).not.toHaveBeenCalled()
  })

  it('an abort signal fires the same kill', async () => {
    const fake = fakeStream()
    const { handle, execCalls } = makeHandle({ stream: fake })
    const controller = new AbortController()
    const proc = await handle.process.spawn('sleep 60', {
      signal: controller.signal,
    })
    controller.abort()
    fake.settle(143)
    await proc.wait()
    await vi.waitFor(() => expect(execCalls).toHaveLength(1))
    expect(bashArg(execCalls[0]!)).toContain('kill -TERM')
  })

  it('reports a survivor or a missing pid through the logger instead of throwing', async () => {
    const warn = vi.fn()
    const fake = fakeStream()
    const { handle } = makeHandle({
      stream: fake,
      logger: { warn },
      exec: () => ({ stderr: 'tanstack-sandbox-kill-failed pid=42' }),
    })
    const proc = await handle.process.spawn('sleep 60')
    fake.settle(0)
    await expect(proc.kill()).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      'boxd: in-machine process survived the kill; it may be orphaned',
      expect.objectContaining({
        stderr: 'tanstack-sandbox-kill-failed pid=42',
      }),
    )
  })
})

describe('BoxdHandle.ports / snapshot / fork / destroy', () => {
  it('connect(port) pins the machine route to the port and returns its public URL', async () => {
    const { handle, raw } = makeHandle()
    expect(await handle.ports.connect(3000)).toEqual({
      url: 'https://my-machine.boxd.sh',
    })
    expect(raw.machines.proxies.setPort).toHaveBeenCalledWith('vm-123', 3000)
  })

  it('snapshot() names the capture after the machine and label, and waits until it is restorable', async () => {
    const { handle, raw } = makeHandle({
      snapshotStatuses: ['pending', 'pending', 'ready'],
    })
    const ref = await handle.snapshot('after-setup')
    expect(ref).toEqual({ id: 'my-machine-after-setup', label: 'after-setup' })
    expect(raw.snapshots.create).toHaveBeenCalledWith(
      'vm-123',
      'my-machine-after-setup',
    )
    expect(raw.snapshots.get).toHaveBeenCalledTimes(3)
    expect(raw.snapshots.get).toHaveBeenLastCalledWith(
      'my-machine-after-setup',
      { org: 'acme' },
    )
  }, 10_000)

  it('snapshot() slugs the label and rejects a failed capture', async () => {
    const ok = makeHandle()
    expect((await ok.handle.snapshot('After Run: 42')).id).toBe(
      'my-machine-after-run-42',
    )
    const failed = makeHandle({ snapshotStatuses: ['failed'] })
    await expect(failed.handle.snapshot()).rejects.toThrow('failed to capture')
  })

  it('fork() clones the machine, waits until it is ready, and carries the env over', async () => {
    const { handle, raw, forkedFrom, execCalls } = makeHandle({
      env: { SECRET: 's' },
    })
    const fork = await handle.fork()
    expect(forkedFrom).toEqual(['vm-123'])
    expect(raw.machines.fork.mock.calls[0]?.[1]?.name).toMatch(
      /^my-machine-fork-[0-9a-f]{8}$/,
    )
    expect(raw.machines.waitUntilReady).toHaveBeenCalledWith('vm-fork')
    expect(fork.id).toBe('vm-fork')
    expect(fork.provider).toBe('boxd')
    await fork.process.exec('env')
    expect(execCalls[0]?.env).toEqual({ SECRET: 's' })
  })

  it('destroy() deletes the machine', async () => {
    const { handle, raw } = makeHandle()
    await handle.destroy()
    expect(raw.machines.delete).toHaveBeenCalledWith('vm-123')
  })

  it('declares capabilities that put the journal reader on the follow strategy', () => {
    const { handle } = makeHandle()
    expect(handle.capabilities).toBe(BOXD_CAPS)
    expect(BOXD_CAPS).toMatchObject({
      backgroundProcesses: true,
      writableStdin: true,
      killableProcesses: true,
      snapshots: true,
      fork: true,
      durableFilesystem: true,
      networkPolicy: false,
    })
    expect(journalReadStrategy(handle)).toBe('follow')
    expect(handle.workspaceRoot).toBe('/home/boxd/workspace')
  })
})
