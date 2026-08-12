/**
 * Daytona provider snapshot restore, resume, create options, and secret
 * handling. The SDK is mocked so these tests do not create billed sandboxes.
 * Issues #1081 item 7, #1083, #1084, #1085.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sandbox } from '@daytona/sdk'

const create = vi.fn()
const get = vi.fn()
const del = vi.fn()

vi.mock('@daytona/sdk', () => ({
  Daytona: class {
    create = create
    get = get
    delete = del
  },
}))

import { daytonaSandbox } from '../src/index'

function fakeRemoteSandbox(
  id: string,
  extras: {
    state?: string
    start?: ReturnType<typeof vi.fn>
  } = {},
): Sandbox {
  // Sandbox from @daytona/sdk is a large class. Tests only need these fields.
  return {
    id,
    state: extras.state ?? 'started',
    start: extras.start ?? vi.fn(async () => {}),
    process: {
      executeCommand: vi.fn(async () => ({ result: '', exitCode: 0 })),
    },
    delete: vi.fn(async () => {}),
  } as unknown as Sandbox
}

beforeEach(() => {
  create.mockReset()
  get.mockReset()
  del.mockReset()
})

describe('daytonaSandbox snapshots', () => {
  it('advertises snapshots: true and implements restoreSnapshot', () => {
    const provider = daytonaSandbox({ apiKey: 'test-key' })
    expect(provider.capabilities().snapshots).toBe(true)
    expect(provider.restoreSnapshot).toBeTypeOf('function')
  })

  it('restores a snapshot by creating a sandbox from that snapshot name', async () => {
    const restored = fakeRemoteSandbox('sbx-restored')
    create.mockResolvedValue(restored)
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    const handle = await provider.restoreSnapshot!({
      snapshotId: 'tanstack-ai-sandbox-snapshot-sbx-1-after-setup',
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: 'tanstack-ai-sandbox-snapshot-sbx-1-after-setup',
      }),
    )
    expect(handle.id).toBe('sbx-restored')
    expect(handle.provider).toBe('daytona')
  })
})

// Issue #1083: Daytona stops an idle sandbox after 15 minutes. resume()
// used to wrap daytona.get() only. A stopped sandbox accepts get() but
// rejects executeCommand with "Is the Sandbox started?".
describe('daytonaSandbox resume', () => {
  it('starts a stopped sandbox before returning the handle', async () => {
    const start = vi.fn(async () => {})
    get.mockResolvedValue(
      fakeRemoteSandbox('sbx-idle', { state: 'stopped', start }),
    )
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    const handle = await provider.resume({ id: 'sbx-idle' })

    expect(handle).not.toBeNull()
    expect(handle?.id).toBe('sbx-idle')
    expect(start).toHaveBeenCalledOnce()
  })

  it('starts an archived sandbox before returning the handle', async () => {
    const start = vi.fn(async () => {})
    get.mockResolvedValue(
      fakeRemoteSandbox('sbx-archived', { state: 'archived', start }),
    )
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    await provider.resume({ id: 'sbx-archived' })

    expect(start).toHaveBeenCalledOnce()
  })

  it('does not start a sandbox that is already started', async () => {
    const start = vi.fn(async () => {})
    get.mockResolvedValue(
      fakeRemoteSandbox('sbx-live', { state: 'started', start }),
    )
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    const handle = await provider.resume({ id: 'sbx-live' })

    expect(handle?.id).toBe('sbx-live')
    expect(start).not.toHaveBeenCalled()
  })

  it('returns null when the sandbox is gone', async () => {
    get.mockRejectedValue(new Error('not found'))
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    await expect(provider.resume({ id: 'missing' })).resolves.toBeNull()
  })
})

// Issue #1084: create-time envVars stay in the Daytona sandbox record
// (GET /sandbox/:id returns them in plain text). Secrets go onto the
// handle after create, not into the create payload.
// Issue #1085: create must forward name, auto-stop, ephemeral, and
// network block from the portable input / config.
describe('daytonaSandbox create', () => {
  it('does not put workspace secrets into create-time envVars', async () => {
    create.mockResolvedValue(fakeRemoteSandbox('sbx-1'))
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    const handle = await provider.create({
      env: { ANTHROPIC_API_KEY: 'sk-secret-value' },
    })

    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        envVars: expect.anything(),
      }),
    )
    const payload = create.mock.calls[0]?.[0] as { envVars?: unknown }
    expect(payload.envVars).toBeUndefined()
    expect(handle.id).toBe('sbx-1')
  })

  it('forwards the deterministic instance id as the Daytona name', async () => {
    create.mockResolvedValue(fakeRemoteSandbox('sbx-1'))
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    await provider.create({ id: 'abc123def4567890' })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'abc123def4567890' }),
    )
  })

  it('forwards autoStopInterval from config', async () => {
    create.mockResolvedValue(fakeRemoteSandbox('sbx-1'))
    const provider = daytonaSandbox({
      apiKey: 'test-key',
      autoStopInterval: 0,
    })

    await provider.create({})

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ autoStopInterval: 0 }),
    )
  })

  it('forwards ephemeral from config', async () => {
    create.mockResolvedValue(fakeRemoteSandbox('sbx-1'))
    const provider = daytonaSandbox({
      apiKey: 'test-key',
      ephemeral: true,
    })

    await provider.create({})

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    )
  })

  it('blocks all network when the policy denies network', async () => {
    create.mockResolvedValue(fakeRemoteSandbox('sbx-1'))
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    await provider.create({
      policy: { capabilities: { network: 'deny' } },
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ networkBlockAll: true }),
    )
  })

  it('advertises networkPolicy: true', () => {
    const provider = daytonaSandbox({ apiKey: 'test-key' })
    expect(provider.capabilities().networkPolicy).toBe(true)
  })
})
