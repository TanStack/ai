import { createFileRoute } from '@tanstack/react-router'
import {
  getInterruptRecoveryState,
  withChatPersistence,
} from '@tanstack/ai-persistence'
import { createInterruptLabPersistence } from '@/lib/interrupt-lab/persistence'
import { createInterruptLabPost } from '@/lib/interrupt-lab/server'

export const durableInterruptLabPersistence = createInterruptLabPersistence()
export const durableInterruptLabMiddleware = withChatPersistence(
  durableInterruptLabPersistence,
)
export const durableInterruptLabRouteConfig = {
  mode: 'durable',
  persistenceMiddleware: durableInterruptLabMiddleware,
} as const
export const durableInterruptLabPost = createInterruptLabPost(
  durableInterruptLabRouteConfig,
)

export async function durableInterruptLabRequest(
  request: Request,
): Promise<Response> {
  const url = new URL(request.url)
  const threadId = url.searchParams.get('threadId')
  const interruptedRunId = url.searchParams.get('interruptedRunId')
  const knownGenerationText = url.searchParams.get('knownGeneration')
  const isRecoveryRequest =
    threadId !== null ||
    interruptedRunId !== null ||
    knownGenerationText !== null

  if (!isRecoveryRequest) return durableInterruptLabPost(request)

  const knownGeneration = Number(knownGenerationText)
  if (
    !threadId ||
    !interruptedRunId ||
    knownGenerationText === null ||
    !Number.isSafeInteger(knownGeneration) ||
    knownGeneration < 0
  ) {
    return new Response(
      JSON.stringify({ error: 'Invalid interrupt recovery query.' }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    )
  }

  const state = await getInterruptRecoveryState(
    durableInterruptLabPersistence.stores.interrupts,
    { threadId, interruptedRunId, knownGeneration },
  )
  return Response.json(state)
}

export const Route = createFileRoute('/api/durable-interrupts')({
  server: {
    handlers: {
      POST: ({ request }) => durableInterruptLabRequest(request),
    },
  },
})
