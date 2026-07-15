import { createFileRoute } from '@tanstack/react-router'
import { blogTransaction } from '../lib/blog-studio'

export const Route = createFileRoute('/api/blog-studio')({
  server: {
    handlers: {
      // One endpoint, four verbs. `defineTransaction` is inert until
      // `handler(request)` runs, at which point it parses the AG-UI request,
      // routes by the `verb` discriminator the client sends, and streams the
      // result back over SSE.
      POST: ({ request }) => blogTransaction.handler(request),
    },
  },
})
