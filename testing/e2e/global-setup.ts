import { LLMock } from '@copilotkit/aimock'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Directories to skip when loading JSON fixtures.
 * - 'recorded' is for record-mode output
 * - 'video-gen' uses programmatic registration (needs match.endpoint)
 */
const SKIP_FIXTURE_DIRS = new Set(['recorded', 'video-gen'])

export default async function globalSetup() {
  const mock = new LLMock({ port: 4010, host: '127.0.0.1', logLevel: 'info' })

  // Load all JSON fixture directories (except skipped ones)
  const fixturesDir = path.resolve(__dirname, 'fixtures')
  const entries = fs.readdirSync(fixturesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && !SKIP_FIXTURE_DIRS.has(entry.name)) {
      await mock.loadFixtureDir(path.join(fixturesDir, entry.name))
    }
  }

  // Register media fixtures programmatically (require match.endpoint)
  registerMediaFixtures(mock)

  await mock.start()
  console.log(`[aimock] started on port 4010`)
  ;(globalThis as any).__aimock = mock
}

function registerMediaFixtures(mock: LLMock) {
  // Transcription: onTranscription sets match.endpoint = "transcription"
  mock.onTranscription({
    transcription: {
      text: 'I would like to buy a Fender Stratocaster please',
    },
  })

  // Video: onVideo sets match.endpoint = "video"
  // id + status are required for the OpenAI SDK's videos API to work:
  // - POST /v1/videos reads response.id for the job ID
  // - GET /v1/videos/{id} reads response.status to determine completion
  mock.onVideo('a guitar being played in a store', {
    video: {
      url: 'https://example.com/guitar-store.mp4',
      duration: 10,
      id: 'video-job-e2e',
      status: 'completed',
    },
  })
}
