import { test as base } from '@playwright/test'
import { LLMock } from '@copilotkit/aimock'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const AIMOCK_PORT = 4010

export type AIMockFixture = {
  aimock: LLMock
  testId: string
  aimockPort: number
}

// Worker-scoped: single shared aimock instance on fixed port.
// X-Test-Id header provides per-test sequenceIndex isolation for parallel execution.
export const test = base.extend<AIMockFixture>({
  aimockPort: [
    async ({}, use) => {
      await use(AIMOCK_PORT)
    },
    { scope: 'worker' },
  ],

  aimock: [
    async ({}, use) => {
      // Try to start aimock — if port is already in use (another worker started it),
      // connect to the existing instance
      const mock = new LLMock({
        port: AIMOCK_PORT,
        host: '127.0.0.1',
        logLevel: 'info',
      })

      const fixturesDir = path.resolve(__dirname, '..', 'fixtures')
      const entries = fs.readdirSync(fixturesDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'recorded') {
          await mock.loadFixtureDir(path.join(fixturesDir, entry.name))
        }
      }

      let started = false
      try {
        await mock.start()
        started = true
        console.log(`[aimock] started on port ${AIMOCK_PORT}`)
      } catch (err: unknown) {
        // Port already in use — another worker started aimock, which is fine
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('EADDRINUSE')) {
          console.log(
            `[aimock] port ${AIMOCK_PORT} already in use — sharing existing instance`,
          )
        } else {
          throw err
        }
      }

      await use(mock)

      if (started) {
        await mock.stop()
        console.log(`[aimock] stopped port ${AIMOCK_PORT}`)
      }
    },
    { scope: 'worker' },
  ],

  // Test-scoped: unique ID per test for sequenceIndex isolation
  testId: async ({}, use, testInfo) => {
    const id = `${testInfo.workerIndex}-${testInfo.testId}`
    await use(id)
  },
})

// Ensure aimock is started for every test (even if not destructured explicitly)
test.beforeEach(async ({ aimock: _aimock }) => {
  // aimock worker fixture auto-starts when accessed
})

export { expect } from '@playwright/test'
