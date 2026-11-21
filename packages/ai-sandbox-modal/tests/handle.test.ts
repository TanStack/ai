import { describe, expect, it, vi } from 'vitest'
import { ModalHandle, MODAL_CAPS } from '../src/handle'

vi.mock('modal', () => ({
  SandboxFilesystemNotFoundError: class SandboxFilesystemNotFoundError extends Error {},
}))

function handleFixture() {
  const sandbox = {
    sandboxId: 'sb-1',
    exec: vi.fn(),
    terminate: vi.fn(async () => undefined),
    tunnels: vi.fn(async () => ({ 3000: { url: 'https://tunnel.modal.run' } })),
    filesystem: {
      readText: vi.fn(async () => 'text'),
      readBytes: vi.fn(async () => new Uint8Array([1, 2])),
      writeText: vi.fn(async () => undefined),
      writeBytes: vi.fn(async () => undefined),
      listFiles: vi.fn(async () => [
        { name: 'a.txt', path: '/workspace/a.txt', type: 'file' },
      ]),
      makeDirectory: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ type: 'file', mode: 0o100644, size: 4 })),
    },
  }
  const handle = new ModalHandle({
    sandbox: sandbox as never,
    workdir: '/workspace',
    ports: [3000],
  })
  return { handle, sandbox }
}

describe('ModalHandle', () => {
  it('maps filesystem calls to Modal native operations', async () => {
    const { handle, sandbox } = handleFixture()
    await expect(handle.fs.read('a.txt')).resolves.toBe('text')
    await handle.fs.write('a.txt', new Uint8Array([4]))
    await expect(handle.fs.list('/workspace')).resolves.toEqual([
      { name: 'a.txt', path: '/workspace/a.txt', type: 'file' },
    ])
    expect(sandbox.filesystem.readText).toHaveBeenCalledWith('/workspace/a.txt')
    expect(sandbox.filesystem.writeBytes).toHaveBeenCalledWith(
      new Uint8Array([4]),
      '/workspace/a.txt',
    )
    expect(await handle.fs.lstat?.('a.txt')).toEqual({
      type: 'file',
      mode: 0o100644,
      size: 4,
    })
  })

  it('executes a shell command with cwd and merged environment', async () => {
    const { handle, sandbox } = handleFixture()
    const out = new ReadableStream<string>({
      start: (controller) => {
        controller.enqueue('out')
        controller.close()
      },
    })
    const err = new ReadableStream<string>({
      start: (controller) => {
        controller.enqueue('err')
        controller.close()
      },
    })
    sandbox.exec.mockResolvedValue({
      stdout: {
        readText: () =>
          out
            .getReader()
            .read()
            .then(({ value }) => value ?? ''),
      },
      stderr: {
        readText: () =>
          err
            .getReader()
            .read()
            .then(({ value }) => value ?? ''),
      },
      stdin: { writeText: vi.fn(), close: vi.fn() },
      wait: async () => 7,
    })
    await handle.env.set({ BASE: 'base' })
    await expect(
      handle.process.exec('echo hi', { cwd: 'src', env: { LOCAL: 'yes' } }),
    ).resolves.toEqual({
      stdout: 'out',
      stderr: 'err',
      exitCode: 7,
    })
    expect(sandbox.exec).toHaveBeenCalledWith(['sh', '-c', 'echo hi'], {
      stdout: 'pipe',
      stderr: 'pipe',
      workdir: '/workspace/src',
      env: { BASE: 'base', LOCAL: 'yes' },
    })
  })

  it('streams spawned output and writes interactive stdin', async () => {
    const { handle, sandbox } = handleFixture()
    const stream = (text: string) =>
      new ReadableStream<string>({
        start: (controller) => {
          controller.enqueue(text)
          controller.close()
        },
      })
    const writeText = vi.fn(async (_chunk: string) => undefined)
    const close = vi.fn(async () => undefined)
    sandbox.exec.mockResolvedValue({
      stdout: stream('out'),
      stderr: stream('err'),
      stdin: new WritableStream<string>({
        write: writeText,
        close,
      }),
      wait: async () => 0,
    })

    const process = await handle.process.spawn('cat')
    const stdout: Array<string> = []
    const stderr: Array<string> = []
    for await (const chunk of process.stdout) stdout.push(chunk)
    for await (const chunk of process.stderr) stderr.push(chunk)
    await process.stdin.write('input')
    await process.stdin.end()
    await expect(process.wait()).resolves.toBe(0)
    expect(sandbox.exec).toHaveBeenCalledWith(['sh', '-c', 'cat'], {
      stdout: 'pipe',
      stderr: 'pipe',
      workdir: '/workspace',
      env: {},
    })
    expect(stdout).toEqual(['out'])
    expect(stderr).toEqual(['err'])
    expect(writeText.mock.calls[0]?.[0]).toBe('input')
    expect(close).toHaveBeenCalledOnce()
  })

  it('terminates the sandbox when an in-flight command is aborted', async () => {
    const { handle, sandbox } = handleFixture()
    let finish!: (value: string) => void
    const text = new Promise<string>((resolve) => {
      finish = resolve
    })
    sandbox.exec.mockResolvedValue({
      stdout: { readText: () => text },
      stderr: { readText: async () => '' },
      wait: async () => 0,
    })
    const controller = new AbortController()
    const running = handle.process.exec('sleep 60', {
      signal: controller.signal,
    })
    await Promise.resolve()
    controller.abort(new Error('cancelled'))
    await expect(running).rejects.toThrow('cancelled')
    expect(sandbox.terminate).toHaveBeenCalledOnce()
    finish('')
  })

  it('exposes sandbox cleanup failure when an in-flight command is aborted', async () => {
    const { handle, sandbox } = handleFixture()
    const abortError = new Error('cancelled')
    const cleanupError = new Error('terminate failed')
    sandbox.terminate.mockRejectedValue(cleanupError)
    let finish!: (value: string) => void
    const text = new Promise<string>((resolve) => {
      finish = resolve
    })
    sandbox.exec.mockResolvedValue({
      stdout: { readText: () => text },
      stderr: { readText: async () => '' },
      wait: async () => 0,
    })
    const controller = new AbortController()
    const running = handle.process.exec('sleep 60', {
      signal: controller.signal,
    })
    await Promise.resolve()
    controller.abort(abortError)
    const error = await running.catch((value: unknown) => value)
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([abortError, cleanupError])
    expect((error as AggregateError).cause).toBe(abortError)
    finish('')
  })

  it('cleans up when cancellation races a pending command start', async () => {
    const { handle, sandbox } = handleFixture()
    const abortError = new Error('cancelled')
    const cleanupError = new Error('terminate failed')
    sandbox.terminate.mockRejectedValue(cleanupError)
    let rejectStart!: (error: Error) => void
    sandbox.exec.mockReturnValue(
      new Promise((_, reject) => {
        rejectStart = reject
      }),
    )
    const controller = new AbortController()
    const running = handle.process.exec('sleep 60', {
      signal: controller.signal,
    })

    await Promise.resolve()
    controller.abort(abortError)
    rejectStart(new Error('SDK start failed'))
    const error = await running.catch((value: unknown) => value)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([abortError, cleanupError])
    expect((error as AggregateError).cause).toBe(abortError)
    expect(sandbox.terminate).toHaveBeenCalledOnce()
  })

  it('exposes sandbox cleanup failure from an aborted spawned process wait', async () => {
    const { handle, sandbox } = handleFixture()
    const abortError = new Error('cancelled')
    const cleanupError = new Error('terminate failed')
    sandbox.terminate.mockRejectedValue(cleanupError)
    sandbox.exec.mockResolvedValue({
      stdout: new ReadableStream<string>(),
      stderr: new ReadableStream<string>(),
      stdin: new WritableStream<string>(),
      wait: () => new Promise<number>(() => {}),
    })
    const controller = new AbortController()
    const process = await handle.process.spawn('sleep 60', {
      signal: controller.signal,
    })

    controller.abort(abortError)
    const error = await process.wait().catch((value: unknown) => value)
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([abortError, cleanupError])
    expect((error as AggregateError).cause).toBe(abortError)
  })

  it('keeps process killing disabled and rejects unconfigured ports', async () => {
    const { handle } = handleFixture()
    expect(MODAL_CAPS.killableProcesses).toBe(false)
    await expect(handle.ports.connect(8080)).rejects.toThrow(/not exposed/)
    await expect(handle.ports.connect(3000)).resolves.toEqual({
      url: 'https://tunnel.modal.run',
    })
  })
})
