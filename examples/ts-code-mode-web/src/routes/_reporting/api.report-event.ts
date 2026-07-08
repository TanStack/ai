import { createFileRoute } from '@tanstack/react-router'
import type {
  HandlerResult,
  RefreshResult,
  UIEffect,
  UIUpdate,
} from '@/lib/reports/types'
import {
  getReportState,
  applyReportUIUpdates,
} from '@/lib/reports/report-storage'
import {
  createHandlerBindings,
  getInvalidatedSignals,
} from '@/lib/reports/create-handler-bindings'
import { refreshComponent } from '@/lib/reports/refresh-component'
import { evaluateWatchersForSignals } from '@/lib/reports/evaluate-watchers'

export const Route = createFileRoute('/_reporting/api/report-event' as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { reportId, componentId, handlerName, eventData } = body

        if (!reportId || !componentId || !handlerName) {
          return new Response(
            JSON.stringify({
              error: 'Missing reportId, componentId, or handlerName',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const reportState = getReportState(reportId)
        if (!reportState) {
          return new Response(JSON.stringify({ error: 'Report not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const component = reportState.nodes.get(componentId)
        if (!component) {
          return new Response(
            JSON.stringify({ error: 'Component not found' }),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        const handlerCode = component.handlers?.[handlerName]
        if (!handlerCode) {
          return new Response(
            JSON.stringify({
              error: `No handler '${handlerName}' on component`,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          )
        }

        console.log('[HandlerExec] ========================================')
        console.log('[HandlerExec] Component:', componentId)
        console.log('[HandlerExec] Handler:', handlerName)
        console.log('[HandlerExec] Code:\n', handlerCode)
        console.log('[HandlerExec] ----------------------------------------')

        const { createIsolateDriver } =
          await import('@/lib/create-isolate-driver')
        const driver = await createIsolateDriver('node')
        const effects: UIEffect[] = []
        const uiUpdates: UIUpdate[] = []
        const calledBindings: string[] = []

        const bindings = createHandlerBindings({
          report: reportState.report,
          onEffect: (effect) => {
            console.log('[HandlerExec] Effect:', effect)
            effects.push(effect)
          },
          onUIUpdate: (update) => {
            console.log('[HandlerExec] UI Update:', update)
            uiUpdates.push(update)
          },
          onBindingCall: (name) => {
            console.log('[HandlerExec] Binding called:', name)
            calledBindings.push(name)
          },
        })

        const isolateContext = await driver.createContext({
          bindings,
          timeout: 5000,
          memoryLimit: 64,
        })

        let result: HandlerResult

        try {
          const event = {
            componentId,
            handlerName,
            data: eventData || {},
          }
          const wrappedCode = `
const event = ${JSON.stringify(event)};
(async () => {
  ${handlerCode}
})()
`
          const executionResult = await isolateContext.execute(wrappedCode)
          console.log('[HandlerExec] Execution result:', executionResult)

          if (executionResult.success) {
            result = {
              success: true,
              result: executionResult.value,
              effects,
              uiUpdates,
            }
          } else {
            console.log(
              '[HandlerExec] Execution failed:',
              executionResult.error,
            )
            result = {
              success: false,
              error:
                executionResult.error?.message ?? 'Unknown execution error',
              effects,
              uiUpdates,
            }
          }
        } catch (error) {
          console.log('[HandlerExec] Exception:', error)
          result = {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            effects,
            uiUpdates,
          }
        } finally {
          await isolateContext.dispose()
        }

        console.log('[HandlerExec] Final result:', {
          success: result.success,
          error: result.error,
        })
        console.log('[HandlerExec] ========================================')

        if (uiUpdates.length > 0) {
          applyReportUIUpdates(reportId, uiUpdates)
        }

        // Collect all invalidated signals from called bindings
        const invalidatedSignals = new Set<string>()
        console.log('[HandlerExec] Called bindings:', calledBindings)
        for (const bindingName of calledBindings) {
          const signals = getInvalidatedSignals(bindingName)
          console.log(
            '[HandlerExec] Binding',
            bindingName,
            'invalidates:',
            signals,
          )
          for (const signal of signals) {
            invalidatedSignals.add(signal)
          }
        }
        console.log(
          '[HandlerExec] Total invalidated signals:',
          Array.from(invalidatedSignals),
        )

        // Refresh all subscribers of invalidated signals
        const refreshResults: RefreshResult[] = []
        if (invalidatedSignals.size > 0 && reportState.signalRegistry) {
          const subscribersToRefresh = new Set<string>()
          for (const signal of invalidatedSignals) {
            const subscribers =
              reportState.signalRegistry.getSubscribers(signal)
            console.log(
              '[HandlerExec] Signal',
              signal,
              'has subscribers:',
              subscribers,
            )
            for (const subscriberId of subscribers) {
              subscribersToRefresh.add(subscriberId)
            }
          }
          console.log(
            '[HandlerExec] Components to refresh:',
            Array.from(subscribersToRefresh),
          )

          // Re-fetch current report state after UI updates
          const currentState = getReportState(reportId)
          if (currentState) {
            for (const subscriberId of subscribersToRefresh) {
              console.log('[HandlerExec] Refreshing component:', subscriberId)
              const refreshResult = await refreshComponent(
                currentState,
                subscriberId,
              )
              console.log('[HandlerExec] Refresh result:', refreshResult)
              refreshResults.push(refreshResult)
            }
          }
        } else {
          console.log(
            '[HandlerExec] No signals to invalidate or no signal registry',
          )
        }
        console.log(
          '[HandlerExec] Total refresh results:',
          refreshResults.length,
        )

        // Evaluate watchers for invalidated signals
        if (invalidatedSignals.size > 0) {
          const currentState = getReportState(reportId)
          if (currentState) {
            const watcherResults = await evaluateWatchersForSignals(
              currentState,
              invalidatedSignals,
            )
            // Add watcher-triggered effects to the response
            for (const effect of watcherResults.effects) {
              effects.push(effect as UIEffect)
            }
          }
        }

        // Include refresh results in the response
        result.refreshResults = refreshResults

        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
