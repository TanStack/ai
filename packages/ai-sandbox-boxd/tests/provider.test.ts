/**
 * Provider tests against a mocked `@boxd-sh/sdk` client. The status cases are
 * the ones that matter: a deleted machine still `get`s (as `destroyed`), a
 * stopped one must be started before its readiness probe can pass, and a
 * hibernated one is woken explicitly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundError } from '@boxd-sh/sdk'
import { boxdSandbox } from '../src/index'

const { machines, snapshots, ctorArgs } = vi.hoisted(() => ({
  machines: {
    create: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    wake: vi.fn(),
    resume: vi.fn(),
    fork: vi.fn(),
    exec: vi.fn(),
    streamExec: vi.fn(),
    waitUntilReady: vi.fn(),
    files: { upload: vi.fn(), download: vi.fn() },
    proxies: { create: vi.fn(), list: vi.fn(), setPort: vi.fn() },
  },
  snapshots: { create: vi.fn(), get: vi.fn() },
  ctorArgs: [] as Array<unknown>,
}))

vi.mock('@boxd-sh/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@boxd-sh/sdk')>()
  class Boxd {
    machines = machines
    snapshots = snapshots
    constructor(opts: unknown) {
      ctorArgs.push(opts)
    }
  }
  return { ...actual, Boxd }
})

function machine(
  over: Partial<{ id: string; name: string; status: string }> = {},
) {
  return {
    id: over.id ?? 'vm-1',
    name: over.name ?? 'm',
    status: over.status ?? 'running',
    access: { url: `https://${over.name ?? 'm'}.boxd.sh` },
  }
}

const ok = { stdout: '', stderr: '', exitCode: 0, success: true }

beforeEach(() => {
  for (const fn of Object.values(machines))
    if (typeof fn === 'function') fn.mockReset()
  machines.create.mockImplementation(async (p: { name?: string }) =>
    machine({ name: p.name, status: 'pending' }),
  )
  machines.waitUntilReady.mockImplementation(async (id: string) =>
    machine({ id }),
  )
  machines.exec.mockResolvedValue(ok)
  machines.delete.mockResolvedValue(undefined)
  ctorArgs.length = 0
  delete process.env.BOXD_ORG
})
afterEach(() => {
  delete process.env.BOXD_ORG
})

describe('boxdSandbox provider: create', () => {
  it('creates an isolated machine named after the deterministic id, in the org, at the requested size', async () => {
    const handle = await boxdSandbox({
      apiKey: 'k',
      org: 'acme',
      vcpu: 4,
    }).create({
      id: 'thread-key-1',
      env: { TOKEN: 't' },
    })
    expect(machines.create).toHaveBeenCalledWith({
      name: 'tanstack-ai-thread-key-1',
      isolated: true,
      org: 'acme',
      config: { vcpu: 4 },
    })
    // create() returns as soon as the machine is scheduled; exec works only after this.
    expect(machines.waitUntilReady).toHaveBeenCalledWith('vm-1')
    // The workdir is made from `/`, because the handle cd's into cwd first.
    const [, mkdir] = machines.exec.mock.calls[0] as [
      string,
      { command: Array<string>; env: Record<string, string> },
    ]
    expect(mkdir.command[2]).toBe(`cd '/' && mkdir -p '/home/boxd/workspace'`)
    expect(mkdir.env).toEqual({ TOKEN: 't' })
    expect(handle.id).toBe('vm-1')
    expect(handle.provider).toBe('boxd')
  })

  it('isolation is not a config option: it is always on', async () => {
    await boxdSandbox({ apiKey: 'k' }).create({})
    expect(machines.create.mock.calls[0]?.[0]).toMatchObject({ isolated: true })
  })

  it('folds a deterministic id into a valid machine name', async () => {
    // boxd names must start with a lowercase letter; the framework key is hex.
    await boxdSandbox({ apiKey: 'k' }).create({ id: '3f9A_c/1' })
    expect(machines.create.mock.calls[0]?.[0]).toMatchObject({
      name: 'tanstack-ai-3f9a-c-1',
    })
  })

  it('mints a prefixed random name and omits org/config when nothing is configured', async () => {
    await boxdSandbox({ apiKey: 'k' }).create({})
    const params = machines.create.mock.calls[0]?.[0] as { name: string }
    expect(params.name).toMatch(/^tanstack-ai-[0-9a-f]{12}$/)
    expect(params).not.toHaveProperty('org')
    expect(params).not.toHaveProperty('config')
  })

  it('boots from the configured snapshot without per-request sizing, keeping the idle timers', async () => {
    await boxdSandbox({
      apiKey: 'k',
      fromSnapshot: 'golden',
      vcpu: 2,
      autoSuspendTimeout: 0,
      autoDestroyTimeout: 3600,
    }).create({})
    expect(machines.create).toHaveBeenCalledWith({
      name: expect.stringMatching(/^tanstack-ai-/),
      isolated: true,
      fromSnapshot: 'golden',
      config: { autoSuspendTimeout: 0, autoDestroyTimeout: 3600 },
    })
  })

  it('deletes the machine when the signal aborts while create is in flight', async () => {
    const controller = new AbortController()
    machines.create.mockImplementation(async () => {
      controller.abort()
      return machine()
    })
    await expect(
      boxdSandbox({ apiKey: 'k' }).create({ signal: controller.signal }),
    ).rejects.toThrow()
    expect(machines.delete).toHaveBeenCalledWith('vm-1')
  })

  it('deletes the machine when it never becomes ready', async () => {
    machines.waitUntilReady.mockRejectedValue(new Error('timeout'))
    await expect(boxdSandbox({ apiKey: 'k' }).create({})).rejects.toThrow(
      'timeout',
    )
    expect(machines.delete).toHaveBeenCalledWith('vm-1')
  })

  it('deletes the machine when the workdir cannot be created', async () => {
    machines.exec.mockResolvedValue({
      ...ok,
      exitCode: 1,
      stderr: 'read-only',
      success: false,
    })
    await expect(
      boxdSandbox({ apiKey: 'k', workdir: '/mnt/ro/ws' }).create({}),
    ).rejects.toThrow('/mnt/ro/ws')
    expect(machines.delete).toHaveBeenCalledWith('vm-1')
  })
})

describe('boxdSandbox provider: resume', () => {
  it('resumes a running machine without touching it', async () => {
    machines.get.mockResolvedValue(machine({ status: 'running' }))
    const handle = await boxdSandbox({ apiKey: 'k' }).resume({ id: 'vm-1' })
    expect(handle?.id).toBe('vm-1')
    expect(machines.start).not.toHaveBeenCalled()
    expect(machines.waitUntilReady).not.toHaveBeenCalled()
  })

  it('resumes a DELETED machine as null even though get resolves', async () => {
    // The exact prod shape: the record still fetches, with status "destroyed".
    machines.get.mockResolvedValue(machine({ status: 'destroyed' }))
    expect(await boxdSandbox({ apiKey: 'k' }).resume({ id: 'vm-1' })).toBeNull()
  })

  it('resumes a missing machine as null', async () => {
    machines.get.mockRejectedValue(new NotFoundError('VM not found', 5))
    expect(await boxdSandbox({ apiKey: 'k' }).resume({ id: 'nope' })).toBeNull()
  })

  it('rethrows a non-404 from resume instead of reporting gone', async () => {
    machines.get.mockRejectedValue(new Error('unavailable'))
    await expect(
      boxdSandbox({ apiKey: 'k' }).resume({ id: 'vm-1' }),
    ).rejects.toThrow('unavailable')
  })

  it.each(['stopped', 'failed'])(
    'starts a %s machine and waits for it',
    async (status) => {
      machines.get.mockResolvedValue(machine({ status }))
      const handle = await boxdSandbox({ apiKey: 'k' }).resume({ id: 'vm-1' })
      expect(machines.start).toHaveBeenCalledWith('vm-1')
      expect(machines.waitUntilReady).toHaveBeenCalledWith('vm-1')
      expect(handle?.id).toBe('vm-1')
    },
  )

  it('wakes a hibernated machine explicitly, then waits for it', async () => {
    machines.get.mockResolvedValue(machine({ status: 'hibernated' }))
    await boxdSandbox({ apiKey: 'k' }).resume({ id: 'vm-1' })
    expect(machines.wake).toHaveBeenCalledWith('vm-1')
    expect(machines.start).not.toHaveBeenCalled()
    expect(machines.waitUntilReady).toHaveBeenCalledWith('vm-1')
  })

  it('resumes a suspended machine explicitly, then waits for it', async () => {
    machines.get.mockResolvedValue(machine({ status: 'suspended' }))
    await boxdSandbox({ apiKey: 'k' }).resume({ id: 'vm-1' })
    expect(machines.resume).toHaveBeenCalledWith('vm-1')
    expect(machines.wake).not.toHaveBeenCalled()
    expect(machines.start).not.toHaveBeenCalled()
    expect(machines.waitUntilReady).toHaveBeenCalledWith('vm-1')
  })
})

describe('boxdSandbox provider: restoreSnapshot / destroy / config', () => {
  it('restoreSnapshot boots a new isolated machine from the snapshot and injects env', async () => {
    const provider = boxdSandbox({ apiKey: 'k', org: 'acme', vcpu: 1 })
    const handle = await provider.restoreSnapshot!({
      snapshotId: 'm-after-setup',
      env: { A: '1' },
    })
    expect(machines.create).toHaveBeenCalledWith({
      name: expect.stringMatching(/^tanstack-ai-[0-9a-f]{12}$/),
      isolated: true,
      org: 'acme',
      fromSnapshot: 'm-after-setup',
    })
    expect(machines.waitUntilReady).toHaveBeenCalledWith('vm-1')
    expect(handle.id).toBe('vm-1')
    const [, mkdir] = machines.exec.mock.calls[0] as [
      string,
      { env: Record<string, string> },
    ]
    expect(mkdir.env).toEqual({ A: '1' })
  })

  it('destroy swallows an already-deleted machine and rethrows anything else', async () => {
    machines.delete.mockRejectedValueOnce(new NotFoundError('VM not found', 5))
    await expect(
      boxdSandbox({ apiKey: 'k' }).destroy({ id: 'vm-1' }),
    ).resolves.toBeUndefined()
    machines.delete.mockRejectedValueOnce(new Error('permission denied'))
    await expect(
      boxdSandbox({ apiKey: 'k' }).destroy({ id: 'vm-1' }),
    ).rejects.toThrow('permission denied')
  })

  it('forwards apiKey and baseUrl to the SDK and reads the org from BOXD_ORG', async () => {
    process.env.BOXD_ORG = 'env-org'
    await boxdSandbox({
      apiKey: 'bxd_x',
      baseUrl: 'https://boxd-stg.sh:9443',
    }).create({})
    expect(ctorArgs[0]).toEqual({
      apiKey: 'bxd_x',
      baseURL: 'https://boxd-stg.sh:9443',
    })
    expect(machines.create.mock.calls[0]?.[0]).toMatchObject({ org: 'env-org' })
  })

  it('leaves credentials to the SDK when none are configured', () => {
    boxdSandbox()
    expect(ctorArgs[0]).toEqual({})
  })

  it('reports the provider name and capabilities', () => {
    const provider = boxdSandbox({ apiKey: 'k' })
    expect(provider.name).toBe('boxd')
    expect(provider.capabilities()).toMatchObject({
      fork: true,
      snapshots: true,
      killableProcesses: true,
      writableStdin: true,
    })
    expect(provider.restoreSnapshot).toBeTypeOf('function')
  })
})
