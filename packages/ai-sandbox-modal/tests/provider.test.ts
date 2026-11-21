import { beforeEach, describe, expect, it, vi } from 'vitest'
import { modalSandbox } from '../src/provider'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  fromId: vi.fn(),
  fromName: vi.fn(),
  sandboxFromName: vi.fn(),
  fromRegistry: vi.fn(),
  clientOptions: undefined as Record<string, unknown> | undefined,
}))

vi.mock('modal', () => ({
  ModalClient: class {
    constructor(options: Record<string, unknown>) {
      mocks.clientOptions = options
    }

    apps = { fromName: mocks.fromName }
    images = { fromRegistry: mocks.fromRegistry }
    sandboxes = {
      create: mocks.create,
      fromId: mocks.fromId,
      fromName: mocks.sandboxFromName,
    }
  },
  NotFoundError: class NotFoundError extends Error {},
  SandboxFilesystemNotFoundError: class SandboxFilesystemNotFoundError extends Error {},
}))

function sandboxStub(id = 'sb-1') {
  return {
    sandboxId: id,
    filesystem: { makeDirectory: vi.fn(async () => undefined) },
    terminate: vi.fn(async () => undefined),
  }
}

beforeEach(() => {
  mocks.create.mockReset()
  mocks.fromId.mockReset()
  mocks.sandboxFromName.mockReset()
  mocks.fromName.mockReset().mockResolvedValue({ appId: 'ap-1' })
  mocks.fromRegistry.mockReset().mockReturnValue({ imageId: 'im-1' })
})

describe('modalSandbox', () => {
  it('cleans up after preparation fails', async () => {
    const sandbox = sandboxStub()
    sandbox.filesystem.makeDirectory.mockRejectedValue(
      new Error('mkdir failed'),
    )
    mocks.create.mockResolvedValue(sandbox)

    await expect(
      modalSandbox({ appName: 'agents' }).create({ id: 'run-1' }),
    ).rejects.toThrow('mkdir failed')

    expect(mocks.create).toHaveBeenCalledWith(
      { appId: 'ap-1' },
      { imageId: 'im-1' },
      expect.objectContaining({
        name: 'run-1',
        command: ['sleep', 'infinity'],
        timeoutMs: 30 * 60_000,
      }),
    )
    expect(sandbox.terminate).toHaveBeenCalledOnce()
  })

  it('exposes both setup and cleanup errors', async () => {
    const sandbox = sandboxStub()
    const operationError = new Error('mkdir failed')
    const cleanupError = new Error('terminate failed')
    sandbox.filesystem.makeDirectory.mockRejectedValue(operationError)
    sandbox.terminate.mockRejectedValue(cleanupError)
    mocks.create.mockResolvedValue(sandbox)

    const error = await modalSandbox({ appName: 'agents' })
      .create({})
      .catch((value: unknown) => value)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([
      operationError,
      cleanupError,
    ])
    expect((error as AggregateError).cause).toBe(operationError)
  })

  it('cleans up a sandbox created after the caller aborts', async () => {
    const sandbox = sandboxStub()
    const controller = new AbortController()
    let finish!: (value: ReturnType<typeof sandboxStub>) => void
    mocks.create.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const creating = modalSandbox({ appName: 'agents' }).create({
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce())
    controller.abort(new Error('cancelled'))
    finish(sandbox)
    await expect(creating).rejects.toThrow('cancelled')
    expect(sandbox.terminate).toHaveBeenCalledOnce()
  })

  it('exposes a cleanup failure after late cancellation', async () => {
    const sandbox = sandboxStub()
    const controller = new AbortController()
    const abortError = new Error('caller stopped')
    const cleanupError = new Error('terminate failed')
    sandbox.terminate.mockRejectedValue(cleanupError)
    let finish!: (value: ReturnType<typeof sandboxStub>) => void
    mocks.create.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const creating = modalSandbox({ appName: 'agents' }).create({
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce())
    controller.abort(abortError)
    expect(sandbox.terminate).not.toHaveBeenCalled()
    finish(sandbox)
    const error = await creating.catch((value: unknown) => value)
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([abortError, cleanupError])
    expect((error as AggregateError).cause).toBe(abortError)
    expect(sandbox.terminate).toHaveBeenCalledOnce()
  })

  it('uses Modal IDs first for resume and destroy', async () => {
    const sandbox = sandboxStub('sb-live')
    mocks.fromId.mockResolvedValue(sandbox)
    const provider = modalSandbox({ appName: 'agents' })
    expect((await provider.resume({ id: 'sb-live' }))?.id).toBe('sb-live')
    expect(mocks.fromId).toHaveBeenCalledWith('sb-live')
    await provider.destroy({ id: 'sb-live' })
    expect(sandbox.terminate).toHaveBeenCalledOnce()
    expect(mocks.sandboxFromName).not.toHaveBeenCalled()
  })

  it('resumes and destroys by the create-time name in its App and environment', async () => {
    const sandbox = sandboxStub('sb-live')
    mocks.fromId.mockRejectedValue(
      new (await import('modal')).NotFoundError('missing'),
    )
    mocks.sandboxFromName.mockResolvedValue(sandbox)
    const provider = modalSandbox({ appName: 'agents', environment: 'staging' })

    expect((await provider.resume({ id: 'run-name' }))?.id).toBe('sb-live')
    await provider.destroy({ id: 'run-name' })

    expect(mocks.sandboxFromName).toHaveBeenNthCalledWith(
      1,
      'agents',
      'run-name',
      { environment: 'staging' },
    )
    expect(mocks.sandboxFromName).toHaveBeenNthCalledWith(
      2,
      'agents',
      'run-name',
      { environment: 'staging' },
    )
    expect(mocks.clientOptions).toEqual({ environment: 'staging' })
    expect(sandbox.terminate).toHaveBeenCalledOnce()
  })

  it('returns null only when both ID and name lookups are missing', async () => {
    const { NotFoundError } = await import('modal')
    mocks.fromId.mockRejectedValue(new NotFoundError('missing ID'))
    mocks.sandboxFromName.mockRejectedValue(new NotFoundError('missing name'))
    await expect(
      modalSandbox({ appName: 'agents' }).resume({ id: 'gone' }),
    ).resolves.toBeNull()
  })

  it('does not hide name lookup authentication or network failures', async () => {
    const { NotFoundError } = await import('modal')
    mocks.fromId.mockRejectedValue(new NotFoundError('missing ID'))
    const failure = new Error('unauthorized')
    mocks.sandboxFromName.mockRejectedValue(failure)
    await expect(
      modalSandbox({ appName: 'agents' }).resume({ id: 'run-name' }),
    ).rejects.toBe(failure)
  })

  it('does not hide ID lookup authentication or network failures', async () => {
    const failure = new Error('network unavailable')
    mocks.fromId.mockRejectedValue(failure)
    await expect(
      modalSandbox({ appName: 'agents' }).resume({ id: 'sb-live' }),
    ).rejects.toBe(failure)
    expect(mocks.sandboxFromName).not.toHaveBeenCalled()
  })
})
