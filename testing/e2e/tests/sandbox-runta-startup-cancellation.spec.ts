import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

test('runta create cleans up an aborted startup in the built package', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { runtaSandbox } from './packages/ai-sandbox-runta/dist/esm/index.js'

        const id = '11111111-1111-4111-8111-111111111111'
        const runtime = { id, display_name: 'box', status: 'creating', desired_status: 'running', revision: 1 }
        const controller = new AbortController()
        const reason = new Error('startup cancelled')
        const requests = []
        // The provider has no SDK to patch. It calls the global fetch.
        globalThis.fetch = async (url, init) => {
          init.signal?.throwIfAborted()
          requests.push(init.method + ' ' + new URL(url).pathname)
          // Runta accepts the create. The caller aborts while the runtime boots.
          if (init.method === 'POST') controller.abort(reason)
          return Response.json({ data: runtime })
        }
        const result = runtaSandbox({ apiKey: 'unused-test-key' })
          .create({ id: 'box', signal: controller.signal })
        await assert.rejects(result, (error) => error === reason)
        // The delete reads the runtime first, for its revision.
        assert.deepEqual(requests, [
          'POST /v2/runtimes',
          'GET /v2/runtimes/' + id,
          'DELETE /v2/runtimes/' + id,
        ])
        console.log('create cancelled; runtime deleted')
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
  expect(result.stdout).toContain('create cancelled; runtime deleted')
})
