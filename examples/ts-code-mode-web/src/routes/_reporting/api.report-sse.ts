import { createFileRoute } from '@tanstack/react-router'
import {
  getReportState,
  setSSEController,
  getSSEController,
} from '@/lib/reports/report-storage'

export const Route = createFileRoute('/_reporting/api/report-sse' as any)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const reportId = url.searchParams.get('reportId')

        console.log('[SSE] Connection request for reportId:', reportId)

        if (!reportId) {
          console.log('[SSE] Missing reportId')
          return new Response('Missing reportId', { status: 400 })
        }

        const reportState = getReportState(reportId)
        if (!reportState) {
          console.log('[SSE] Report not found:', reportId)
          return new Response('Report not found', { status: 404 })
        }

        console.log('[SSE] Creating stream for reportId:', reportId)

        // Create SSE stream
        // We need to track this specific controller to avoid race conditions
        // where an old connection closing wipes out a new connection's controller
        let thisController: ReadableStreamDefaultController<Uint8Array> | null =
          null

        const stream = new ReadableStream({
          start(controller) {
            thisController = controller
            console.log('[SSE] Stream started for reportId:', reportId)
            // Store controller for pushing updates
            setSSEController(reportId, controller)

            // Send initial connection message
            const message = `data: ${JSON.stringify({ type: 'connected', reportId })}\n\n`
            controller.enqueue(new TextEncoder().encode(message))

            // Send keep-alive ping every 30 seconds
            const keepAliveInterval = setInterval(() => {
              try {
                const ping = `data: ${JSON.stringify({ type: 'ping' })}\n\n`
                controller.enqueue(new TextEncoder().encode(ping))
              } catch {
                // Controller may be closed
                clearInterval(keepAliveInterval)
              }
            }, 30000)

            // Clean up on close - only clear if this is still the active controller
            request.signal.addEventListener('abort', () => {
              clearInterval(keepAliveInterval)
              // Only clear the controller if it's still ours
              const currentController = getSSEController(reportId)
              if (currentController === thisController) {
                console.log(
                  '[SSE] Cleaning up controller for reportId:',
                  reportId,
                )
                setSSEController(reportId, undefined)
              } else {
                console.log(
                  '[SSE] Skipping cleanup - controller has been replaced for reportId:',
                  reportId,
                )
              }
            })
          },
          cancel() {
            // Clean up on client disconnect - only clear if this is still the active controller
            const currentController = getSSEController(reportId)
            if (currentController === thisController) {
              console.log('[SSE] Cancel cleanup for reportId:', reportId)
              setSSEController(reportId, undefined)
            } else {
              console.log(
                '[SSE] Skipping cancel cleanup - controller has been replaced for reportId:',
                reportId,
              )
            }
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
