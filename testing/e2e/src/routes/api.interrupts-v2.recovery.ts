import { createFileRoute } from '@tanstack/react-router'
import { createInterruptRecoveryHandler } from '@tanstack/ai-persistence'
import { getInterruptFixture } from '../lib/interrupts-v2-fixture'

export const Route = createFileRoute('/api/interrupts-v2/recovery')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const testId = new URL(request.url).searchParams.get('testId')
        if (!testId) return new Response('Missing testId', { status: 400 })
        const fixture = getInterruptFixture(testId)
        const handleRecovery = createInterruptRecoveryHandler({
          gateway: fixture.persistence.stores.interrupts,
          authorize: (recoveryRequest) => ({
            authorized:
              recoveryRequest.headers.get('x-interrupt-fixture') === testId,
            includeResolutions: true,
          }),
        })
        return handleRecovery(request)
      },
    },
  },
})
