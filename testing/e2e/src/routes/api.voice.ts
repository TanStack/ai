import { createFileRoute } from '@tanstack/react-router'
import { generateVoice } from '@tanstack/ai'
import { createElevenLabsVoiceDesign } from '@tanstack/ai-elevenlabs'
import type { Provider } from '@/lib/types'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

function llmockBase(aimockPort?: number): string {
  if (aimockPort) return `http://127.0.0.1:${aimockPort}`
  return LLMOCK_BASE
}

function testHeaders(testId?: string): Record<string, string> | undefined {
  return testId ? { 'X-Test-Id': testId } : undefined
}

/**
 * Voice-design adapters pointed at aimock.
 *
 * ElevenLabs is the only provider adapted for `generateVoice` today. aimock
 * 1.34 has no `/v1/text-to-voice` routes at all, so both the design and the
 * create halves are served by `elevenlabsVoiceMount` in global-setup.ts.
 */
function createVoiceAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
) {
  if (provider !== 'elevenlabs') return undefined
  return createElevenLabsVoiceDesign('eleven_ttv_v3', DUMMY_KEY, {
    baseUrl: llmockBase(aimockPort),
    headers: testHeaders(testId),
  })
}

export const Route = createFileRoute('/api/voice')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const data = body.forwardedProps ?? body.data ?? body
        const { prompt, name, provider, testId, aimockPort } = data as {
          prompt: string
          name?: string
          provider: Provider
          testId?: string
          aimockPort?: number
        }

        try {
          const adapter = createVoiceAdapter(provider, aimockPort, testId)
          if (!adapter) {
            return new Response(
              JSON.stringify({
                error: `Provider ${provider} does not support voice design`,
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }
          // generateVoice() is Promise-based — there is no streaming variant
          // worth exercising here, the same as embed().
          const result = await generateVoice({
            adapter,
            prompt,
            ...(name ? { name } : {}),
          })
          return new Response(
            JSON.stringify({
              model: result.model,
              previewText: result.previewText,
              voices: result.voices,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        } catch (error) {
          console.error('[api.voice] Error:', error)
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
