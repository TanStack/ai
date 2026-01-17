import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { SETTLEMENTS } from '@/features/settlements/data'

export const Route = createFileRoute('/api/settlements')({
  server: {
    handlers: {
      GET: () => json(SETTLEMENTS),
    },
  },
})
