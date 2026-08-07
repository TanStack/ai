/* eslint-disable @typescript-eslint/require-await -- trivial fixed-value fakes */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls: {
  created: Array<Record<string, unknown>>
  got: Array<string>
  deleted: Array<string>
  forked: Array<{ source: string; target: string; snapshotId?: string }>
} = { created: [], got: [], deleted: [], forked: [] }

let getError: unknown
let getFactory: ((name: string) => Record<string, unknown>) | undefined
let createGate: Promise<Record<string, unknown>> | undefined
let mkdirError: unknown
let deleteGate: Promise<Record<string, never>> | undefined

let getStatus: string | undefined = 'DEPLOYED'

const sdkSettings: {
  config: Record<string, unknown> & {
    apiKey?: string
    apikey?: string
    workspace?: string
  }
} = { config: {} }
const initialize = vi.fn((config: typeof sdkSettings.config) => {
  sdkSettings.config = config
})

function fakeInstance(
  name: string,
  labels?: Record<string, string>,
): Record<string, unknown> {
  return {
    metadata: { name, ...(labels ? { labels } : {}) },
    status: getStatus,
    fs: {
      mkdir: vi.fn(async () => {
        if (mkdirError !== undefined) throw mkdirError
        return {}
      }),
      read: async () => '',
      readBinary: async () => new Blob([]),
      write: async () => ({}),
      writeBinary: async () => ({}),
      ls: async () => ({}),
      rm: async () => ({}),
      watch: () => ({ close: () => undefined }),
    },
    process: {
      exec: async () => ({ exitCode: 0 }),
      get: async () => ({ exitCode: 0 }),
      wait: async () => ({ exitCode: 0 }),
      kill: async () => ({}),
    },
    previews: { createIfNotExists: async () => ({ spec: {}, tokens: {} }) },
    snapshot: async () => ({ id: 'snap-1' }),
    fork: async (target: string, options?: { snapshotId?: string }) => {
      calls.forked.push({
        source: name,
        target,
        ...(options?.snapshotId ? { snapshotId: options.snapshotId } : {}),
      })
      return { name: target }
    },
    delete: async () => ({}),
  }
}

vi.mock('@blaxel/core', () => ({
  initialize,
  settings: sdkSettings,
  SandboxInstance: {
    createIfNotExists: async (config: Record<string, unknown>) => {
      calls.created.push(config)
      return (
        createGate ??
        fakeInstance(
          String(config.name),
          config.labels as Record<string, string> | undefined,
        )
      )
    },
    get: async (name: string) => {
      calls.got.push(name)
      if (getError !== undefined) throw getError
      return getFactory?.(name) ?? fakeInstance(name)
    },
    delete: async (name: string) => {
      calls.deleted.push(name)
      return deleteGate ?? {}
    },
  },
}))

const { blaxelSandbox } = await import('../src/index')
const { isTerminal } = await import('../src/provider')

beforeEach(() => {
  calls.created = []
  calls.got = []
  calls.deleted = []
  calls.forked = []
  getError = undefined
  getFactory = undefined
  createGate = undefined
  mkdirError = undefined
  deleteGate = undefined
  getStatus = 'DEPLOYED'
  sdkSettings.config = {}
  initialize.mockClear()
  vi.stubEnv('BL_API_KEY', 'test-key')
  vi.stubEnv('BL_WORKSPACE', 'test-workspace')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('blaxelSandbox credentials', () => {
  it('requires an API key', () => {
    delete process.env.BL_API_KEY
    expect(() => blaxelSandbox()).toThrow(/BL_API_KEY/)
  })

  it('requires a workspace', () => {
    delete process.env.BL_WORKSPACE
    expect(() => blaxelSandbox()).toThrow(/BL_WORKSPACE/)
  })

  it('accepts the empty config defaults from @blaxel/core 0.3.10', () => {
    sdkSettings.config = { proxy: '', apikey: '', workspace: '' }
    expect(() =>
      blaxelSandbox({ apiKey: 'explicit', workspace: 'explicit-ws' }),
    ).not.toThrow()
    expect(initialize).toHaveBeenCalledWith({
      proxy: '',
      apikey: '',
      workspace: 'explicit-ws',
      apiKey: 'explicit',
    })
  })

  it('initializes the SDK explicitly without mutating environment variables', () => {
    delete process.env.BL_API_KEY
    delete process.env.BL_WORKSPACE
    expect(() =>
      blaxelSandbox({ apiKey: 'explicit', workspace: 'explicit-ws' }),
    ).not.toThrow()
    expect(process.env.BL_API_KEY).toBeUndefined()
    expect(process.env.BL_WORKSPACE).toBeUndefined()
    expect(initialize).toHaveBeenCalledWith({
      apiKey: 'explicit',
      workspace: 'explicit-ws',
    })
  })

  it('refuses to overwrite process-global SDK credentials', () => {
    blaxelSandbox({ apiKey: 'one', workspace: 'workspace-one' })
    expect(() =>
      blaxelSandbox({ apiKey: 'two', workspace: 'workspace-two' }),
    ).toThrow(/process-global/)
  })
})

describe('blaxelSandbox create', () => {
  it('honors the deterministic id ensure() supplies', async () => {
    const provider = blaxelSandbox()
    const handle = await provider.create({ id: 'thread-abc' })
    expect(handle.id).toBe('thread-abc')
    expect(calls.created[0]?.name).toBe('thread-abc')
  })

  it('normalizes an id without collapsing distinct framework keys', async () => {
    const provider = blaxelSandbox()
    const first = await provider.create({ id: 'Thread/ABC_123!' })
    const second = await provider.create({ id: 'Thread_ABC/123!' })
    expect(first.id).toMatch(/^thread-abc-123-[0-9a-f]{24}$/)
    expect(second.id).toMatch(/^thread-abc-123-[0-9a-f]{24}$/)
    expect(first.id).not.toBe(second.id)
  })

  it('keeps case-only framework ids distinct', async () => {
    const provider = blaxelSandbox()
    const upper = await provider.create({ id: 'ABC' })
    const lower = await provider.create({ id: 'abc' })
    expect(upper.id).toMatch(/^abc-[0-9a-f]{24}$/)
    expect(lower.id).toBe('abc')
    expect(upper.id).not.toBe(lower.id)
  })

  it("keeps long deterministic ids distinct after Blaxel's 49-character limit", async () => {
    const provider = blaxelSandbox()
    const prefix = 'a'.repeat(70)
    const first = await provider.create({ id: `${prefix}-one` })
    const second = await provider.create({ id: `${prefix}-two` })
    expect(first.id).toHaveLength(49)
    expect(second.id).toHaveLength(49)
    expect(first.id).not.toBe(second.id)
  })

  it('falls back to a random name when no id is supplied', async () => {
    const provider = blaxelSandbox()
    const handle = await provider.create({})
    expect(handle.id).toMatch(/^tanstack-ai-[0-9a-f]{32}$/)
  })

  it('applies a default TTL so an abandoned sandbox cannot linger', async () => {
    const provider = blaxelSandbox()
    await provider.create({})
    expect(calls.created[0]?.ttl).toBe('1h')
    expect(calls.created[0]?.image).toBe('blaxel/base-image:latest')
    expect(calls.created[0]?.memory).toBe(2048)
    expect(calls.created[0]).not.toHaveProperty('snapshotEnabled')
  })

  it('omits the TTL when explicitly opted out', async () => {
    const provider = blaxelSandbox({ ttl: null })
    await provider.create({})
    expect(calls.created[0]).not.toHaveProperty('ttl')
  })

  it('passes env through as real sandbox environment variables', async () => {
    const provider = blaxelSandbox()
    await provider.create({ env: { TOKEN: 'abc' } })
    expect(calls.created[0]?.envs).toEqual([{ name: 'TOKEN', value: 'abc' }])
  })

  it('creates the workspace root before any command can use it', async () => {
    const provider = blaxelSandbox()
    const handle = await provider.create({ id: 'sb' })
    expect(handle.workspaceRoot).toBe('/workspace')
  })

  it('does not create a sandbox for a pre-aborted request', async () => {
    const controller = new AbortController()
    controller.abort()
    const provider = blaxelSandbox()
    await expect(
      provider.create({ signal: controller.signal }),
    ).rejects.toThrow()
    expect(calls.created).toHaveLength(0)
  })

  it('aborts an in-flight create and deletes the late billed sandbox', async () => {
    let resolveCreate!: (sandbox: Record<string, unknown>) => void
    createGate = new Promise((resolve) => {
      resolveCreate = resolve
    })
    const controller = new AbortController()
    const provider = blaxelSandbox()
    const creating = provider.create({
      id: 'late-create',
      signal: controller.signal,
    })
    controller.abort()
    await expect(creating).rejects.toThrow()

    resolveCreate(
      fakeInstance(
        'late-create',
        calls.created[0]?.labels as Record<string, string> | undefined,
      ),
    )
    await vi.waitFor(() => expect(calls.deleted).toEqual(['late-create']))
  })

  it('deletes an aborted create whose SDK promise never settles', async () => {
    createGate = new Promise(() => undefined)
    let visible = false
    let visibilityScheduled = false
    getFactory = (name) => {
      if (!visible) {
        if (!visibilityScheduled) {
          visibilityScheduled = true
          setTimeout(() => {
            visible = true
          }, 25)
        }
        throw Object.assign(new Error('sandbox is not visible yet'), {
          status: 404,
        })
      }
      return fakeInstance(
        name,
        calls.created[0]?.labels as Record<string, string> | undefined,
      )
    }
    const controller = new AbortController()
    const provider = blaxelSandbox({ ttl: null })
    const creating = provider.create({
      id: 'never-settled-create',
      signal: controller.signal,
    })
    controller.abort()

    await expect(creating).rejects.toThrow()
    await vi.waitFor(
      () => expect(calls.deleted).toEqual(['never-settled-create']),
      { timeout: 2_500 },
    )
  })

  it('deletes a billed sandbox when workspace preparation fails', async () => {
    mkdirError = new Error('mkdir failed')
    const provider = blaxelSandbox()
    await expect(provider.create({ id: 'prepare-failed' })).rejects.toThrow(
      /mkdir failed/,
    )
    expect(calls.deleted).toEqual(['prepare-failed'])
  })

  it('never deletes a same-name sandbox reused by concurrent callers', async () => {
    mkdirError = new Error('mkdir failed')
    createGate = Promise.resolve(
      fakeInstance('shared', { 'tanstack-ai-create-attempt': 'other-attempt' }),
    )
    const provider = blaxelSandbox()
    const results = await Promise.allSettled([
      provider.create({ id: 'shared' }),
      provider.create({ id: 'shared' }),
    ])
    expect(results.map(({ status }) => status)).toEqual([
      'rejected',
      'rejected',
    ])
    expect(calls.deleted).toHaveLength(0)
  })

  it('reconciles and deletes an owned create accepted before a late 504', async () => {
    createGate = Promise.reject({ status: 504, message: 'gateway timeout' })
    getFactory = (name) =>
      fakeInstance(
        name,
        calls.created[0]?.labels as Record<string, string> | undefined,
      )
    const provider = blaxelSandbox()
    await expect(
      provider.create({ id: 'accepted-late' }),
    ).rejects.toMatchObject({
      status: 504,
    })
    expect(calls.got).toEqual(['accepted-late'])
    expect(calls.deleted).toEqual(['accepted-late'])
  })

  it('reports cleanup failure after reconciling an accepted create error', async () => {
    createGate = Promise.reject({ status: 504, message: 'gateway timeout' })
    getFactory = (name) =>
      fakeInstance(
        name,
        calls.created[0]?.labels as Record<string, string> | undefined,
      )
    deleteGate = Promise.reject({ status: 500, message: 'delete failed' })
    const provider = blaxelSandbox()
    await expect(
      provider.create({ id: 'accepted-cleanup-failed' }),
    ).rejects.toThrow(/could not be cleaned up/)
    expect(calls.deleted).toEqual(['accepted-cleanup-failed'])
  })

  it('reports both preparation and owned-sandbox cleanup failures', async () => {
    mkdirError = new Error('mkdir failed')
    deleteGate = Promise.reject({ status: 500, message: 'delete failed' })
    const provider = blaxelSandbox()
    await expect(provider.create({ id: 'cleanup-failed' })).rejects.toThrow(
      /cleanup also failed|could not be cleaned up/,
    )
    expect(calls.deleted).toEqual(['cleanup-failed'])
  })
})

describe('blaxelSandbox resume', () => {
  it('reattaches to an existing sandbox', async () => {
    const provider = blaxelSandbox()
    const handle = await provider.resume({ id: 'sb-1' })
    expect(handle?.id).toBe('sb-1')
    expect(calls.got).toEqual(['sb-1'])
  })

  it('resolves null when the sandbox is gone', async () => {
    getError = { code: 404 }
    const provider = blaxelSandbox()
    expect(await provider.resume({ id: 'sb-gone' })).toBeNull()
  })

  it('does not hide authentication or transport errors as cache misses', async () => {
    getError = { status: 401, message: 'unauthorized' }
    const provider = blaxelSandbox()
    await expect(provider.resume({ id: 'sb-1' })).rejects.toMatchObject({
      status: 401,
    })
  })

  it('resolves null for a deleted sandbox that still resolves as DELETING', async () => {
    // A single delete leaves the record behind in a terminal state rather than
    // 404ing, so a status check is the only thing standing between the caller
    // and a handle to a sandbox being torn down.
    getStatus = 'DELETING'
    const provider = blaxelSandbox()
    expect(await provider.resume({ id: 'sb-deleting' })).toBeNull()
  })

  it('treats every terminal state as gone', () => {
    for (const status of [
      'DELETING',
      'TERMINATED',
      'TERMINATING',
      'FAILED',
      'DEACTIVATING',
    ]) {
      expect(isTerminal(status)).toBe(true)
    }
  })

  it('still resumes a sandbox that is on its way up', async () => {
    for (const status of ['DEPLOYING', 'BUILDING', 'UPLOADING', 'BUILT']) {
      getStatus = status
      const provider = blaxelSandbox()
      expect(await provider.resume({ id: 'sb-starting' })).not.toBeNull()
    }
  })

  it('resumes a deactivated sandbox consistently with @blaxel/core reuse', async () => {
    getStatus = 'DEACTIVATED'
    const provider = blaxelSandbox()
    expect(await provider.resume({ id: 'sb-sleeping' })).not.toBeNull()
    expect(isTerminal('DEACTIVATED')).toBe(false)
  })

  it('stays permissive when the API reports no status', async () => {
    getStatus = undefined
    const provider = blaxelSandbox()
    expect(await provider.resume({ id: 'sb-unknown' })).not.toBeNull()
  })
})

describe('blaxelSandbox destroy', () => {
  it('deletes by id', async () => {
    const provider = blaxelSandbox()
    await provider.destroy({ id: 'sb-1' })
    expect(calls.deleted).toEqual(['sb-1'])
  })

  it('treats an already deleted sandbox as a successful destroy', async () => {
    deleteGate = Promise.reject({ code: 404 })
    const provider = blaxelSandbox()
    await expect(provider.destroy({ id: 'sb-gone' })).resolves.toBeUndefined()
  })

  it('does not hang past the destroy signal when the SDK call stalls', async () => {
    deleteGate = new Promise(() => {})
    const controller = new AbortController()
    const provider = blaxelSandbox()
    const destroying = provider.destroy({
      id: 'sb-1',
      signal: controller.signal,
    })
    controller.abort()
    await expect(destroying).rejects.toThrow()
    expect(calls.deleted).toEqual(['sb-1'])
  })
})

describe('blaxelSandbox capabilities', () => {
  it('keeps source-scoped private-preview snapshot and fork APIs disabled', () => {
    const provider = blaxelSandbox()
    expect(provider.name).toBe('blaxel')
    expect(provider.capabilities().snapshots).toBe(false)
    expect(provider.capabilities().fork).toBe(false)
    expect(provider.restoreSnapshot).toBeUndefined()
  })
})
