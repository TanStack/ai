import { createFileRoute } from '@tanstack/react-router'
import { asyncRegistry } from '@/lib/audio/async-registry'

/**
 * API endpoint for resolving pending async requests from the client
 *
 * When a VM tool needs client-side data (e.g., audio from file picker or mic),
 * it creates a pending request in the async registry and emits an event to the client.
 * The client performs the operation and POSTs the result here to resolve the promise.
 *
 * Request body:
 * - requestId: string - The unique request ID from the event
 * - data?: any - The data to resolve the request with (on success)
 * - error?: string - Error message to reject the request with (on failure)
 */
export const Route = createFileRoute('/api/audio-resolve')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const { requestId, data, error } = body

          console.log(`[AudioResolve] Received request: ${requestId}`)
          console.log(`[AudioResolve] Has data: ${data !== undefined}, Has error: ${!!error}`)

          if (!requestId) {
            return new Response(
              JSON.stringify({ success: false, error: 'requestId is required' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Check if this is an error response
          if (error) {
            const rejected = asyncRegistry.rejectRequest(requestId, error)
            return new Response(
              JSON.stringify({
                success: rejected,
                action: 'rejected',
                found: rejected,
              }),
              {
                status: rejected ? 200 : 404,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Resolve the request with the provided data
          const resolved = asyncRegistry.resolveRequest(requestId, data)
          return new Response(
            JSON.stringify({
              success: resolved,
              action: 'resolved',
              found: resolved,
            }),
            {
              status: resolved ? 200 : 404,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (err: unknown) {
          console.error('[AudioResolve] Error:', err)
          return new Response(
            JSON.stringify({
              success: false,
              error: err instanceof Error ? err.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },

      // GET endpoint for debugging - shows pending requests
      GET: async () => {
        const pendingInfo = asyncRegistry.getPendingInfo()
        return new Response(
          JSON.stringify({
            pendingCount: asyncRegistry.getPendingCount(),
            pending: pendingInfo,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      },
    },
  },
})

