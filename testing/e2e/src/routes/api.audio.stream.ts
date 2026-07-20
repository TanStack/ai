import { createFileRoute } from '@tanstack/react-router'
import { generateAudio, toHttpResponse } from '@tanstack/ai'
import { createAudioAdapter } from '@/lib/media-providers'
import type { ElevenLabsAudioModel } from '@tanstack/ai-elevenlabs'
import type { Feature, Provider } from '@/lib/types'

// Map ElevenLabs audio model name → feature so the createAudioAdapter
// factory picks the right model variant. Music vs sound-effects diverge
// only in which `music_v1` / `eleven_text_to_sound_v*` model the
// elevenlabs branch hardcodes.
function modelToFeature(model: ElevenLabsAudioModel | undefined): Feature {
  if (
    model === 'eleven_text_to_sound_v1' ||
    model === 'eleven_text_to_sound_v2'
  ) {
    return 'sound-effects'
  }
  return 'audio-gen'
}

export const Route = createFileRoute('/api/audio/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.data ?? body
        const { prompt, model, duration, provider, testId, aimockPort } =
          data as {
            prompt: string
            model?: ElevenLabsAudioModel
            duration?: number
            provider: Provider
            testId?: string
            aimockPort?: number
          }

        const adapter = createAudioAdapter(
          provider,
          aimockPort,
          testId,
          modelToFeature(model),
        )

        try {
          const stream = generateAudio({
            adapter,
            prompt,
            ...(duration != null ? { duration } : {}),
            stream: true,
          })
          return toHttpResponse(stream, { abortController })
        } catch (error) {
          console.error('[api.audio.stream] Error:', error)
          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }
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
