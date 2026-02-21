import { createFileRoute } from '@tanstack/react-router'
import type { Report, UIEvent } from '@/lib/reports/types'
import {
  createReportState,
  getReportState,
  applyReportUIEvent,
  getSignalRegistry,
  setExcalidrawElements,
} from '@/lib/reports/report-storage'

const REPORT_ID = 'excalidraw-demo'

export const Route = createFileRoute('/api/excalidraw-init' as any)({
  server: {
    handlers: {
      POST: async () => {
        console.log('[ExcalidrawInit] Initializing diagram demo...')

        // Check if report already exists
        let reportState = getReportState(REPORT_ID)

        if (reportState) {
          console.log(
            '[ExcalidrawInit] Report already exists, returning current state',
          )
          return new Response(
            JSON.stringify({
              success: true,
              report: reportState.report,
              nodes: Object.fromEntries(reportState.nodes),
              rootIds: reportState.rootIds,
              isNew: false,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        }

        console.log('[ExcalidrawInit] Creating new diagram report')

        // Create the report
        const report: Report = {
          id: REPORT_ID,
          title: 'Diagram Builder',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        reportState = createReportState(report)
        const signalRegistry = getSignalRegistry(REPORT_ID)

        // Initialize empty excalidraw elements storage
        setExcalidrawElements(REPORT_ID, 'diagram', [])

        // Add initial components
        const events: UIEvent[] = [
          // Container card for the diagram
          {
            op: 'add',
            id: 'diagram-container',
            type: 'card',
            props: {
              title: 'Architecture Diagram',
              subtitle: 'Draw with AI or edit manually',
              variant: 'default',
            },
          },
          // Excalidraw canvas - use calc to fill available space
          {
            op: 'add',
            id: 'diagram',
            type: 'excalidraw',
            parentId: 'diagram-container',
            props: {
              width: '100%',
              height: 700,
              elements: [],
              viewModeEnabled: false,
              gridModeEnabled: false,
              theme: 'light',
            },
            subscriptions: ['diagram'],
            dataSource: `
              const elements = await external_excalidraw_get_elements({})
              return { elements }
            `,
          },
        ]

        // Apply all events
        for (const event of events) {
          applyReportUIEvent(REPORT_ID, event)

          // Register subscriptions for components that have them
          if (event.op === 'add' && event.subscriptions && signalRegistry) {
            for (const signal of event.subscriptions) {
              console.log(
                '[ExcalidrawInit] Registering subscription:',
                event.id,
                '->',
                signal,
              )
              signalRegistry.subscribe(event.id, signal)
            }
          }
        }

        // Log registered subscriptions
        if (signalRegistry) {
          console.log(
            '[ExcalidrawInit] Subscribers for "diagram":',
            signalRegistry.getSubscribers('diagram'),
          )
        }

        // Get the updated state
        const finalState = getReportState(REPORT_ID)!

        return new Response(
          JSON.stringify({
            success: true,
            report: finalState.report,
            nodes: Object.fromEntries(finalState.nodes),
            rootIds: finalState.rootIds,
            isNew: true,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
