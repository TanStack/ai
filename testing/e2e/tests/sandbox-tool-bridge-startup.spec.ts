import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

// Listener startup belongs to the Node host. No provider request reaches this
// path, so this exercises the built package in a real process without aimock.
test('a host can catch bridge startup failure and start another bridge', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { startHostToolBridge } from './packages/ai-sandbox/dist/esm/index.js'

        await assert.rejects(
          startHostToolBridge([], {
            hostForSandbox: '127.0.0.1',
            bindAddress: 'not a valid host',
          }),
          { code: 'ENOTFOUND' },
        )

        const bridge = await startHostToolBridge([], { hostForSandbox: '127.0.0.1' })
        try {
          const response = await fetch(bridge.url)
          assert.equal(response.status, 401)
        } finally {
          await bridge.close()
        }
        console.log('startup error caught; next bridge served a request')
      `,
    ],
    {
      cwd: new URL('../../../', import.meta.url),
      encoding: 'utf8',
      timeout: 10_000,
    },
  )

  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain(
    'startup error caught; next bridge served a request',
  )
})
