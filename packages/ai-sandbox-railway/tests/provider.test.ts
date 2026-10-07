/**
 * Provider tests against a mocked `railway`. The cases that matter most: a
 * missing or terminal sandbox resumes as `null` (so `ensure()` re-creates),
 * anything else surfaces (so `ensure()` does not duplicate a live sandbox), an
 * abort that lands mid-create destroys what was just made, and the network
 * shape (ports require PRIVATE) is explicit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnsupportedCapabilityError } from '@tanstack/ai-sandbox'
import { railwaySandbox } from '../src/index'
import { fakeSandbox } from './fakes'

const {
  createMock,
  connectMock,
  MockSandbox,
  MockNotFound,
  MockTimeout,
  MockFailed,
} = vi.hoisted(() => {
  class MockNotFound extends Error {}
  class MockTimeout extends Error {
    constructor(
      readonly id: string,
      readonly resource: 'sandbox' | 'template' = 'sandbox',
    ) {
      super(`sandbox ${id} not ready`)
    }
  }
  class MockFailed extends Error {
    constructor(readonly id: string) {
      super(`sandbox ${id} failed`)
    }
  }
  const createMock = vi.fn()
  const connectMock = vi.fn()
  class MockSandbox {
    static create = createMock
    static connect = connectMock
  }
  return {
    createMock,
    connectMock,
    MockSandbox,
    MockNotFound,
    MockTimeout,
    MockFailed,
  }
})

vi.mock('railway', () => ({
  Sandbox: MockSandbox,
  SandboxNotFoundError: MockNotFound,
  SandboxTimeoutError: MockTimeout,
  SandboxFailedError: MockFailed,
}))

beforeEach(() => {
  createMock.mockReset()
  connectMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  delete (MockSandbox.prototype as Record<string, unknown>).heartbeat
})

describe('railwaySandbox config', () => {
  it('requires PRIVATE networking when ports are configured', () => {
    expect(() => railwaySandbox({ ports: [3000] })).toThrow(/PRIVATE/)
    expect(() =>
      railwaySandbox({ ports: [3000], networkIsolation: 'ISOLATED' }),
    ).toThrow(/PRIVATE/)
    expect(() =>
      railwaySandbox({ ports: [3000], networkIsolation: 'PRIVATE' }),
    ).not.toThrow()
  })

  it('accepts only an https endpoint, or http on localhost', () => {
    expect(() =>
      railwaySandbox({ endpoint: 'http://backboard.example.com/graphql/v2' }),
    ).toThrow(/https/)
    expect(() => railwaySandbox({ endpoint: 'not a url' })).toThrow(/invalid/)
    expect(() =>
      railwaySandbox({ endpoint: 'https://backboard.railway.com/graphql/v2' }),
    ).not.toThrow()
    expect(() =>
      railwaySandbox({ endpoint: 'http://localhost:4000/graphql/v2' }),
    ).not.toThrow()
  })

  it('validates ports', () => {
    const base = { networkIsolation: 'PRIVATE' as const }
    expect(() => railwaySandbox({ ...base, ports: [0] })).toThrow(/invalid/)
    expect(() => railwaySandbox({ ...base, ports: [70000] })).toThrow(/invalid/)
    expect(() => railwaySandbox({ ...base, ports: [1.5] })).toThrow(/invalid/)
    expect(() => railwaySandbox({ ...base, ports: [3000, 3000] })).toThrow(
      /unique/,
    )
    expect(() =>
      railwaySandbox({
        ...base,
        ports: Array.from({ length: 11 }, (_, i) => 3000 + i),
      }),
    ).toThrow(/at most 10/)
  })

  it('rejects checkpoint and template together', () => {
    expect(() =>
      railwaySandbox({ checkpoint: 'c', template: {} as never }),
    ).toThrow(/either checkpoint or template/)
  })

  it('reports capabilities from config', () => {
    const plain = railwaySandbox()
    expect(plain.name).toBe('railway')
    expect(plain.capabilities()).toMatchObject({
      ports: false,
      writableStdin: true,
      killableProcesses: true,
      snapshots: true,
      fork: true,
      networkPolicy: false,
      durableFilesystem: false,
    })
    expect(typeof plain.restoreSnapshot).toBe('function')
    expect(
      railwaySandbox({
        ports: [3000],
        networkIsolation: 'PRIVATE',
      }).capabilities().ports,
    ).toBe(true)
  })
})

describe('railwaySandbox create', () => {
  it('creates with config + env, prepares /workspace, and ignores input.id', async () => {
    const { sandbox } = fakeSandbox({ id: 'sbx_new' })
    createMock.mockResolvedValue(sandbox)
    const handle = await railwaySandbox({
      token: 't',
      authType: 'project-token',
      environmentId: 'env_1',
      region: 'us-west2',
      idleTimeoutMinutes: 30,
      networkIsolation: 'PRIVATE',
      ports: [3000],
    }).create({ id: 'thread-1', env: { A: 'b' } })
    expect(handle.id).toBe('sbx_new')
    expect(handle.workspaceRoot).toBe('/workspace')
    expect(createMock).toHaveBeenCalledWith({
      token: 't',
      authType: 'project-token',
      environmentId: 'env_1',
      region: 'us-west2',
      idleTimeoutMinutes: 30,
      networkIsolation: 'PRIVATE',
      domains: [{ port: 3000 }],
      env: { A: 'b' },
    })
    expect(sandbox.files.mkdir).toHaveBeenCalledWith('/workspace')
    expect(handle.capabilities.ports).toBe(true)
  })

  it('defaults to Railway defaults: no isolation override, no domains, no empty env', async () => {
    createMock.mockResolvedValue(fakeSandbox().sandbox)
    await railwaySandbox().create({ env: {} })
    expect(createMock).toHaveBeenCalledWith({})
  })

  it('boots from a configured checkpoint or template', async () => {
    createMock.mockResolvedValue(fakeSandbox().sandbox)
    await railwaySandbox({ checkpoint: 'base-ckpt' }).create({})
    expect(createMock).toHaveBeenLastCalledWith('base-ckpt', {})
    const template = { run: vi.fn() }
    await railwaySandbox({ template: template as never }).create({})
    expect(createMock).toHaveBeenLastCalledWith(template, {})
  })

  it('uses a custom workdir', async () => {
    const { sandbox } = fakeSandbox()
    createMock.mockResolvedValue(sandbox)
    const handle = await railwaySandbox({ workdir: '/app' }).create({})
    expect(sandbox.files.mkdir).toHaveBeenCalledWith('/app')
    expect(handle.workspaceRoot).toBe('/app')
  })

  it('refuses an explicit network deny policy it cannot enforce', async () => {
    await expect(
      railwaySandbox().create({
        policy: { capabilities: { network: 'deny' } },
      }),
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('rejects before creating when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      railwaySandbox().create({ signal: controller.signal }),
    ).rejects.toThrow()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('destroys the sandbox when the signal aborts during create', async () => {
    const { sandbox } = fakeSandbox()
    const controller = new AbortController()
    createMock.mockImplementation(async () => {
      controller.abort()
      return sandbox
    })
    await expect(
      railwaySandbox().create({ signal: controller.signal }),
    ).rejects.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(sandbox.destroy).toHaveBeenCalledOnce()
  })

  it('rejects promptly while create is pending and destroys the late sandbox', async () => {
    const { sandbox } = fakeSandbox()
    let settle!: (s: typeof sandbox) => void
    createMock.mockReturnValue(new Promise((r) => (settle = r)))
    const controller = new AbortController()
    const pending = railwaySandbox().create({ signal: controller.signal })
    controller.abort(new Error('caller gave up'))
    await expect(pending).rejects.toThrow('caller gave up')
    expect(sandbox.destroy).not.toHaveBeenCalled()
    settle(sandbox)
    await new Promise((r) => setTimeout(r, 0))
    expect(sandbox.destroy).toHaveBeenCalledOnce()
  })

  it('destroys the sandbox when preparing the workdir fails', async () => {
    const { sandbox } = fakeSandbox()
    sandbox.files.mkdir.mockRejectedValue(new Error('disk full'))
    createMock.mockResolvedValue(sandbox)
    await expect(railwaySandbox().create({})).rejects.toThrow('disk full')
    expect(sandbox.destroy).toHaveBeenCalledOnce()
  })

  it('destroys the sandbox when the signal aborts while the workdir is prepared', async () => {
    const { sandbox } = fakeSandbox()
    const controller = new AbortController()
    sandbox.files.mkdir.mockImplementation(async () => {
      controller.abort()
    })
    createMock.mockResolvedValue(sandbox)
    await expect(
      railwaySandbox().create({ signal: controller.signal }),
    ).rejects.toThrow()
    expect(sandbox.destroy).toHaveBeenCalledOnce()
  })

  it('surfaces SDK create failures', async () => {
    createMock.mockRejectedValue(new Error('quota exceeded'))
    await expect(railwaySandbox().create({})).rejects.toThrow('quota exceeded')
  })

  it.each([
    ['times out waiting for RUNNING', () => new MockTimeout('sbx_slow')],
    ['reports the sandbox FAILED', () => new MockFailed('sbx_slow')],
  ])('destroys a minted sandbox when the SDK %s', async (_label, error) => {
    const stranded = fakeSandbox({ id: 'sbx_slow' }).sandbox
    createMock.mockRejectedValue(error())
    connectMock.mockResolvedValue(stranded)
    await expect(railwaySandbox().create({})).rejects.toThrow('sbx_slow')
    expect(connectMock).toHaveBeenCalledWith('sbx_slow', {})
    expect(stranded.destroy).toHaveBeenCalledOnce()
  })

  it('sends no region when booting a checkpoint or template', async () => {
    createMock.mockResolvedValue(fakeSandbox().sandbox)
    await railwaySandbox({
      region: 'us-east4-eqdc4a',
      checkpoint: 'golden',
    }).create({})
    expect(createMock.mock.calls[0]![1]).not.toHaveProperty('region')
    createMock.mockClear()
    await railwaySandbox({ region: 'us-east4-eqdc4a' }).create({})
    expect(createMock.mock.calls[0]![0]).toMatchObject({
      region: 'us-east4-eqdc4a',
    })
  })
})

describe('railwaySandbox restoreSnapshot', () => {
  it('boots a new sandbox from the checkpoint name and reapplies config + env', async () => {
    const { sandbox } = fakeSandbox({ id: 'sbx_restored' })
    createMock.mockResolvedValue(sandbox)
    const handle = await railwaySandbox({
      environmentId: 'env_1',
      networkIsolation: 'PRIVATE',
      ports: [3000],
      idleTimeoutMinutes: 10,
    }).restoreSnapshot!({
      snapshotId: 'tsai-sbx_old-1234',
      env: { SECRET: 's' },
    })
    expect(handle.id).toBe('sbx_restored')
    expect(createMock).toHaveBeenCalledWith('tsai-sbx_old-1234', {
      environmentId: 'env_1',
      networkIsolation: 'PRIVATE',
      domains: [{ port: 3000 }],
      idleTimeoutMinutes: 10,
      env: { SECRET: 's' },
    })
    expect(sandbox.files.mkdir).toHaveBeenCalledWith('/workspace')
  })

  it('applies the same abort handling', async () => {
    createMock.mockReturnValue(new Promise(() => {}))
    const controller = new AbortController()
    const pending = railwaySandbox().restoreSnapshot!({
      snapshotId: 'snap',
      signal: controller.signal,
    })
    controller.abort()
    await expect(pending).rejects.toThrow()
  })
})

describe('railwaySandbox resume', () => {
  it('connects by id with the frozen client config', async () => {
    connectMock.mockResolvedValue(fakeSandbox({ id: 'sbx_live' }).sandbox)
    const handle = await railwaySandbox({
      token: 't',
      environmentId: 'env_1',
    }).resume({ id: 'sbx_live' })
    expect(handle?.id).toBe('sbx_live')
    expect(connectMock).toHaveBeenCalledWith('sbx_live', {
      token: 't',
      environmentId: 'env_1',
    })
  })

  it('heartbeats a resumed sandbox so it is not reaped right away', async () => {
    const { sandbox } = fakeSandbox({ id: 'sbx_live' })
    connectMock.mockResolvedValue(sandbox)
    await railwaySandbox().resume({ id: 'sbx_live' })
    expect(sandbox.heartbeat).toHaveBeenCalledOnce()
  })

  it('returns null when the heartbeat finds the sandbox gone', async () => {
    const { sandbox } = fakeSandbox({ id: 'sbx_live' })
    sandbox.heartbeat.mockRejectedValue(new MockNotFound('gone'))
    connectMock.mockResolvedValue(sandbox)
    expect(await railwaySandbox().resume({ id: 'sbx_live' })).toBeNull()
  })

  it('returns null for a missing sandbox', async () => {
    connectMock.mockRejectedValue(new MockNotFound('not found'))
    expect(await railwaySandbox().resume({ id: 'gone' })).toBeNull()
  })

  it.each(['DESTROYED', 'DESTROYING', 'FAILED'])(
    'returns null for a %s tombstone',
    async (status) => {
      connectMock.mockResolvedValue(fakeSandbox({ status }).sandbox)
      expect(await railwaySandbox().resume({ id: 'x' })).toBeNull()
    },
  )

  // A 401 or a transport error is NOT "gone". Reporting it as null sends
  // `ensure()` down the create path and silently duplicates a live sandbox.
  it('rethrows anything that is not a not-found error', async () => {
    connectMock.mockRejectedValue(new Error('401 Unauthorized'))
    await expect(railwaySandbox().resume({ id: 'x' })).rejects.toThrow('401')
  })

  it('waits for a CREATING sandbox to reach RUNNING', async () => {
    vi.useFakeTimers()
    const { sandbox } = fakeSandbox({ status: 'CREATING' })
    sandbox.refresh.mockImplementation(async () => {
      sandbox.status = 'RUNNING'
      return sandbox
    })
    connectMock.mockResolvedValue(sandbox)
    const pending = railwaySandbox().resume({ id: 'sbx_123' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect((await pending)?.id).toBe('sbx_123')
  })

  it('returns null when a CREATING sandbox fails', async () => {
    vi.useFakeTimers()
    const { sandbox } = fakeSandbox({ status: 'CREATING' })
    sandbox.refresh.mockImplementation(async () => {
      sandbox.status = 'FAILED'
      return sandbox
    })
    connectMock.mockResolvedValue(sandbox)
    const pending = railwaySandbox().resume({ id: 'sbx_123' })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await pending).toBeNull()
  })

  it('gives up on a sandbox stuck CREATING', async () => {
    vi.useFakeTimers()
    connectMock.mockResolvedValue(fakeSandbox({ status: 'CREATING' }).sandbox)
    const pending = railwaySandbox().resume({ id: 'sbx_123' })
    const assertion = expect(pending).rejects.toThrow(/still CREATING/)
    await vi.advanceTimersByTimeAsync(61_000)
    await assertion
  })
})

describe('railwaySandbox destroy', () => {
  it('connects and destroys', async () => {
    const { sandbox } = fakeSandbox()
    connectMock.mockResolvedValue(sandbox)
    await railwaySandbox({ token: 't' }).destroy({ id: 'sbx_123' })
    expect(connectMock).toHaveBeenCalledWith('sbx_123', { token: 't' })
    expect(sandbox.destroy).toHaveBeenCalledOnce()
  })

  it('treats a missing sandbox as success', async () => {
    connectMock.mockRejectedValue(new MockNotFound('gone'))
    await expect(
      railwaySandbox().destroy({ id: 'gone' }),
    ).resolves.toBeUndefined()
  })

  it.each(['DESTROYED', 'DESTROYING'])(
    'does not re-destroy a %s sandbox',
    async (status) => {
      const { sandbox } = fakeSandbox({ status })
      connectMock.mockResolvedValue(sandbox)
      await railwaySandbox().destroy({ id: 'x' })
      expect(sandbox.destroy).not.toHaveBeenCalled()
    },
  )

  it('treats a not-found destroy race as success', async () => {
    const { sandbox } = fakeSandbox()
    sandbox.destroy.mockRejectedValue(new MockNotFound('gone'))
    connectMock.mockResolvedValue(sandbox)
    await expect(railwaySandbox().destroy({ id: 'x' })).resolves.toBeUndefined()
  })

  it('rethrows a failed destroy instead of reporting success', async () => {
    const { sandbox } = fakeSandbox()
    sandbox.destroy.mockRejectedValue(new Error('403 Forbidden'))
    connectMock.mockResolvedValue(sandbox)
    await expect(railwaySandbox().destroy({ id: 'x' })).rejects.toThrow('403')
  })

  it('rejects an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      railwaySandbox().destroy({ id: 'x', signal: controller.signal }),
    ).rejects.toThrow()
    expect(connectMock).not.toHaveBeenCalled()
  })
})
