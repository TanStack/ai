import { createFileRoute } from '@tanstack/react-router'
import { createHarnessHandler } from '@tanstack/ai-harness'
import {
  authorize,
  getHost,
  harnessFor,
  harnessRegistry,
} from '@/server/harness'
import '@/server/meta'

// The harness protocol for every agent on the host: `run`, `events`, `control`,
// `snapshot`, `transcript`, `describe`, `sessions`. `?harness=<name>` picks the
// agent. Without it, the thread's recorded agent is used.
const handlers = new Map<string, (request: Request) => Promise<Response>>()

function handlerFor(name: string) {
  let handler = handlers.get(name)
  if (!handler) {
    handler = createHarnessHandler({
      host: getHost(),
      harness: harnessRegistry[name]!,
      authorize,
    })
    handlers.set(name, handler)
  }
  return handler
}

async function dispatch(request: Request) {
  const params = new URL(request.url).searchParams
  const harness = await harnessFor(
    params.get('threadId') ?? '',
    params.get('harness'),
  )
  return handlerFor(harness.name)(request)
}

export const Route = createFileRoute('/api/harness/$')({
  server: {
    handlers: {
      GET: ({ request }) => dispatch(request),
      POST: ({ request }) => dispatch(request),
      PATCH: ({ request }) => dispatch(request),
      DELETE: ({ request }) => dispatch(request),
    },
  },
})
