import { LLMock } from '@copilotkit/aimock'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { fileURLToPath } from 'url'
import type { Mountable } from '@copilotkit/aimock'

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

  // Mount xAI-shaped audio routes (/v1/tts, /v1/stt) — these are NOT
  // OpenAI-compatible so aimock's onSpeech/onTranscription helpers don't cover
  // them. Use mock.mount() to handle the paths directly.
  mock.mount('/v1/tts', grokTTSMount())
  mock.mount('/v1/stt', grokSTTMount())

  // ElevenLabs TTS (/v1/text-to-speech/{voiceId}) and STT (/v1/speech-to-text)
  // are not yet covered by aimock helpers (1.17 added /v1/sound-generation
  // and /v1/music/* but not these). Mount them here following the grok
  // pattern above.
  mock.mount('/v1/text-to-speech', elevenLabsTTSMount())
  mock.mount('/v1/speech-to-text', elevenLabsSTTMount())

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

  // ElevenLabs music (/v1/music/*) and SFX (/v1/sound-generation) are
  // covered natively by aimock 1.17 — fixtures live under
  // fixtures/audio-gen/ and fixtures/sound-effects/ and are loaded by the
  // generic loadFixtureDir() loop above.
}

/**
 * Minimal MP3 bytes — just enough for the <audio> element to consider it a
 * valid media resource in tests. The e2e specs only check visibility of the
 * `generated-audio` element, not playback fidelity.
 */
const FAKE_MP3_BYTES = Buffer.from([
  0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
])

function grokTTSMount(): Mountable {
  return {
    async handleRequest(
      req: http.IncomingMessage,
      res: http.ServerResponse,
      // aimock strips the mount prefix — pathname will be "/" for an exact match.
      pathname: string,
    ): Promise<boolean> {
      if (pathname !== '/' || req.method !== 'POST') return false
      // Drain the request body (we don't need to inspect it for tests).
      await drainBody(req)
      res.statusCode = 200
      res.setHeader('Content-Type', 'audio/mpeg')
      res.setHeader('Content-Length', String(FAKE_MP3_BYTES.length))
      res.end(FAKE_MP3_BYTES)
      return true
    },
  }
}

function grokSTTMount(): Mountable {
  return {
    async handleRequest(
      req: http.IncomingMessage,
      res: http.ServerResponse,
      pathname: string,
    ): Promise<boolean> {
      if (pathname !== '/' || req.method !== 'POST') return false
      await drainBody(req)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          text: 'I would like to buy a Fender Stratocaster please',
          language: 'en',
          duration: 3.0,
          words: [
            { text: 'I', start: 0, end: 0.1, confidence: 0.99 },
            { text: 'would', start: 0.1, end: 0.3, confidence: 0.98 },
            { text: 'like', start: 0.3, end: 0.5, confidence: 0.97 },
            { text: 'to', start: 0.5, end: 0.6, confidence: 0.99 },
            { text: 'buy', start: 0.6, end: 0.8, confidence: 0.98 },
            { text: 'a', start: 0.8, end: 0.9, confidence: 0.99 },
            { text: 'Fender', start: 0.9, end: 1.3, confidence: 0.96 },
            { text: 'Stratocaster', start: 1.3, end: 2.0, confidence: 0.94 },
            { text: 'please', start: 2.0, end: 2.4, confidence: 0.97 },
          ],
        }),
      )
      return true
    },
  }
}

function elevenLabsTTSMount(): Mountable {
  return {
    async handleRequest(
      req: http.IncomingMessage,
      res: http.ServerResponse,
      pathname: string,
    ): Promise<boolean> {
      // ElevenLabs TTS hits POST /v1/text-to-speech/{voiceId} or
      // /v1/text-to-speech/{voiceId}/stream. After mount-prefix stripping
      // pathname will be /{voiceId} or /{voiceId}/stream — accept any
      // sub-path so we don't have to enumerate voice IDs.
      if (req.method !== 'POST' || pathname === '/' || pathname === '')
        return false
      await drainBody(req)
      res.statusCode = 200
      res.setHeader('Content-Type', 'audio/mpeg')
      res.setHeader('Content-Length', String(FAKE_MP3_BYTES.length))
      res.end(FAKE_MP3_BYTES)
      return true
    },
  }
}

function elevenLabsSTTMount(): Mountable {
  return {
    async handleRequest(
      req: http.IncomingMessage,
      res: http.ServerResponse,
      pathname: string,
    ): Promise<boolean> {
      if (pathname !== '/' || req.method !== 'POST') return false
      await drainBody(req)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      // Scribe wire format is snake_case (the SDK converts to camelCase
      // before handing the response to user code). Each word needs a
      // `logprob` field per the SDK's runtime validation. Keep "Fender
      // Stratocaster" so the existing transcription.spec.ts assertion
      // passes for elevenlabs too.
      res.end(
        JSON.stringify({
          language_code: 'en',
          language_probability: 0.99,
          text: 'I would like to buy a Fender Stratocaster please',
          audio_duration_secs: 2.4,
          words: [
            { text: 'I', start: 0, end: 0.1, type: 'word', logprob: -0.01 },
            {
              text: 'would',
              start: 0.1,
              end: 0.3,
              type: 'word',
              logprob: -0.02,
            },
            {
              text: 'like',
              start: 0.3,
              end: 0.5,
              type: 'word',
              logprob: -0.03,
            },
            { text: 'to', start: 0.5, end: 0.6, type: 'word', logprob: -0.01 },
            { text: 'buy', start: 0.6, end: 0.8, type: 'word', logprob: -0.02 },
            { text: 'a', start: 0.8, end: 0.9, type: 'word', logprob: -0.01 },
            {
              text: 'Fender',
              start: 0.9,
              end: 1.3,
              type: 'word',
              logprob: -0.04,
            },
            {
              text: 'Stratocaster',
              start: 1.3,
              end: 2.0,
              type: 'word',
              logprob: -0.06,
            },
            {
              text: 'please',
              start: 2.0,
              end: 2.4,
              type: 'word',
              logprob: -0.03,
            },
          ],
        }),
      )
      return true
    },
  }
}

function drainBody(req: http.IncomingMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    req.on('data', () => {})
    req.on('end', () => resolve())
    req.on('error', reject)
  })
}
