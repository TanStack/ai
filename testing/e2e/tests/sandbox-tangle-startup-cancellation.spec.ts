import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

// Runs `script` against the built package with the SDK's `create` patched, so
// no request leaves the process and no API key is needed.
function runAgainstBuiltPackage(script: string) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { tangleSandbox } from './packages/ai-sandbox-tangle/dist/esm/index.js'
        // The same ESM module the built provider imports, so patching it reaches the provider.
        const { Sandbox } = await import('./packages/ai-sandbox-tangle/node_modules/@tangle-network/sandbox/dist/index.js')
        const controller = new AbortController()
        const reason = new Error('startup cancelled')
        const deleted = []
        ${script}
      `,
    ],
    {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8',
      timeout: 20_000,
    },
  )
}

test('tangle create rejects on abort and deletes the sandbox once the create settles, in the built package', () => {
  const result = runAgainstBuiltPackage(`
    let settle
    Sandbox.prototype.create = () =>
      new Promise((resolve) => {
        settle = () => resolve({ id: 'sbx-1', delete: async () => { deleted.push('sbx-1') } })
      })
    const created = tangleSandbox({ apiKey: 'unused-test-key' }).create({ signal: controller.signal })
    controller.abort(reason)
    await assert.rejects(created, (error) => error === reason)
    assert.deepEqual(deleted, [])
    settle()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.deepEqual(deleted, ['sbx-1'])
    console.log('create cancelled; sandbox deleted')
  `)

  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('create cancelled; sandbox deleted')
})

test('tangle create deletes a sandbox whose startup is aborted while it boots, in the built package', () => {
  const result = runAgainstBuiltPackage(`
    Sandbox.prototype.create = async () => ({
      id: 'sbx-2',
      waitFor: async (_status, options) => {
        controller.abort(reason)
        options.signal.throwIfAborted()
      },
      exec: async () => { throw new Error('exec ran after the abort') },
      delete: async () => { deleted.push('sbx-2') },
    })
    const created = tangleSandbox({ apiKey: 'unused-test-key' }).create({ signal: controller.signal })
    await assert.rejects(created, (error) => error === reason)
    assert.deepEqual(deleted, ['sbx-2'])
    console.log('startup cancelled; sandbox deleted')
  `)

  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('startup cancelled; sandbox deleted')
})
