import { createFileRoute } from '@tanstack/react-router'
import type { RefreshResult } from '@/lib/reports/types'
import { getReportState, getSSEController } from '@/lib/reports/report-storage'
import { refreshComponent } from '@/lib/reports/refresh-component'
import { evaluateWatchersForSignals } from '@/lib/reports/evaluate-watchers'

export const Route = createFileRoute('/_reporting/api/invalidate' as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { reportId, signals } = body

        console.log('[Invalidate] Request received:', { reportId, signals })

        if (!reportId || !signals || !Array.isArray(signals)) {
          console.log('[Invalidate] Missing reportId or signals')
          return new Response(
            JSON.stringify({ error: 'Missing reportId or signals array' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const reportState = getReportState(reportId)
        if (!reportState) {
          console.log('[Invalidate] Report not found:', reportId)
          return new Response(JSON.stringify({ error: 'Report not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        console.log('[Invalidate] Report found, nodes:', reportState.nodes.size)

        // Collect all subscribers for the invalidated signals
        const subscribersToRefresh = new Set<string>()
        for (const signal of signals) {
          const subscribers = reportState.signalRegistry.getSubscribers(signal)
          console.log(
            `[Invalidate] Signal "${signal}" subscribers:`,
            Array.from(subscribers),
          )
          for (const subscriberId of subscribers) {
            subscribersToRefresh.add(subscriberId)
          }
        }

        console.log(
          '[Invalidate] Total subscribers to refresh:',
          Array.from(subscribersToRefresh),
        )

        // Refresh each subscriber
        const refreshResults: RefreshResult[] = []
        for (const componentId of subscribersToRefresh) {
          console.log('[Invalidate] Refreshing component:', componentId)
          const result = await refreshComponent(reportState, componentId)
          console.log('[Invalidate] Refresh result:', result)
          refreshResults.push(result)
        }

        console.log(
          '[Invalidate] Total refresh results:',
          refreshResults.length,
        )

        // Evaluate watchers for the invalidated signals
        const invalidatedSignals = new Set(signals as string[])
        const watcherResults = await evaluateWatchersForSignals(
          reportState,
          invalidatedSignals,
        )

        // Push updates via SSE if connected
        const sseController = getSSEController(reportId)
        console.log('[Invalidate] SSE controller exists:', !!sseController)

        if (sseController) {
          // Push component refresh results
          if (refreshResults.length > 0) {
            const refreshMessage = `data: ${JSON.stringify({
              type: 'refresh',
              results: refreshResults,
            })}\n\n`
            console.log('[Invalidate] Pushing refresh message via SSE')
            try {
              sseController.enqueue(new TextEncoder().encode(refreshMessage))
              console.log('[Invalidate] SSE message pushed successfully')
            } catch (e) {
              console.log('[Invalidate] SSE push failed:', e)
            }
          }

          // Push watcher effects (toasts, etc.)
          if (watcherResults.effects.length > 0) {
            const effectsMessage = `data: ${JSON.stringify({
              type: 'effects',
              effects: watcherResults.effects,
            })}\n\n`
            try {
              sseController.enqueue(new TextEncoder().encode(effectsMessage))
            } catch {
              // Connection may have closed
            }
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            refreshed: refreshResults.length,
            results: refreshResults,
            watcherResults: watcherResults.results,
            effects: watcherResults.effects,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
