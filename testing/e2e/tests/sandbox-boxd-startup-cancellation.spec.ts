import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

test('boxd create cleans up an aborted startup in the built package', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { createRequire } from 'node:module'
        import { boxdSandbox } from './packages/ai-sandbox-boxd/dist/esm/index.js'

        const require = createRequire(new URL('./packages/ai-sandbox-boxd/package.json', import.meta.url))
        const { Boxd } = await import(require.resolve('@boxd-sh/sdk'))
        const client = new Boxd({ token: 'unused-test-token' })
        const machines = Object.getPrototypeOf(client.machines)
        const machine = { id: 'vm-1', name: 'm', status: 'running', access: { url: 'https://m.boxd.sh' } }

        const controller = new AbortController()
        const reason = new Error('startup cancelled')
        const deleted = []
        machines.create = async () => machine
        machines.waitUntilReady = async () => {
          controller.abort(reason)
          return machine
        }
        machines.delete = async (id) => { deleted.push(id) }
        const result = boxdSandbox({ apiKey: 'unused-test-key' }).create({ signal: controller.signal })
        await assert.rejects(result, (error) => error === reason)
        assert.deepEqual(deleted, ['vm-1'])
        await client.close()
        console.log('create cancelled; machine deleted')
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
  expect(result.stdout).toContain('create cancelled; machine deleted')
})
