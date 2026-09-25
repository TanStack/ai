/**
 * Provider tests against a mocked `e2b`. The cases that matter most: a killed
 * or expired sandbox resumes as `null` (so `ensure()` re-creates), anything
 * else from `connect` surfaces (so `ensure()` does not duplicate a live
 * sandbox), and an abort that lands mid-create kills what was just made.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INSTANCE_KEY_METADATA, e2bSandbox } from '../src/index'

const { createMock, connectMock, killMock, MockNotFound } = vi.hoisted(() => {
  class MockNotFound extends Error {}
  return {
    createMock: vi.fn(),
    connectMock: vi.fn(),
    killMock: vi.fn(),
    MockNotFound,
  }
})

vi.mock('e2b', () => ({
  Sandbox: { create: createMock, connect: connectMock, kill: killMock },
  SandboxNotFoundError: MockNotFound,
  CommandExitError: class extends Error {},
}))

/** A sandbox stub covering only what the provider touches. */
function sandboxStub(id = 'sbx_123') {
  return {
    sandboxId: id,
    trafficAccessToken: undefined,
    files: { makeDir: vi.fn(async () => true) },
    kill: vi.fn(async () => true),
  }
}

beforeEach(() => {
  createMock.mockReset()
  connectMock.mockReset()
  killMock.mockReset()
})

describe('e2bSandbox create', () => {
  it('creates with the 30 minute default timeout, kill-on-timeout, and the key as metadata', async () => {
    const stub = sandboxStub()
    createMock.mockResolvedValue(stub)
    const handle = await e2bSandbox({ apiKey: 'k' }).create({
      id: 'thread-1',
      env: { A: 'b' },
    })
    expect(handle.id).toBe('sbx_123')
    expect(handle.workspaceRoot).toBe('/home/user/workspace')
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'k',
        timeoutMs: 30 * 60_000,
        envs: { A: 'b' },
        metadata: { [INSTANCE_KEY_METADATA]: 'thread-1' },
        lifecycle: { onTimeout: 'kill' },
      }),
    )
    // The workdir is created natively before any cwd-bound command runs.
    expect(stub.files.makeDir).toHaveBeenCalledWith('/home/user/workspace')
  })

  it('forwards the configured template', async () => {
    createMock.mockResolvedValue(sandboxStub())
    await e2bSandbox({ apiKey: 'k', template: 'my-template' }).create({})
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'k', template: 'my-template' }),
    )
  })

  it('forwards timeoutMs, onTimeout, metadata, workdir and allowPublicTraffic', async () => {
    const stub = sandboxStub()
    createMock.mockResolvedValue(stub)
    const handle = await e2bSandbox({
      timeoutMs: 60_000,
      onTimeout: 'pause',
      metadata: { team: 'x' },
      workdir: '/home/user/app',
      allowPublicTraffic: false,
    }).create({ id: 'k1' })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 60_000,
        lifecycle: { onTimeout: 'pause' },
        metadata: { team: 'x', [INSTANCE_KEY_METADATA]: 'k1' },
        network: { allowPublicTraffic: false },
      }),
    )
    expect(stub.files.makeDir).toHaveBeenCalledWith('/home/user/app')
    expect(handle.workspaceRoot).toBe('/home/user/app')
  })

  it('does not send an empty envs object', async () => {
    createMock.mockResolvedValue(sandboxStub())
    await e2bSandbox().create({ env: {} })
    expect(createMock.mock.calls[0]?.[0]).not.toHaveProperty('envs')
  })

  it('maps a deny network policy onto allowInternetAccess: false', async () => {
    createMock.mockResolvedValue(sandboxStub())
    await e2bSandbox().create({
      policy: { capabilities: { network: 'deny' } },
    })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ allowInternetAccess: false }),
    )
  })

  it('leaves internet access at the E2B default for allow/ask', async () => {
    createMock.mockResolvedValue(sandboxStub())
    await e2bSandbox().create({
      policy: { capabilities: { network: 'allow' } },
    })
    expect(createMock.mock.calls[0]?.[0]).not.toHaveProperty(
      'allowInternetAccess',
    )
  })

  // The SDK's signal only cancels the HTTP request, so an abort that lands
  // after the sandbox exists must kill it rather than leave a billed sandbox
  // with no owner.
  it('kills the sandbox when the signal aborts during create', async () => {
    const stub = sandboxStub()
    const controller = new AbortController()
    createMock.mockImplementation(async () => {
      controller.abort()
      return stub
    })
    await expect(
      e2bSandbox().create({ signal: controller.signal }),
    ).rejects.toThrow()
    expect(stub.kill).toHaveBeenCalledOnce()
  })

  it('kills the sandbox when preparing the workdir fails', async () => {
    const stub = sandboxStub()
    stub.files.makeDir.mockRejectedValue(new Error('disk full'))
    createMock.mockResolvedValue(stub)
    await expect(e2bSandbox().create({})).rejects.toThrow('disk full')
    expect(stub.kill).toHaveBeenCalledOnce()
  })

  // The SDK cannot cancel a pending create, so the caller is released at once
  // and the sandbox is killed when the create eventually settles.
  it('rejects promptly while create is pending and kills the late sandbox', async () => {
    const stub = sandboxStub()
    let settle!: (s: typeof stub) => void
    createMock.mockReturnValue(new Promise((r) => (settle = r)))
    const controller = new AbortController()
    const pending = e2bSandbox().create({ signal: controller.signal })
    controller.abort(new Error('caller gave up'))
    await expect(pending).rejects.toThrow('caller gave up')
    expect(stub.kill).not.toHaveBeenCalled()
    settle(stub)
    await new Promise((r) => setTimeout(r, 0))
    expect(stub.kill).toHaveBeenCalledOnce()
  })

  it('applies the same abort handling to restoreSnapshot', async () => {
    createMock.mockReturnValue(new Promise(() => {}))
    const controller = new AbortController()
    const pending = e2bSandbox().restoreSnapshot!({
      snapshotId: 'snap',
      signal: controller.signal,
    })
    controller.abort()
    await expect(pending).rejects.toThrow()
  })

  it('rejects a plain-http apiUrl at construction, but allows loopback', () => {
    expect(() => e2bSandbox({ apiUrl: 'http://api.example.com' })).toThrow(
      /apiUrl must use https/,
    )
    expect(() => e2bSandbox({ apiUrl: 'http://localhost:3000' })).not.toThrow()
    expect(() => e2bSandbox({ apiUrl: 'https://api.e2b.app' })).not.toThrow()
  })

  it('rejects before creating when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      e2bSandbox().create({ signal: controller.signal }),
    ).rejects.toThrow()
    expect(createMock).not.toHaveBeenCalled()
  })
})

describe('e2bSandbox restoreSnapshot', () => {
  it('creates a sandbox from the snapshot id and carries env + policy', async () => {
    createMock.mockResolvedValue(sandboxStub('sbx_restored'))
    const provider = e2bSandbox({ apiKey: 'k' })
    // restoreSnapshot is optional on the contract; this provider implements it.
    const handle = await provider.restoreSnapshot!({
      snapshotId: 'team/tanstack-ai-sbx-after-setup:default',
      env: { SECRET: 's' },
      policy: { capabilities: { network: 'deny' } },
    })
    expect(handle.id).toBe('sbx_restored')
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'team/tanstack-ai-sbx-after-setup:default',
        envs: { SECRET: 's' },
        allowInternetAccess: false,
      }),
    )
  })

  it('kills the sandbox when the signal aborts while the workdir is being prepared', async () => {
    const stub = sandboxStub()
    const controller = new AbortController()
    stub.files.makeDir.mockImplementation(async () => {
      controller.abort()
      throw new Error('request aborted')
    })
    createMock.mockResolvedValue(stub)
    await expect(
      e2bSandbox().create({ signal: controller.signal }),
    ).rejects.toThrow()
    expect(stub.kill).toHaveBeenCalledOnce()
  })
})

describe('e2bSandbox resume', () => {
  it('connects by id and extends the timeout', async () => {
    connectMock.mockResolvedValue(sandboxStub('sbx_live'))
    const handle = await e2bSandbox({ apiKey: 'k' }).resume({ id: 'sbx_live' })
    expect(handle?.id).toBe('sbx_live')
    expect(connectMock).toHaveBeenCalledWith(
      'sbx_live',
      expect.objectContaining({ apiKey: 'k', timeoutMs: 30 * 60_000 }),
    )
  })

  it('returns null for a killed or expired sandbox', async () => {
    connectMock.mockRejectedValue(new MockNotFound('Sandbox not found'))
    expect(await e2bSandbox().resume({ id: 'gone' })).toBeNull()
  })

  // A 401 or a transport error is NOT "gone". Reporting it as null sends
  // `ensure()` down the create path and silently duplicates a live sandbox.
  it('rethrows anything that is not a not-found error', async () => {
    connectMock.mockRejectedValue(new Error('401: Invalid API key'))
    await expect(e2bSandbox().resume({ id: 'sbx_live' })).rejects.toThrow(
      'Invalid API key',
    )
  })
})

describe('e2bSandbox destroy', () => {
  it('kills by id and treats an already-gone sandbox as success', async () => {
    killMock.mockResolvedValue(false)
    await expect(
      e2bSandbox({ apiKey: 'k' }).destroy({ id: 'sbx_gone' }),
    ).resolves.toBeUndefined()
    expect(killMock).toHaveBeenCalledWith(
      'sbx_gone',
      expect.objectContaining({ apiKey: 'k' }),
    )
  })

  it('rethrows a failed kill instead of reporting success', async () => {
    killMock.mockRejectedValue(new Error('401: Invalid API key'))
    await expect(e2bSandbox().destroy({ id: 'sbx_live' })).rejects.toThrow(
      'Invalid API key',
    )
  })
})

describe('e2bSandbox identity', () => {
  it('reports the provider name and capabilities', () => {
    const provider = e2bSandbox()
    expect(provider.name).toBe('e2b')
    expect(provider.capabilities().snapshots).toBe(true)
    expect(typeof provider.restoreSnapshot).toBe('function')
  })
})
