import { test as base } from '@playwright/test'
import { LLMock } from '@copilotkit/aimock'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export type AIMockFixture = {
  aimock: LLMock
  testId: string
  aimockPort: number
}

export const test = base.extend<AIMockFixture>({
  // Worker-scoped: one aimock per worker on a unique port
  aimockPort: [
    async ({}, use, workerInfo) => {
      await use(4010 + workerInfo.workerIndex)
    },
    { scope: 'worker' },
  ],

  aimock: [
    async ({ aimockPort }, use) => {
      const mock = new LLMock({
        port: aimockPort,
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
      console.log(`[aimock] started on port ${aimockPort}`)

      await use(mock)

      await mock.stop()
      console.log(`[aimock] stopped port ${aimockPort}`)
    },
    { scope: 'worker' },
  ],

  // Test-scoped: unique ID per test for sequenceIndex isolation
  testId: async ({}, use, testInfo) => {
    const id = `${testInfo.workerIndex}-${testInfo.testId}`
    await use(id)
  },
})

export { expect } from '@playwright/test'
