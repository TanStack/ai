import { createFileRoute } from '@tanstack/react-router'
import { blogPlugin } from '../lib/blog-studio'

export const Route = createFileRoute('/api/blog-studio')({
  server: {
    handlers: {
      // One endpoint, three plugins. `definePlugin` is inert until
      // `handler(request)` runs, at which point it parses the AG-UI request,
      // routes by the `plugin` discriminator the client sends, and streams the
      // result back over SSE.
      POST: ({ request }) => blogPlugin.handler(request),
    },
  },
})
