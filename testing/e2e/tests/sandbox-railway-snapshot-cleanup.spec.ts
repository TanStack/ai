import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

test('railway checkpoints are deleted once nothing references them', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { defineSandbox, InMemorySandboxInstanceStore } from './packages/ai-sandbox/dist/esm/index.js'
        import { railwaySandbox } from './packages/ai-sandbox-railway/dist/esm/index.js'
        const { Sandbox } = await import('./packages/ai-sandbox-railway/node_modules/railway/dist/index.js')

        // In-memory stand-in for the Railway API: sandboxes and environment checkpoints.
        const sandboxes = new Map()
        const checkpoints = []
        let n = 0
        const fake = (id) => ({
          id,
          status: 'RUNNING',
          domains: [],
          networkIsolation: undefined,
          files: { mkdir: async () => {} },
          refresh: async () => {},
          heartbeat: async () => {},
          checkpoint: async (key) => { checkpoints.push({ id: \`ckpt-\${++n}\`, key }) },
          destroy: async () => { sandboxes.get(id).status = 'DESTROYED' },
        })
        Sandbox.create = async () => { const s = fake(\`sbx-\${++n}\`); sandboxes.set(s.id, s); return s }
        Sandbox.connect = async (id) => sandboxes.get(id)
        Sandbox.checkpoints = async () => checkpoints.map((c) => ({ ...c, environmentId: 'env-test', createdAt: '' }))
        Sandbox.deleteCheckpoint = async (id) => { checkpoints.splice(checkpoints.findIndex((c) => c.id === id), 1) }

        const def = defineSandbox({
          id: 'repo',
          provider: railwaySandbox({ token: 'unused-test-token', environmentId: 'env-test' }),
          lifecycle: { reuse: 'thread', snapshotMaxAge: '1h' },
        })
        const store = new InMemorySandboxInstanceStore()
        const ctx = { threadId: 'thread-1', runId: 'run-1', store }
        const key = def.key(ctx)

        const first = await def.ensure(ctx)
        const firstCheckpoint = (await store.get(key)).latestSnapshotId
        assert.deepEqual(checkpoints.map((c) => c.key), [firstCheckpoint])

        // Expire the record: the re-create replaces the checkpoint and deletes the old one.
        await store.upsert({ ...(await store.get(key)), updatedAt: 0 })
        const second = await def.ensure({ ...ctx, runId: 'run-2' })
        assert.notEqual(second.id, first.id)
        const secondCheckpoint = (await store.get(key)).latestSnapshotId
        assert.deepEqual(checkpoints.map((c) => c.key), [secondCheckpoint])

        // Destroy: the sandbox and its checkpoint are both gone.
        await def.destroy({ ...ctx, runId: 'run-3' })
        assert.equal(sandboxes.get(second.id).status, 'DESTROYED')
        assert.deepEqual(checkpoints, [])
        console.log('replaced and destroyed checkpoints deleted')
      `,
    ],
    {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8',
      timeout: 20_000,
    },
  )

  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('replaced and destroyed checkpoints deleted')
})
