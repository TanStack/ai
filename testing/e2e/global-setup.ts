import { LLMock } from '@copilotkit/aimock'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default async function globalSetup() {
  const mock = new LLMock({ port: 4010, host: '127.0.0.1', logLevel: 'info' })

  const fixturesDir = path.resolve(__dirname, 'fixtures')
  const entries = fs.readdirSync(fixturesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== 'recorded') {
      await mock.loadFixtureDir(path.join(fixturesDir, entry.name))
    }
  }

  await mock.start()
  console.log(`[aimock] started on port 4010`)
  ;(globalThis as any).__aimock = mock
}
