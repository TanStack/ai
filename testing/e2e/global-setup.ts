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

  // Anthropic server_tool_use bug reproduction (issue #604). aimock can't
  // natively synthesize `server_tool_use` / `web_fetch_tool_result` content
  // blocks, so this mount hand-crafts the raw SSE Claude would emit when a
  // client `tool_use` is followed by a `web_fetch` `server_tool_use` in the
  // same response. The corresponding api.anthropic-bug-test.ts route points
  // the Anthropic adapter here.
  mock.mount('/anthropic-bug-test', anthropicServerToolBugMount())

  // OpenRouter per-request cost capture. aimock's OpenAI-compatible chat
  // helper doesn't synthesize OpenRouter's `usage.cost` / `usage.cost_details`,
  // and crucially those land on a trailing usage-only chunk (choices: []) that
  // arrives AFTER the finish_reason chunk. This mount hand-crafts that exact
  // wire shape so the companion spec can assert cost reaches RUN_FINISHED.usage.
  mock.mount('/openrouter-cost', openRouterCostMount())

  // OpenAI-compatible detailed usage capture. aimock's chat helper doesn't
  // synthesize `prompt_tokens_details` / `completion_tokens_details`, so this
  // mount hand-crafts a chat-completion stream whose trailing usage chunk
  // carries cached prompt tokens and reasoning completion tokens. The companion
  // spec asserts those reach `RUN_FINISHED.usage` as the canonical
  // `promptTokensDetails.cachedTokens` / `completionTokensDetails.reasoningTokens`.
  mock.mount('/openai-usage-details', openaiUsageDetailsMount())

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

/**
 * Mounts a Claude-shaped SSE response that includes a client `tool_use` block
 * followed by a `web_fetch` `server_tool_use` block, plus its
 * `web_fetch_tool_result`. Reproduces the streaming scenario from issue #604
 * — the adapter must not let server-tool `input_json_delta`s leak into the
 * prior client tool's input buffer.
 *
 * The first turn returns the mixed tool_use + server_tool_use response so the
 * adapter can dispatch the client tool. The second turn (after the client
 * tool result is fed back) returns a simple text completion so the agent
 * loop can settle.
 */
function anthropicServerToolBugMount(): Mountable {
  return {
    async handleRequest(
      req: http.IncomingMessage,
      res: http.ServerResponse,
      pathname: string,
    ): Promise<boolean> {
      // The Anthropic SDK posts to /v1/messages; query string (?beta=...)
      // is stripped from `pathname` by aimock before dispatch.
      if (req.method !== 'POST' || !pathname.startsWith('/v1/messages')) {
        return false
      }

      const bodyText = await readBody(req)
      let hasToolResult = false
      try {
        const body = JSON.parse(bodyText) as {
          messages?: Array<{
            role: string
            content?: Array<{ type: string }> | string
          }>
        }
        hasToolResult = (body.messages ?? []).some(
          (m) =>
            Array.isArray(m.content) &&
            m.content.some((c) => c.type === 'tool_result'),
        )
      } catch {
        // Malformed body — fall through and emit the first-turn stream.
      }

      const events = hasToolResult
        ? buildFollowUpEvents()
        : buildToolPlusServerToolEvents()

      res.statusCode = 200
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      for (const event of events) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      }
      res.end()
      return true
    },
  }
}

/**
 * Emits an OpenAI-compatible chat-completion SSE stream that ends with a
 * usage-only trailing chunk carrying OpenRouter's `cost` / `cost_details`.
 * Snake_case on the wire is camelCased by the `@openrouter/sdk` parser, so the
 * adapter sees `usage.cost` and `usage.costDetails.upstreamInferenceCost`.
 */
function openRouterCostMount(): Mountable {
  return {
    async handleRequest(
      req: http.IncomingMessage,
      res: http.ServerResponse,
      pathname: string,
    ): Promise<boolean> {
      // The mount prefix (/openrouter-cost) is stripped before dispatch; the
      // SDK posts to <serverURL>/chat/completions where serverURL ends in /v1.
      if (
        req.method !== 'POST' ||
        !pathname.startsWith('/v1/chat/completions')
      ) {
        return false
      }
      await drainBody(req)

      const base = {
        id: 'chatcmpl-cost-e2e',
        object: 'chat.completion.chunk',
        // The @openrouter/sdk chunk schema requires a numeric `created`.
        created: 1700000000,
        model: 'openai/gpt-4o',
      }
      const chunks: Array<Record<string, unknown>> = [
        {
          ...base,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Hi' },
              finish_reason: null,
            },
          ],
        },
        {
          ...base,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
        // Trailing usage-only chunk — the whole point of the test. Field names
        // mirror OpenRouter's CostDetails schema (camelCased by the SDK parser).
        {
          ...base,
          choices: [],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 3,
            total_tokens: 14,
            cost: 0.0042,
            cost_details: {
              upstream_inference_completions_cost: 0.0026,
              upstream_inference_cost: 0.0038,
              upstream_inference_prompt_cost: 0.0012,
            },
          },
        },
      ]

      res.statusCode = 200
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
      return true
    },
  }
}

/**
 * Emits an OpenAI-compatible chat-completion SSE stream that ends with a
 * usage-only chunk carrying `prompt_tokens_details` / `completion_tokens_details`.
 * The shared `@tanstack/openai-base` extractor normalizes these into the
 * canonical `TokenUsage` detail breakdowns, proving detailed usage survives
 * end-to-end through the chat pipeline.
 */
function openaiUsageDetailsMount(): Mountable {
  return {
    async handleRequest(
      req: http.IncomingMessage,
      res: http.ServerResponse,
      pathname: string,
    ): Promise<boolean> {
      // The mount prefix (/openai-usage-details) is stripped before dispatch;
      // the SDK posts to <serverURL>/chat/completions where serverURL ends /v1.
      if (
        req.method !== 'POST' ||
        !pathname.startsWith('/v1/chat/completions')
      ) {
        return false
      }
      await drainBody(req)

      const base = {
        id: 'chatcmpl-usage-details-e2e',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'gpt-4o',
      }
      const chunks: Array<Record<string, unknown>> = [
        {
          ...base,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Hi' },
              finish_reason: null,
            },
          ],
        },
        {
          ...base,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
        // Trailing usage-only chunk with detailed breakdowns — the point of the
        // test. Mirrors OpenAI's `stream_options: { include_usage: true }` shape.
        {
          ...base,
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_tokens_details: { cached_tokens: 80 },
            completion_tokens_details: { reasoning_tokens: 30 },
          },
        },
      ]

      res.statusCode = 200
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
      return true
    },
  }
}

function buildToolPlusServerToolEvents(): Array<Record<string, unknown>> {
  const messageId = 'msg_bug_604'
  const model = 'claude-sonnet-4-5'
  return [
    {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 0 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: 'toolu_client_weather',
        name: 'lookup_weather',
        input: {},
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"location":"Berlin"}',
      },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: {
        type: 'server_tool_use',
        id: 'srvtoolu_web_fetch',
        name: 'web_fetch',
        input: {},
      },
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: {
        type: 'input_json_delta',
        partial_json: '{"url":"https://example.com"}',
      },
    },
    { type: 'content_block_stop', index: 1 },
    {
      type: 'content_block_start',
      index: 2,
      content_block: {
        type: 'web_fetch_tool_result',
        tool_use_id: 'srvtoolu_web_fetch',
        content: {
          type: 'web_fetch_result',
          url: 'https://example.com',
          content: {
            type: 'document',
            source: { type: 'text', media_type: 'text/plain', data: 'ok' },
          },
          retrieved_at: '2026-01-01T00:00:00Z',
        },
      },
    },
    { type: 'content_block_stop', index: 2 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: 'message_stop' },
  ]
}

function buildFollowUpEvents(): Array<Record<string, unknown>> {
  const messageId = 'msg_bug_604_followup'
  const model = 'claude-sonnet-4-5'
  return [
    {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 30, output_tokens: 0 },
      },
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Berlin is sunny.' },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ]
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Array<Buffer> = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function drainBody(req: http.IncomingMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    req.on('data', () => {})
    req.on('end', () => resolve())
    req.on('error', reject)
  })
}
