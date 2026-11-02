import { spawnSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

test('render create cleans up an aborted startup in the built package', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { renderSandbox } from './packages/ai-sandbox-render/dist/esm/index.js'

        const controller = new AbortController()
        const reason = new Error('startup cancelled')
        const terminated = []
        const client = {
          create: async () => {
            controller.abort(reason)
            return { id: 'sbx-1' }
          },
          terminate: async (id) => {
            terminated.push(id)
          },
        }
        const result = renderSandbox({ client }).create({ signal: controller.signal })
        await assert.rejects(result, (error) => error === reason)
        assert.deepEqual(terminated, ['sbx-1'])
        console.log('create cancelled; sandbox terminated')
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
  expect(result.stdout).toContain('create cancelled; sandbox terminated')
})

test('render reconnect replaces old secrets in the built package', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict'
        import { renderSandbox } from './packages/ai-sandbox-render/dist/esm/index.js'

        const files = new Map()
        const commands = []
        const client = {
          get: async () => ({ status: 'running' }),
          upload: async (_id, path, data) => files.set(path, String(data)),
          exec: async function* (_id, command) {
            commands.push(command)
            yield { type: 'exit', exit_code: 0 }
          },
        }
        const provider = renderSandbox({ client })
        const first = await provider.resume({ id: 'sbx-1' })
        await first.env.set({ SECRET: 'old-canary' })
        const second = await provider.resume({ id: 'sbx-1' })
        await second.env.set({ SECRET: 'new-canary' })
        assert.equal(files.size, 1)
        assert(![...files.values()].join('').includes('old-canary'))
        assert([...files.values()].join('').includes('new-canary'))
        assert(!commands.join('').includes('canary'))
        console.log('reconnect replaced the old secret without logging either value')
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
  expect(result.stdout).toContain('reconnect replaced the old secret')
})
