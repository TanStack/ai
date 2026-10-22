import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExecControlUnsupportedError, SandboxNotFoundError } from 'railway'
import { UnsupportedCapabilityError } from '@tanstack/ai-sandbox'
import {
  RailwayHandle,
  assertRemovablePath,
  snapshotName,
  toExecSignal,
} from '../src/handle'
import { fakeSandbox } from './fakes'
import type { FakeSandboxOptions } from './fakes'
import type { RailwayHandleDeps } from '../src/handle'

function createHandle(
  opts: FakeSandboxOptions = {},
  deps: Partial<RailwayHandleDeps> = {},
) {
  const fake = fakeSandbox(opts)
  const handle = new RailwayHandle({
    sandbox: fake.sandbox,
    workdir: '/workspace',
    ...deps,
  })
  return { ...fake, handle }
}

async function drain(iter: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const chunk of iter) out += chunk
  return out
}

afterEach(() => {
  vi.useRealTimers()
})

describe('capabilities', () => {
  it('declares every capability Railway backs', () => {
    const { handle } = createHandle()
    expect(handle.capabilities).toEqual({
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: true,
      writableStdin: true,
      killableProcesses: true,
      snapshots: true,
      networkPolicy: false,
      durableFilesystem: false,
      fork: true,
    })
  })

  it('advertises ports only when domains were declared', () => {
    expect(createHandle({}, { ports: [3000] }).handle.capabilities.ports).toBe(
      true,
    )
    // A resumed handle learns its ports from the published domains.
    const resumed = createHandle({
      domains: [{ port: 3000, prefix: 'p', domain: 'p.up.railway.app' }],
    })
    expect(resumed.handle.capabilities.ports).toBe(true)
  })
})

describe('process.exec', () => {
  it('runs in the workspace with the env overlay and no timeoutSec', async () => {
    const { handle, sandbox, execs } = createHandle({
      onExec: (f) => {
        f.emitStdout('hi\n')
        f.emitStderr('warn\n')
        f.exit(3)
      },
    })
    await handle.env.set({ BASE: 'base', OVER: 'old' })
    const r = await handle.process.exec('echo hi', {
      env: { OVER: 'new' },
    })
    expect(r).toEqual({ stdout: 'hi\n', stderr: 'warn\n', exitCode: 3 })
    expect(sandbox.exec).toHaveBeenCalledOnce()
    const options = execs[0]!.options
    expect(execs[0]!.command).toBe('echo hi')
    expect(options.cwd).toBe('/workspace')
    expect(options.env).toEqual({ BASE: 'base', OVER: 'new' })
    expect(options).not.toHaveProperty('timeoutSec')
    // Blocking execs run ephemeral with a capture cap; abort is handled by the
    // handle, not the SDK signal, so the real exit code comes back.
    expect(options.ephemeral).toBe(true)
    expect(options.maxOutputBytes).toBe(8 * 1024 * 1024)
    expect(options).not.toHaveProperty('signal')
    expect(options).not.toHaveProperty('stdin')
    expect(options).not.toHaveProperty('captureOutput')
  })

  it('omits an empty env and resolves cwd against the workspace', async () => {
    const { handle, execs } = createHandle()
    await handle.process.exec('ls', { cwd: 'sub' })
    expect(execs[0]!.options).not.toHaveProperty('env')
    expect(execs[0]!.options.cwd).toBe('/workspace/sub')
  })

  it('normalizes a null exit code and marks truncated output', async () => {
    const { handle } = createHandle({
      onExec: (f) => f.exit(null, { truncated: true }),
    })
    const r = await handle.process.exec('noisy')
    expect(r.exitCode).toBe(-1)
    expect(r.stderr).toContain('[railway] output truncated')
  })

  it('surfaces an interrupted exec as a rejection', async () => {
    const { handle } = createHandle({
      onExec: (f) => f.fail(new Error('socket closed')),
    })
    await expect(handle.process.exec('x')).rejects.toThrow('socket closed')
  })

  it('rejects an already-aborted signal without starting a command', async () => {
    const { handle, sandbox } = createHandle()
    const controller = new AbortController()
    controller.abort(new Error('stop'))
    await expect(
      handle.process.exec('x', { signal: controller.signal }),
    ).rejects.toThrow('stop')
    expect(sandbox.exec).not.toHaveBeenCalled()
  })

  it('on abort signals TERM, escalates to KILL, and resolves with the signalled exit', async () => {
    vi.useFakeTimers()
    const { handle, execs } = createHandle({ onExec: () => {} })
    const controller = new AbortController()
    const pending = handle.process.exec('sleep 100', {
      signal: controller.signal,
    })
    controller.abort(new Error('cancelled'))
    expect(execs[0]!.kill).toHaveBeenCalledWith('TERM')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(execs[0]!.kill).toHaveBeenCalledWith('KILL')
    execs[0]!.exit(-1)
    await expect(pending).resolves.toMatchObject({ exitCode: -1 })
  })

  it('rejects with the abort reason when no exit is confirmed in time', async () => {
    vi.useFakeTimers()
    const { handle } = createHandle({ onExec: () => {} })
    const controller = new AbortController()
    const pending = handle.process.exec('sleep 100', {
      signal: controller.signal,
    })
    pending.catch(() => undefined)
    controller.abort(new Error('cancelled'))
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(pending).rejects.toThrow('cancelled')
  })

  it('retries durably when the proxy cannot run an ephemeral exec', async () => {
    let calls = 0
    const { handle, execs } = createHandle({
      onExec: (f) => {
        calls++
        if (calls === 1)
          f.fail(new ExecControlUnsupportedError({ message: 'old proxy' }))
        else f.exit(0)
      },
    })
    await expect(handle.process.exec('true')).resolves.toMatchObject({
      exitCode: 0,
    })
    expect(execs[0]!.options.ephemeral).toBe(true)
    expect(execs[1]!.options).not.toHaveProperty('ephemeral')
  })

  it('does not escalate when the command exits within the grace period', async () => {
    vi.useFakeTimers()
    const { handle, execs } = createHandle({ onExec: () => {} })
    const controller = new AbortController()
    const pending = handle.process.exec('sleep 100', {
      signal: controller.signal,
    })
    controller.abort()
    execs[0]!.exit(-1)
    await expect(pending).resolves.toMatchObject({ exitCode: -1 })
    await vi.advanceTimersByTimeAsync(5_000)
    expect(execs[0]!.kill).toHaveBeenCalledTimes(1)
  })
})

describe('process.spawn', () => {
  it('streams stdout and stderr separately and resolves the exit code', async () => {
    const { handle } = createHandle({
      onExec: (f) => {
        queueMicrotask(() => {
          f.emitStdout('out')
          f.emitStderr('err')
          f.exit(0)
        })
      },
    })
    const proc = await handle.process.spawn('run')
    expect(proc.pid).toBe(-1)
    const [out, err] = await Promise.all([
      drain(proc.stdout),
      drain(proc.stderr),
    ])
    expect(out).toBe('out')
    expect(err).toBe('err')
    expect(await proc.wait()).toBe(0)
  })

  it('keeps stdin open, disables capture, and writes through', async () => {
    const { handle, execs } = createHandle({ onExec: () => {} })
    const proc = await handle.process.spawn('cat')
    expect(execs[0]!.options.stdin).toBe(true)
    expect(execs[0]!.options.captureOutput).toBe(false)
    await proc.stdin.write('hello')
    await proc.stdin.end()
    expect(execs[0]!.stdinWrite).toHaveBeenCalledWith('hello')
    expect(execs[0]!.stdinEnd).toHaveBeenCalledOnce()
  })

  it('maps kill signals onto the SDK group signals', async () => {
    vi.useFakeTimers()
    const { handle, execs } = createHandle({ onExec: () => {} })
    const proc = await handle.process.spawn('sleep 100')
    const killed = proc.kill('SIGINT')
    await vi.advanceTimersByTimeAsync(0)
    expect(execs[0]!.kill).toHaveBeenCalledWith('INT')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(execs[0]!.kill).toHaveBeenLastCalledWith('KILL')
    execs[0]!.exit(-1)
    await expect(killed).resolves.toBeUndefined()
  })

  it('kill() rejects when no exit is confirmed in time', async () => {
    vi.useFakeTimers()
    const { handle } = createHandle({ onExec: () => {} })
    const proc = await handle.process.spawn('sleep 100')
    const killed = proc.kill()
    killed.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(12_000)
    await expect(killed).rejects.toThrow(/no exit confirmed/)
  })

  it('kills on abort', async () => {
    const { handle, execs } = createHandle({ onExec: () => {} })
    const controller = new AbortController()
    await handle.process.spawn('tail -f x', { signal: controller.signal })
    controller.abort()
    expect(execs[0]!.kill).toHaveBeenCalledWith('KILL')
  })

  it('kills and truncates when a stream exceeds the byte cap', async () => {
    const { handle, execs } = createHandle({ onExec: () => {} })
    const proc = await handle.process.spawn('yes')
    const big = 'x'.repeat(1024 * 1024)
    for (let i = 0; i < 9; i++) execs[0]!.emitStdout(big)
    const out = await drain(proc.stdout)
    expect(out).toContain('output truncated')
    expect(execs[0]!.kill).toHaveBeenCalledWith('KILL')
  })

  it('rejects an already-aborted signal before starting', async () => {
    const { handle, sandbox } = createHandle()
    const controller = new AbortController()
    controller.abort()
    await expect(
      handle.process.spawn('x', { signal: controller.signal }),
    ).rejects.toThrow()
    expect(sandbox.exec).not.toHaveBeenCalled()
  })
})

describe('toExecSignal', () => {
  it.each([
    [undefined, 'TERM'],
    ['SIGTERM', 'TERM'],
    [15, 'TERM'],
    ['SIGKILL', 'KILL'],
    [9, 'KILL'],
    ['SIGINT', 'INT'],
    ['SIGHUP', 'HUP'],
    ['SIGQUIT', 'QUIT'],
    ['SIGUSR1', 'KILL'],
  ] as const)('%s -> %s', (input, expected) => {
    expect(toExecSignal(input as NodeJS.Signals | undefined)).toBe(expected)
  })
})

describe('fs', () => {
  it('maps native file operations onto workspace paths', async () => {
    const { handle, sandbox } = createHandle()
    await handle.fs.read('/workspace/a.txt')
    expect(sandbox.files.read).toHaveBeenCalledWith('/workspace/a.txt', {
      format: 'text',
    })
    await handle.fs.readBytes('b.bin')
    expect(sandbox.files.read).toHaveBeenCalledWith('/workspace/b.bin', {
      format: 'bytes',
    })
    const bytes = new Uint8Array([0, 255])
    await handle.fs.write('/workspace/c', bytes)
    expect(sandbox.files.write).toHaveBeenCalledWith('/workspace/c', bytes)
    await handle.fs.mkdir('/workspace/d')
    expect(sandbox.files.mkdir).toHaveBeenCalledWith('/workspace/d')
    await handle.fs.rename('/workspace/c', '/workspace/e')
    expect(sandbox.files.rename).toHaveBeenCalledWith(
      '/workspace/c',
      '/workspace/e',
    )
    await expect(handle.fs.exists('/etc/hosts')).resolves.toBe(true)
    expect(sandbox.files.exists).toHaveBeenCalledWith('/etc/hosts')
  })

  it('maps a non-default workdir', async () => {
    const { handle, sandbox } = createHandle({}, { workdir: '/app' })
    await handle.fs.read('/workspace/a')
    expect(sandbox.files.read).toHaveBeenCalledWith('/app/a', {
      format: 'text',
    })
    await handle.fs.read('/workspace')
    expect(sandbox.files.read).toHaveBeenLastCalledWith('/app', {
      format: 'text',
    })
    expect(handle.workspaceRoot).toBe('/app')
  })

  it('lists entries with contract types', async () => {
    const { handle, sandbox } = createHandle()
    sandbox.files.list.mockResolvedValue([
      { name: 'src', isDir: true, size: 0, mode: 0, modTime: '' },
      { name: 'a.ts', isDir: false, size: 3, mode: 0, modTime: '' },
    ])
    await expect(handle.fs.list('/workspace/')).resolves.toEqual([
      { name: 'src', path: '/workspace/src', type: 'dir' },
      { name: 'a.ts', path: '/workspace/a.ts', type: 'file' },
    ])
  })

  it('removes recursively with a quoted path', async () => {
    const { handle, execs, sandbox } = createHandle()
    await handle.fs.remove("/workspace/it's dir")
    expect(execs[0]!.command).toBe(`rm -rf -- '/workspace/it'\\''s dir'`)
    expect(sandbox.files.remove).not.toHaveBeenCalled()
  })

  it('surfaces a failed remove', async () => {
    const { handle } = createHandle({
      onExec: (f) => {
        f.emitStderr('permission denied')
        f.exit(1)
      },
    })
    await expect(handle.fs.remove('/workspace/x')).rejects.toThrow(
      /permission denied/,
    )
  })

  it.each(['/', '//', '/workspace/../..', '/a/./b', '/x\0y'])(
    'refuses to remove %j',
    async (path) => {
      const { handle, sandbox } = createHandle()
      await expect(handle.fs.remove(path)).rejects.toThrow(/railway:/)
      expect(sandbox.exec).not.toHaveBeenCalled()
    },
  )

  it('accepts ordinary absolute paths in the guard', () => {
    expect(() => assertRemovablePath('/workspace')).not.toThrow()
    expect(() => assertRemovablePath('/workspace/a/')).not.toThrow()
    expect(() => assertRemovablePath('relative')).toThrow()
  })
})

describe('ports', () => {
  it('is unsupported when no ports were declared', async () => {
    const { handle } = createHandle()
    await expect(handle.ports.connect(3000)).rejects.toBeInstanceOf(
      UnsupportedCapabilityError,
    )
  })

  it('resolves a declared port to its https domain', async () => {
    const { handle } = createHandle(
      {
        networkIsolation: 'PRIVATE',
        domains: [{ port: 3000, prefix: 'app', domain: 'app.up.railway.app' }],
      },
      { ports: [3000] },
    )
    await expect(handle.ports.connect(3000)).resolves.toEqual({
      url: 'https://app.up.railway.app',
    })
  })

  it('refreshes once when a declared domain is missing from the record', async () => {
    const { handle, sandbox } = createHandle({}, { ports: [3000] })
    sandbox.refresh.mockImplementation(async () => {
      sandbox.domains = [
        { port: 3000, prefix: 'app', domain: 'https://app.example' },
      ]
      return sandbox
    })
    await expect(handle.ports.connect(3000)).resolves.toEqual({
      url: 'https://app.example',
    })
    expect(sandbox.refresh).toHaveBeenCalledOnce()
  })

  it('rejects an undeclared port clearly', async () => {
    const { handle, sandbox } = createHandle(
      { domains: [{ port: 3000, prefix: 'a', domain: 'a.up.railway.app' }] },
      { ports: [3000] },
    )
    await expect(handle.ports.connect(5173)).rejects.toThrow(
      /port 5173 has no published domain/,
    )
    expect(sandbox.refresh).not.toHaveBeenCalled()
  })
})

describe('snapshot', () => {
  it('uses a unique tsai-<id>-<uuid> name and keeps the label descriptive', async () => {
    const { handle, sandbox } = createHandle()
    const a = await handle.snapshot('after-setup')
    const b = await handle.snapshot('after-setup')
    expect(a.id).toMatch(
      /^tsai-sbx_123-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(a.id).not.toBe(b.id)
    expect(a.label).toBe('after-setup')
    expect(sandbox.checkpoint).toHaveBeenCalledWith(a.id)
    expect(await handle.snapshot()).not.toHaveProperty('label')
  })

  it('names never reuse the label', () => {
    expect(snapshotName('s')).not.toContain('after')
  })
})

describe('fork', () => {
  it('reapplies creation config and copies the env overlay', async () => {
    const { handle, sandbox } = createHandle(
      { networkIsolation: 'PRIVATE' },
      {
        ports: [3000],
        forkConfig: {
          idleTimeoutMinutes: 15,
          networkIsolation: 'PRIVATE',
          env: { BAKED: '1' },
        },
      },
    )
    const child = fakeSandbox({ id: 'sbx_fork' })
    sandbox.fork.mockResolvedValue(child.sandbox)
    await handle.env.set({ SECRET: 's' })
    const forked = await handle.fork()
    expect(sandbox.fork).toHaveBeenCalledWith({
      idleTimeoutMinutes: 15,
      networkIsolation: 'PRIVATE',
      domains: [{ port: 3000 }],
      env: { BAKED: '1' },
    })
    expect(forked.id).toBe('sbx_fork')
    expect(forked.capabilities.ports).toBe(true)
    await forked.process.exec('env')
    expect(child.execs[0]!.options.env).toEqual({ SECRET: 's' })
    // The overlay is copied, not shared.
    await forked.env.set({ ONLY_CHILD: '1' })
    await handle.process.exec('env')
    expect(
      (sandbox.exec.mock.calls.at(-1)?.[1] as { env: object }).env,
    ).toEqual({ SECRET: 's' })
  })

  it('falls back to the sandbox record for a resumed handle', async () => {
    const { handle, sandbox } = createHandle()
    sandbox.fork.mockResolvedValue(fakeSandbox({ id: 'f' }).sandbox)
    await handle.fork()
    expect(sandbox.fork).toHaveBeenCalledWith({ networkIsolation: 'ISOLATED' })
  })
})

describe('destroy', () => {
  it('treats an already-gone sandbox as success', async () => {
    const { handle, sandbox } = createHandle()
    sandbox.destroy.mockRejectedValue(
      new SandboxNotFoundError({ id: 'sbx_123', environmentId: 'env' }),
    )
    await expect(handle.destroy()).resolves.toBeUndefined()
  })

  it('rethrows real failures', async () => {
    const { handle, sandbox } = createHandle()
    sandbox.destroy.mockRejectedValue(new Error('403'))
    await expect(handle.destroy()).rejects.toThrow('403')
  })
})
