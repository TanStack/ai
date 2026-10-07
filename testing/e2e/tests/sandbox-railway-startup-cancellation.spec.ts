import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

test('railway create cleans up an aborted startup in the built package', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { railwaySandbox } from './packages/ai-sandbox-railway/dist/esm/index.js'
        // The same ESM module the built provider imports, so patching it reaches the provider.
        const { Sandbox } = await import('./packages/ai-sandbox-railway/node_modules/railway/dist/index.js')

        const controller = new AbortController()
        const reason = new Error('startup cancelled')
        const destroyed = []
        Sandbox.create = async () => {
          controller.abort(reason)
          return { id: 'sbx-1', destroy: async () => { destroyed.push('sbx-1') } }
        }
        const result = railwaySandbox({ token: 'unused-test-token', environmentId: 'env-test' })
          .create({ signal: controller.signal })
        await assert.rejects(result, (error) => error === reason)
        await new Promise((resolve) => setTimeout(resolve, 0))
        assert.deepEqual(destroyed, ['sbx-1'])
        console.log('create cancelled; sandbox destroyed')
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
  expect(result.stdout).toContain('create cancelled; sandbox destroyed')
})
