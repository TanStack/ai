/**
 * Provider tests against a mocked `@upstash/box`. The tombstone case is the one
 * that matters: `Box.get` RESOLVES for a deleted box, so only `getStatus`
 * distinguishes it and `ensure()` would otherwise reuse a dead sandbox.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { upstashBoxSandbox } from '../src/index'

const { getMock, createMock, fromSnapshotMock, MockBoxError } = vi.hoisted(
  () => {
    class MockBoxError extends Error {
      constructor(
        message: string,
        readonly statusCode?: number,
      ) {
        super(message)
      }
    }
    return {
      getMock: vi.fn(),
      createMock: vi.fn(),
      fromSnapshotMock: vi.fn(),
      MockBoxError,
    }
  },
)

vi.mock('@upstash/box', () => ({
  Box: { get: getMock, create: createMock, fromSnapshot: fromSnapshotMock },
  BoxError: MockBoxError,
}))

/** The API answers 404 for both a missing and a deleted box. */
const gone = (msg = 'Box not found') => new MockBoxError(msg, 404)

/** A box stub whose `getStatus` outcome the test chooses. */
function boxStub(
  opts: {
    id?: string
    getStatus?: () => Promise<unknown>
    networkPolicy?: unknown
  } = {},
) {
  return {
    id: opts.id ?? 'box_123',
    getStatus: vi.fn(opts.getStatus ?? (async () => ({ status: 'idle' }))),
    delete: vi.fn(async () => {}),
    exec: { command: vi.fn(), session: vi.fn() },
    files: {},
    networkPolicy: opts.networkPolicy,
    snapshot: vi.fn(async () => ({ id: 'snap_1' })),
    deleteSnapshot: vi.fn(async () => {}),
  }
}

beforeEach(() => {
  getMock.mockReset()
  createMock.mockReset()
  fromSnapshotMock.mockReset()
})

describe('upstashBoxSandbox provider', () => {
  it('resumes a live box into a handle', async () => {
    getMock.mockResolvedValue(boxStub())
    const handle = await upstashBoxSandbox({ apiKey: 'k' }).resume({
      id: 'box_123',
    })
    expect(handle).not.toBeNull()
    expect(handle!.id).toBe('box_123')
  })

  it('resumes a DELETED box as null even though Box.get resolves', async () => {
    // The exact prod shape: the record still fetches, the status probe 404s.
    const tombstone = boxStub({
      getStatus: async () => {
        throw gone('Box has been deleted')
      },
    })
    getMock.mockResolvedValue(tombstone)
    const handle = await upstashBoxSandbox({ apiKey: 'k' }).resume({
      id: 'box_123',
    })
    expect(handle).toBeNull()
    expect(tombstone.getStatus).toHaveBeenCalledOnce()
  })

  it('resumes a missing box as null when Box.get itself throws', async () => {
    getMock.mockRejectedValue(gone())
    const handle = await upstashBoxSandbox({ apiKey: 'k' }).resume({
      id: 'nope',
    })
    expect(handle).toBeNull()
  })

  // A 401 or a transport error is NOT "gone". Reporting it as null sends
  // `ensure()` down the create path and silently duplicates a live box.
  it('rethrows a non-404 from resume instead of reporting gone', async () => {
    getMock.mockRejectedValue(new MockBoxError('Invalid box API key', 401))
    await expect(
      upstashBoxSandbox({ apiKey: 'bad' }).resume({ id: 'box_123' }),
    ).rejects.toThrow('Invalid box API key')
  })

  it('rethrows a non-404 from destroy instead of reporting success', async () => {
    getMock.mockRejectedValue(new MockBoxError('Invalid box API key', 401))
    await expect(
      upstashBoxSandbox({ apiKey: 'bad' }).destroy({ id: 'box_123' }),
    ).rejects.toThrow('Invalid box API key')
  })

  it('passes the deterministic id through as the box name on create', async () => {
    createMock.mockResolvedValue(boxStub({ id: 'agent-1' }))
    await upstashBoxSandbox({ apiKey: 'k' }).create({
      id: 'agent-1',
      env: { A: 'b' },
    })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'agent-1',
        env: { A: 'b' },
        runtime: 'node',
        keepAlive: false,
      }),
    )
  })

  it('routes create through fromSnapshot when a base snapshot is configured', async () => {
    fromSnapshotMock.mockResolvedValue(boxStub())
    await upstashBoxSandbox({ apiKey: 'k', snapshot: 'snap_1' }).create({})
    expect(fromSnapshotMock).toHaveBeenCalledWith('snap_1', expect.any(Object))
    expect(createMock).not.toHaveBeenCalled()
  })

  it('destroy swallows an already-deleted box', async () => {
    getMock.mockRejectedValue(gone('Box has been deleted'))
    await expect(
      upstashBoxSandbox({ apiKey: 'k' }).destroy({ id: 'box_123' }),
    ).resolves.toBeUndefined()
  })

  it('maps a deny network policy onto Box deny-all egress', async () => {
    createMock.mockResolvedValue(boxStub())
    await upstashBoxSandbox({ apiKey: 'k' }).create({
      policy: { capabilities: { network: 'deny' } },
    })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ networkPolicy: { mode: 'deny-all' } }),
    )
  })

  it('carries a deny network policy through restoreSnapshot too', async () => {
    fromSnapshotMock.mockResolvedValue(boxStub())
    // restoreSnapshot is optional on the contract; this provider implements it.
    await upstashBoxSandbox({ apiKey: 'k' }).restoreSnapshot!({
      snapshotId: 'snap_1',
      policy: { capabilities: { network: 'deny' } },
    })
    expect(fromSnapshotMock).toHaveBeenCalledWith(
      'snap_1',
      expect.objectContaining({ networkPolicy: { mode: 'deny-all' } }),
    )
  })

  it('leaves egress unset for allow/ask, which Box defaults to open', async () => {
    createMock.mockResolvedValue(boxStub())
    await upstashBoxSandbox({ apiKey: 'k' }).create({
      policy: { capabilities: { network: 'allow' } },
    })
    expect(createMock.mock.calls[0]?.[0]).not.toHaveProperty('networkPolicy')
  })

  // The SDK cannot cancel an in-flight create, so an abort that lands after the
  // box exists must delete it rather than leave a billed box with no owner.
  it('deletes the box when the signal aborts during create', async () => {
    const stub = boxStub()
    const controller = new AbortController()
    // Abort lands WHILE create is in flight, the case the pre-flight check misses.
    createMock.mockImplementation(async () => {
      controller.abort()
      return stub
    })
    await expect(
      upstashBoxSandbox({ apiKey: 'k' }).create({ signal: controller.signal }),
    ).rejects.toThrow()
    expect(stub.delete).toHaveBeenCalledOnce()
  })

  it('reports the provider name and capabilities', () => {
    const provider = upstashBoxSandbox({ apiKey: 'k' })
    expect(provider.name).toBe('upstash-box')
    const caps = provider.capabilities()
    expect(caps.writableStdin).toBe(true)
    expect(caps.killableProcesses).toBe(true)
    expect(caps.networkPolicy).toBe(true)
    expect(caps.fork).toBe(true)
  })
})

describe('resumed handles keep their sandbox boundary', () => {
  it('forks a resumed deny-all box as deny-all, and cleans up the snapshot', async () => {
    const resumed = boxStub({ networkPolicy: { mode: 'deny-all' } })
    getMock.mockResolvedValue(resumed)
    const child = boxStub({ id: 'box_child' })
    fromSnapshotMock.mockResolvedValue(child)

    const provider = upstashBoxSandbox({ apiKey: 'box_test' })
    const handle = await provider.resume({ id: 'box_123' })
    if (handle?.fork === undefined)
      throw new Error('resume did not return a forkable handle')
    await handle.fork()

    // A snapshot does not carry the parent's policy, so the resumed handle has
    // to supply it or a deny-all box comes back open one fork later.
    const [, forkConfig] = fromSnapshotMock.mock.calls[0] as [
      string,
      { networkPolicy?: unknown },
    ]
    expect(forkConfig.networkPolicy).toEqual({ mode: 'deny-all' })
    // The snapshot is scratch for the copy; keeping it bills storage per fork.
    expect(resumed.deleteSnapshot).toHaveBeenCalledWith('snap_1')
  })

  it('deletes the fork snapshot even when the child never starts', async () => {
    const resumed = boxStub({ networkPolicy: { mode: 'deny-all' } })
    getMock.mockResolvedValue(resumed)
    fromSnapshotMock.mockRejectedValue(new Error('capacity'))

    const provider = upstashBoxSandbox({ apiKey: 'box_test' })
    const handle = await provider.resume({ id: 'box_123' })
    if (handle?.fork === undefined)
      throw new Error('resume did not return a forkable handle')
    await expect(handle.fork()).rejects.toThrow(/capacity/)
    expect(resumed.deleteSnapshot).toHaveBeenCalledWith('snap_1')
  })
})
