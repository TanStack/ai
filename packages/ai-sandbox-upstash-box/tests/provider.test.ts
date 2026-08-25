/**
 * Provider tests against a mocked `@upstash/box`. The tombstone case is the one
 * that matters: `Box.get` RESOLVES for a deleted box, so only `getStatus`
 * distinguishes it and `ensure()` would otherwise reuse a dead sandbox.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { upstashBoxSandbox } from '../src/index'

const { getMock, createMock, fromSnapshotMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  createMock: vi.fn(),
  fromSnapshotMock: vi.fn(),
}))

vi.mock('@upstash/box', () => ({
  Box: { get: getMock, create: createMock, fromSnapshot: fromSnapshotMock },
}))

/** A box stub whose `getStatus` outcome the test chooses. */
function boxStub(opts: { id?: string; getStatus?: () => Promise<unknown> } = {}) {
  return {
    id: opts.id ?? 'box_123',
    getStatus: vi.fn(opts.getStatus ?? (async () => ({ status: 'idle' }))),
    delete: vi.fn(async () => {}),
    exec: { command: vi.fn(), session: vi.fn() },
    files: {},
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
    const handle = await upstashBoxSandbox({ apiKey: 'k' }).resume({ id: 'box_123' })
    expect(handle).not.toBeNull()
    expect(handle!.id).toBe('box_123')
  })

  it('resumes a DELETED box as null even though Box.get resolves', async () => {
    // The exact prod shape: the record still fetches, the status probe 404s.
    const tombstone = boxStub({
      getStatus: async () => {
        throw new Error('Box has been deleted')
      },
    })
    getMock.mockResolvedValue(tombstone)
    const handle = await upstashBoxSandbox({ apiKey: 'k' }).resume({ id: 'box_123' })
    expect(handle).toBeNull()
    expect(tombstone.getStatus).toHaveBeenCalledOnce()
  })

  it('resumes a missing box as null when Box.get itself throws', async () => {
    getMock.mockRejectedValue(new Error('404 not found'))
    const handle = await upstashBoxSandbox({ apiKey: 'k' }).resume({ id: 'nope' })
    expect(handle).toBeNull()
  })

  it('passes the deterministic id through as the box name on create', async () => {
    createMock.mockResolvedValue(boxStub({ id: 'agent-1' }))
    await upstashBoxSandbox({ apiKey: 'k' }).create({ id: 'agent-1', env: { A: 'b' } })
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'agent-1', env: { A: 'b' }, runtime: 'node', keepAlive: false }),
    )
  })

  it('routes create through fromSnapshot when a base snapshot is configured', async () => {
    fromSnapshotMock.mockResolvedValue(boxStub())
    await upstashBoxSandbox({ apiKey: 'k', snapshot: 'snap_1' }).create({})
    expect(fromSnapshotMock).toHaveBeenCalledWith('snap_1', expect.any(Object))
    expect(createMock).not.toHaveBeenCalled()
  })

  it('destroy swallows an already-deleted box', async () => {
    getMock.mockRejectedValue(new Error('Box has been deleted'))
    await expect(
      upstashBoxSandbox({ apiKey: 'k' }).destroy({ id: 'box_123' }),
    ).resolves.toBeUndefined()
  })

  it('reports the provider name and capabilities', () => {
    const provider = upstashBoxSandbox({ apiKey: 'k' })
    expect(provider.name).toBe('upstash-box')
    const caps = provider.capabilities()
    expect(caps.writableStdin).toBe(true)
    expect(caps.killableProcesses).toBe(true)
  })
})
