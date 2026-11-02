/**
 * Provider tests against a fake SDK client. The cases that matter most: a
 * missing or ended sandbox resumes as `null` (so `ensure()` re-creates),
 * anything else surfaces (so `ensure()` does not duplicate a live sandbox), a
 * failed or aborted create terminates what Render minted, and a `deny`
 * network policy always reaches Render, on restore too.
 */
import { describe, expect, it } from 'vitest'
import {
  ClientError,
  SandboxCreateWaitError,
  SandboxNotRunningError,
  ServerError,
} from '@renderinc/sdk'
import { renderSandbox } from '../src/index'
import { fakeClient } from './fakes'

function setup(config = {}) {
  const fake = fakeClient()
  fake.client.create.mockResolvedValue({ id: 'sbx-1', status: 'running' })
  const provider = renderSandbox({
    client: fake.sdk,
    workdir: '/tmp',
    ...config,
  })
  return { ...fake, provider }
}

describe('create', () => {
  it('passes the config, waits for running, and returns the handle', async () => {
    const { client, provider } = setup({
      plan: '2c-4g',
      idleTimeoutSeconds: 600,
      buildName: 'node-22',
    })
    const handle = await provider.create({ env: { K: 'v' } })
    expect(handle.id).toBe('sbx-1')
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        plan: '2c-4g',
        idleTimeoutSeconds: 600,
        buildName: 'node-22',
        env: { K: 'v' },
        wait: expect.objectContaining({ timeoutMs: 120_000 }),
      }),
    )
  })

  it("sends deny-all for policy network 'deny', over the configured policy", async () => {
    const { client, provider } = setup({
      networkPolicy: { type: 'allow-list', rules: [{ domain: 'x.com' }] },
    })
    await provider.create({ policy: { capabilities: { network: 'deny' } } })
    expect(client.create.mock.calls[0]?.[0].networkPolicy).toEqual({
      type: 'deny-all',
    })
  })

  it('terminates the sandbox when the wait fails', async () => {
    const { client, provider } = setup()
    client.create.mockRejectedValue(
      new SandboxCreateWaitError('wait failed', 'sbx-2', new Error('timeout')),
    )
    await expect(provider.create({})).rejects.toThrow('wait failed')
    expect(client.terminate).toHaveBeenCalledWith('sbx-2')
  })

  it('terminates the sandbox and rejects with the reason on abort', async () => {
    const { client, provider } = setup()
    const controller = new AbortController()
    const reason = new Error('cancelled')
    client.create.mockImplementation(async () => {
      controller.abort(reason)
      return { id: 'sbx-3' }
    })
    await expect(provider.create({ signal: controller.signal })).rejects.toBe(
      reason,
    )
    expect(client.terminate).toHaveBeenCalledWith('sbx-3')
  })

  it('rejects buildName with snapshotName', () => {
    expect(() =>
      renderSandbox({
        client: fakeClient().sdk,
        buildName: 'a',
        snapshotName: 'b',
      }),
    ).toThrow(/either/)
  })

  it.each([{ token: 'rnd_x' }, { ownerId: 'tea-x' as const }])(
    'rejects %o alongside a pre-built client',
    (auth) => {
      expect(() =>
        renderSandbox({ client: fakeClient().sdk, ...auth }),
      ).toThrow(/on your client/)
    },
  )
})

describe('restoreSnapshot', () => {
  it('restores by id and reapplies env and the deny policy', async () => {
    const { client, provider } = setup()
    await provider.restoreSnapshot!({
      snapshotId: 'snp-1',
      env: { K: 'v' },
      policy: { capabilities: { network: 'deny' } },
    })
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotId: 'snp-1',
        env: { K: 'v' },
        networkPolicy: { type: 'deny-all' },
      }),
    )
  })
})

describe('resume', () => {
  it.each(['running', 'suspended'])(
    'returns a handle for %s',
    async (status) => {
      const { client, provider } = setup()
      client.get.mockResolvedValue({ status })
      expect((await provider.resume({ id: 'sbx-1' }))?.id).toBe('sbx-1')
      expect(client.waitUntilRunning).not.toHaveBeenCalled()
    },
  )

  it('waits for a sandbox that is still resuming', async () => {
    const { client, provider } = setup()
    client.get.mockResolvedValue({ status: 'resuming' })
    await provider.resume({ id: 'sbx-1' })
    expect(client.waitUntilRunning).toHaveBeenCalled()
  })

  it.each(['terminated', 'errored'])(
    'returns null when it becomes %s during the wait',
    async (status) => {
      const { client, provider } = setup()
      client.get.mockResolvedValue({ status: 'resuming' })
      client.waitUntilRunning.mockRejectedValue(
        new SandboxNotRunningError('ended', 'sbx-1', status),
      )
      expect(await provider.resume({ id: 'sbx-1' })).toBeNull()
    },
  )

  it.each(['terminated', 'errored'])('returns null for %s', async (status) => {
    const { client, provider } = setup()
    client.get.mockResolvedValue({ status })
    expect(await provider.resume({ id: 'sbx-1' })).toBeNull()
  })

  it.each([404, 400])('returns null on a %s', async (code) => {
    const { client, provider } = setup()
    client.get.mockRejectedValue(new ClientError('gone', code))
    expect(await provider.resume({ id: 'sbx-1' })).toBeNull()
  })

  it('surfaces other errors', async () => {
    const { client, provider } = setup()
    client.get.mockRejectedValue(new ServerError('boom', 500))
    await expect(provider.resume({ id: 'sbx-1' })).rejects.toThrow('boom')
  })
})

describe('destroy', () => {
  it('treats a missing sandbox as destroyed', async () => {
    const { client, provider } = setup()
    client.terminate.mockRejectedValue(new ClientError('gone', 404))
    await expect(provider.destroy({ id: 'sbx-1' })).resolves.toBeUndefined()
  })
})
