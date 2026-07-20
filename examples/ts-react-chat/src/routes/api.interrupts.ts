import { createFileRoute } from '@tanstack/react-router'
import { createInterruptLabPost } from '@/lib/interrupt-lab/server'

export const interruptLabRouteConfig = { mode: 'ephemeral' } as const
export const interruptLabPost = createInterruptLabPost(interruptLabRouteConfig)

export const Route = createFileRoute('/api/interrupts')({
  server: {
    handlers: {
      POST: ({ request }) => interruptLabPost(request),
    },
  },
})
