import { test as base } from '@playwright/test'
import { LLMock } from '@copilotkit/aimock'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export type AIMockFixture = {
  aimock: LLMock
}

// Worker-scoped fixture: one aimock instance per worker, reset match counts per test
export const test = base.extend<AIMockFixture>({
  aimock: [
    async ({}, use) => {
      const mock = new LLMock({
        port: 4010,
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

      await mock.start()
      console.log(`[aimock] started at ${mock.url}`)

      await use(mock)

      await mock.stop()
      console.log(`[aimock] stopped`)
    },
    { scope: 'worker' },
  ],
})

// Reset match counts before each test so sequenceIndex starts fresh
test.beforeEach(async ({ aimock }) => {
  aimock.resetMatchCounts()
})

export { expect } from '@playwright/test'
