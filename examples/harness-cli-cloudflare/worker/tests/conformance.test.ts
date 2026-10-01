import { fileURLToPath } from 'node:url'
import { afterAll } from 'vitest'
import { defineAIPersistence } from '@tanstack/ai-persistence'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { createTestHarness } from 'wrangler'
import { workerStores } from '../../src/cloudflare-stores'

// The CLI's stores, against the real Worker in local workerd. The runs,
// approvals, inputs, and generation runs stay in the CLI's memory, so the
// Worker does not have them.
const SECRET = 'conformance-secret'
const server = createTestHarness({
  root: fileURLToPath(new URL('..', import.meta.url)),
  workers: [
    {
      configPath: 'wrangler.jsonc',
      secrets: { HARNESS_SECRET: SECRET, ENCRYPTION_KEY: 'conformance-key' },
    },
  ],
})
afterAll(() => server.close())

runPersistenceConformance(
  'the Cloudflare Worker',
  async () => {
    const { url } = await server.listen()
    return defineAIPersistence({
      stores: workerStores({ url: url.toString(), secret: SECRET }),
    })
  },
  { skip: ['messages', 'runs', 'interrupts', 'generationRuns', 'inbox'] },
)
