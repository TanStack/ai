import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { ORDERS } from '@/features/orders/data'

export const Route = createFileRoute('/api/orders')({
  server: {
    handlers: {
      GET: () => json(ORDERS),
    },
  },
})
