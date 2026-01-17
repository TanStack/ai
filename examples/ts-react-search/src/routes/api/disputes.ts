import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { DISPUTES } from '@/features/disputes/data'

export const Route = createFileRoute('/api/disputes')({
  server: {
    handlers: {
      GET: () => json(DISPUTES),
    },
  },
})
