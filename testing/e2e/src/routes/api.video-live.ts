import { createFileRoute } from '@tanstack/react-router'
import { generateVideo, type VideoAdapter } from '@tanstack/ai'

/**
 * Drives `generateVideo()` against an in-process live-session mock so the
 * token result shape is covered without a live Reactor connection.
 */
function mockLiveVideoAdapter(): VideoAdapter {
  return {
    kind: 'video',
    name: 'mock-video',
    model: 'helios',
    '~types': {} as VideoAdapter['~types'],
    availableDurations: () => ({ kind: 'none' }),
    snapDuration: () => undefined,
    createVideoJob: async (options) => ({
      jobId: 'video-e2e',
      model: 'reactor/helios',
      token: 'jwt-e2e',
      expiresAt: Date.now() + 60_000,
      prompt:
        typeof options.prompt === 'string' ? options.prompt : 'a default scene',
    }),
    getVideoStatus: async () => {
      throw new Error('live session')
    },
    getVideoUrl: async () => {
      throw new Error('live session')
    },
  }
}

export const Route = createFileRoute('/api/video-live')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { prompt?: unknown }
        const prompt =
          typeof body.prompt === 'string' ? body.prompt : 'a default scene'

        try {
          const result = await generateVideo({
            adapter: mockLiveVideoAdapter(),
            prompt,
            debug: false,
          })
          return Response.json({
            ok: true,
            model: result.model,
            prompt: result.prompt,
            hasToken: Boolean(result.token && result.token.length > 0),
          })
        } catch (error) {
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'unknown',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
