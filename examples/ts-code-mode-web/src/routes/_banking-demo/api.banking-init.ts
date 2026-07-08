import { createFileRoute } from '@tanstack/react-router'
import type { Report, UIEvent } from '@/lib/reports/types'
import {
  createReportState,
  getReportState,
  applyReportUIEvent,
  getSignalRegistry,
} from '@/lib/reports/report-storage'
import { getMockBalances } from '@/lib/reports/create-handler-bindings'

const DASHBOARD_ID = 'dashboard'

export const Route = createFileRoute('/_banking-demo/api/banking-init' as any)({
  server: {
    handlers: {
      POST: async () => {
        console.log('[BankingInit] Initializing dashboard...')

        // Check if dashboard already exists
        let reportState = getReportState(DASHBOARD_ID)

        if (reportState) {
          console.log(
            '[BankingInit] Dashboard already exists, returning current state',
          )
          // Dashboard already exists, return its current state
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

        console.log('[BankingInit] Creating new dashboard')
        // Create the dashboard report
        const report: Report = {
          id: DASHBOARD_ID,
          title: 'Banking Dashboard',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        reportState = createReportState(report)
        const signalRegistry = getSignalRegistry(DASHBOARD_ID)

        // Get initial balances
        const balances = getMockBalances()
        console.log('[BankingInit] Initial balances:', balances)

        // Add initial components
        const events: UIEvent[] = [
          // Horizontal row for balance cards
          {
            op: 'add',
            id: 'balances-row',
            type: 'hbox',
            props: { gap: 'lg', justify: 'center' },
          },
          // Checking card
          {
            op: 'add',
            id: 'checking-card',
            type: 'card',
            parentId: 'balances-row',
            props: { title: 'Checking Account', variant: 'default' },
          },
          // Checking balance metric with subscription
          {
            op: 'add',
            id: 'checking-balance',
            type: 'metric',
            parentId: 'checking-card',
            props: {
              value: balances.checking,
              label: 'Available Balance',
              prefix: '$',
              format: 'number',
            },
            subscriptions: ['balances'],
            dataSource: `
              const b = await external_get_balances({})
              return { value: b.checking }
            `,
          },
          // Savings card
          {
            op: 'add',
            id: 'savings-card',
            type: 'card',
            parentId: 'balances-row',
            props: { title: 'Savings Account', variant: 'default' },
          },
          // Savings balance metric with subscription
          {
            op: 'add',
            id: 'savings-balance',
            type: 'metric',
            parentId: 'savings-card',
            props: {
              value: balances.savings,
              label: 'Available Balance',
              prefix: '$',
              format: 'number',
            },
            subscriptions: ['balances'],
            dataSource: `
              const b = await external_get_balances({})
              return { value: b.savings }
            `,
          },
        ]

        // Apply all events
        for (const event of events) {
          applyReportUIEvent(DASHBOARD_ID, event)

          // Register subscriptions for components that have them
          if (event.op === 'add' && event.subscriptions && signalRegistry) {
            for (const signal of event.subscriptions) {
              console.log(
                '[BankingInit] Registering subscription:',
                event.id,
                '->',
                signal,
              )
              signalRegistry.subscribe(event.id, signal)
            }
          }
        }

        // Log the registered subscriptions
        if (signalRegistry) {
          console.log(
            '[BankingInit] Subscribers for "balances":',
            signalRegistry.getSubscribers('balances'),
          )
          console.log(
            '[BankingInit] Subscribers for "transactions":',
            signalRegistry.getSubscribers('transactions'),
          )
        }

        // Get the updated state
        const finalState = getReportState(DASHBOARD_ID)!

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
