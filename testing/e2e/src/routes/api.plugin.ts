import { createFileRoute } from '@tanstack/react-router'
import { bannerImage, e2ePlugin } from '@/lib/e2e-plugin'

export const Route = createFileRoute('/api/plugin')({
  server: {
    handlers: {
      // One endpoint, three plugins (`primaryChat` / `banner` / `bannerImage`).
      // `definePlugin` is inert until `handler(request)` runs, at which point
      // it parses the AG-UI request, routes by the `plugin` discriminator the
      // client sends, and streams the result back over SSE.
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        return e2ePlugin.handler(request)
      },
      // Direct in-process `.run()` call — no AG-UI/SSE envelope, no HTTP hop
      // to another server. Proves the `bannerImage` one-shot media plugin's
      // `.run()` executes the adapter directly and returns the typed
      // `ImageGenerationResult`, which is wrapped in a `Response` here (the
      // `POST` handler above is the one that streams via `handler(request)`).
      GET: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const { searchParams } = new URL(request.url)
        const provider = searchParams.get('provider') ?? 'openai'
        const testId = searchParams.get('testId') ?? undefined
        const aimockPortParam = searchParams.get('aimockPort')
        const aimockPort = aimockPortParam
          ? Number.parseInt(aimockPortParam, 10)
          : undefined

        const result = await bannerImage.run(
          { prompt: 'solo banner image' },
          { forwardedProps: { provider, testId, aimockPort } },
        )
        return Response.json(result)
      },
    },
  },
})
