import { createFileRoute } from '@tanstack/react-router'
import { e2ePlugin } from '@/lib/e2e-plugin'

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
    },
  },
})
