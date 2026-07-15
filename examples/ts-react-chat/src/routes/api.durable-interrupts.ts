import { createFileRoute } from '@tanstack/react-router'
import { withChatPersistence } from '@tanstack/ai-persistence'
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

export const Route = createFileRoute('/api/durable-interrupts')({
  server: {
    handlers: {
      POST: ({ request }) => durableInterruptLabPost(request),
    },
  },
})
