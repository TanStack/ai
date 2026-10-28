/**
 * Daytona provider snapshot restore, resume, create options, and secret
 * handling. The SDK is mocked so these tests do not create billed sandboxes.
 * Issues #1081 item 7, #1083, #1084, #1085.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sandbox } from '@daytona/sdk'

const { create, get, del, secretCreate, DaytonaConflictError } = vi.hoisted(
  () => {
    class DaytonaConflictError extends Error {
      statusCode = 409
    }
    return {
      create: vi.fn(),
      get: vi.fn(),
      del: vi.fn(),
      secretCreate: vi.fn(),
      DaytonaConflictError,
    }
  },
)

vi.mock('@daytona/sdk', () => ({
  Daytona: class {
    create = create
    get = get
    delete = del
    secret = { create: secretCreate }
  },
  DaytonaConflictError,
}))

import { daytonaSandbox } from '../src/index'

function fakeRemoteSandbox(
  id: string,
  extras: {
    state?: string
    start?: ReturnType<typeof vi.fn>
    executeCommand?: ReturnType<typeof vi.fn>
  } = {},
): Sandbox {
  // Sandbox from @daytona/sdk is a large class. Tests only need these fields.
  return {
    id,
    state: extras.state ?? 'started',
    start: extras.start ?? vi.fn(async () => {}),
    process: {
      executeCommand:
        extras.executeCommand ??
        vi.fn(async () => ({ result: '', exitCode: 0 })),
    },
    delete: vi.fn(async () => {}),
  } as unknown as Sandbox
}

beforeEach(() => {
  create.mockReset()
  get.mockReset()
  del.mockReset()
  secretCreate.mockReset()
  secretCreate.mockResolvedValue({ name: 'created' })
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

  it('mounts workspace secrets as organization Secrets on restore', async () => {
    const restored = fakeRemoteSandbox('sbx-restored')
    create.mockResolvedValue(restored)
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    await provider.restoreSnapshot!({
      snapshotId: 'tanstack-ai-sandbox-snapshot-sbx-1-after-setup',
      env: { ANTHROPIC_API_KEY: 'sk-secret-value' },
    })

    const payload = create.mock.calls[0]?.[0] as {
      snapshot?: string
      secrets?: Record<string, string>
      envVars?: unknown
    }
    expect(payload.snapshot).toBe(
      'tanstack-ai-sandbox-snapshot-sbx-1-after-setup',
    )
    expect(payload.secrets?.ANTHROPIC_API_KEY).toMatch(
      /^tanstack_ANTHROPIC_API_KEY_[0-9a-f]{12}$/,
    )
    expect(payload.envVars).toBeUndefined()
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

  it('does not overlay secret plaintext after resume', async () => {
    const executeCommand = vi.fn(
      async (
        _command: string,
        _cwd?: string,
        _env?: Record<string, string>,
      ) => ({ result: '', exitCode: 0 }),
    )
    get.mockResolvedValue(fakeRemoteSandbox('sbx-live', { executeCommand }))
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    const handle = await provider.resume({ id: 'sbx-live' })
    expect(handle).not.toBeNull()
    await handle!.env.set({ ANTHROPIC_API_KEY: 'sk-secret-value' })
    await handle!.process.exec('echo hello')

    const overlay = executeCommand.mock.calls.filter((call) => {
      const env = call[2] as Record<string, string> | undefined
      return env !== undefined && Object.values(env).includes('sk-secret-value')
    })
    expect(overlay).toEqual([])
  })
})

// Issue #1084: create-time envVars stay in the Daytona sandbox record
// (GET /sandbox/:id returns them in plain text). Workspace secrets are
// organization Secrets referenced by name. The sandbox env holds a
// placeholder, not the value.
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
    const payload = create.mock.calls[0]?.[0] as {
      envVars?: unknown
      secrets?: Record<string, string>
    }
    expect(payload.envVars).toBeUndefined()
    expect(handle.id).toBe('sbx-1')
  })

  it('mounts workspace secrets as Daytona organization Secrets', async () => {
    create.mockResolvedValue(fakeRemoteSandbox('sbx-1'))
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    await provider.create({
      env: { ANTHROPIC_API_KEY: 'sk-secret-value' },
    })

    expect(secretCreate).toHaveBeenCalledWith({
      name: expect.stringMatching(/^tanstack_ANTHROPIC_API_KEY_[0-9a-f]{12}$/),
      value: 'sk-secret-value',
      description: 'TanStack AI workspace secret',
    })
    const secretName = (secretCreate.mock.calls[0]?.[0] as { name: string })
      .name
    const payload = create.mock.calls[0]?.[0] as {
      secrets?: Record<string, string>
      envVars?: unknown
    }
    expect(payload.secrets).toEqual({ ANTHROPIC_API_KEY: secretName })
    expect(payload.envVars).toBeUndefined()
    expect(secretCreate.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0] ?? Infinity,
    )
  })

  it('reuses an organization Secret when the name already exists', async () => {
    secretCreate.mockRejectedValue(new DaytonaConflictError('exists'))
    create.mockResolvedValue(fakeRemoteSandbox('sbx-1'))
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    await provider.create({
      env: { ANTHROPIC_API_KEY: 'sk-secret-value' },
    })

    const payload = create.mock.calls[0]?.[0] as {
      secrets?: Record<string, string>
    }
    expect(payload.secrets?.ANTHROPIC_API_KEY).toMatch(
      /^tanstack_ANTHROPIC_API_KEY_[0-9a-f]{12}$/,
    )
  })

  it('skips empty secret values', async () => {
    create.mockResolvedValue(fakeRemoteSandbox('sbx-1'))
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    await provider.create({
      env: { ANTHROPIC_API_KEY: '' },
    })

    expect(secretCreate).not.toHaveBeenCalled()
    const payload = create.mock.calls[0]?.[0] as { secrets?: unknown }
    expect(payload.secrets).toBeUndefined()
  })

  it('does not overlay secret plaintext onto exec after create', async () => {
    const executeCommand = vi.fn(
      async (
        _command: string,
        _cwd?: string,
        _env?: Record<string, string>,
      ) => ({ result: '', exitCode: 0 }),
    )
    create.mockResolvedValue(fakeRemoteSandbox('sbx-1', { executeCommand }))
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    const handle = await provider.create({
      env: { ANTHROPIC_API_KEY: 'sk-secret-value' },
    })
    // bootstrapWorkspace / applyWorkspaceSecrets call env.set with the
    // resolved plaintext. That must not reach executeCommand.
    await handle.env.set({ ANTHROPIC_API_KEY: 'sk-secret-value' })
    await handle.process.exec('echo hello')

    const secretCalls = executeCommand.mock.calls.filter((call) => {
      const env = call[2] as Record<string, string> | undefined
      return env !== undefined && Object.values(env).includes('sk-secret-value')
    })
    expect(secretCalls).toEqual([])
    const commandCalls = executeCommand.mock.calls.filter(
      (call) => call[0] === 'echo hello',
    )
    expect(commandCalls.length).toBeGreaterThan(0)
    for (const call of commandCalls) {
      expect(String(call[0])).not.toContain('sk-secret-value')
    }
  })

  it('does not write secret plaintext into the spawn env file', async () => {
    const executeCommand = vi.fn(
      async (
        _command: string,
        _cwd?: string,
        _env?: Record<string, string>,
      ) => ({ result: '', exitCode: 0 }),
    )
    const uploadFile = vi.fn(async (_data: Buffer, _path: string) => {})
    const createFolder = vi.fn(async () => {})
    const executeSessionCommand = vi.fn(
      async (_sessionId: string, _request: { command: string }) => ({
        cmdId: 'cmd-1',
      }),
    )
    const sandbox = fakeRemoteSandbox('sbx-1', { executeCommand })
    Object.assign(sandbox, {
      fs: { uploadFile, createFolder },
      process: {
        ...sandbox.process,
        createSession: vi.fn(async () => {}),
        executeSessionCommand,
        getSessionCommandLogs: vi.fn(async () => {}),
        getSessionCommand: vi.fn(async () => ({ exitCode: 0 })),
        deleteSession: vi.fn(async () => {}),
        sendSessionCommandInput: vi.fn(async () => {}),
      },
    })
    create.mockResolvedValue(sandbox)
    const provider = daytonaSandbox({ apiKey: 'test-key' })

    const handle = await provider.create({
      env: { ANTHROPIC_API_KEY: 'sk-secret-value' },
    })
    await handle.env.set({ ANTHROPIC_API_KEY: 'sk-secret-value' })
    const proc = await handle.process.spawn('echo hi')
    await proc.wait()

    for (const call of uploadFile.mock.calls) {
      const data = call[0]
      const body =
        typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : ''
      expect(body).not.toContain('sk-secret-value')
    }
    const command = executeSessionCommand.mock.calls[0]?.[1]?.command
    expect(command).not.toContain('sk-secret-value')
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
