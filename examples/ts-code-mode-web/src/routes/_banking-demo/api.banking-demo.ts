import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import { zaiText } from '@tanstack/ai-zai'
import type { AnyTextAdapter } from '@tanstack/ai'

import { allTools } from '@/lib/tools'
import { CODE_MODE_SYSTEM_PROMPT } from '@/lib/prompts'
import { reportTools } from '@/lib/reports/tools'
import { createReportBindings } from '@/lib/reports/create-report-bindings'

type Provider = 'anthropic' | 'openai' | 'gemini' | 'zai'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'zai':
      return zaiText((model || 'glm-4.7') as 'glm-4.7')
    case 'anthropic':
    default:
      return anthropicText((model || 'claude-haiku-4-5') as 'claude-haiku-4-5')
  }
}

// Banking demo specific system prompt
const BANKING_DEMO_SYSTEM_PROMPT = `
## Banking Dashboard

You are helping the user manage their banking dashboard. A report named "dashboard" (reportId: 'dashboard') already exists and displays the user's checking and savings balances.

**IMPORTANT:** Do NOT create new reports. Always add components to the existing 'dashboard' report using reportId: 'dashboard'.

### Available Banking APIs

Inside \`execute_typescript\`, these functions are available:

- \`external_get_balances({})\` — returns \`{ checking: number, savings: number }\`
- \`external_transfer({ from, to, amount })\` — transfers money between accounts, returns \`{ success: boolean, newBalance?: number }\`
- \`external_get_transactions({ limit? })\` — returns recent transactions array

### Adding Components to the Dashboard

Use \`execute_typescript\` with \`external_report_*\` functions. Always use \`reportId: 'dashboard'\`.

**Layout components:**
- \`external_report_vbox({ reportId: 'dashboard', id, parentId?, gap?, align?, padding? })\` — vertical stack
- \`external_report_hbox({ reportId: 'dashboard', id, parentId?, gap?, align?, justify?, wrap? })\` — horizontal stack
- \`external_report_grid({ reportId: 'dashboard', id, parentId?, cols?, gap? })\` — CSS grid
- \`external_report_card({ reportId: 'dashboard', id, parentId?, title?, subtitle?, variant? })\` — card container

**Content components:**
- \`external_report_text({ reportId: 'dashboard', id?, parentId?, content, variant?, color? })\` — text
- \`external_report_metric({ reportId: 'dashboard', id?, parentId?, value, label, trend?, format?, prefix?, subscriptions?, dataSource? })\` — big number display
- \`external_report_button({ reportId: 'dashboard', id, parentId?, label, variant?, handlers? })\` — interactive button
- \`external_report_chart({ reportId: 'dashboard', id, parentId?, type, data, xKey, yKey, subscriptions?, dataSource?, ... })\` — charts (line, bar, area, pie) - supports reactive updates
- \`external_report_dataTable({ reportId: 'dashboard', id, parentId?, columns, rows, pageSize?, showPagination?, subscriptions?, dataSource? })\` — sortable, paginated data table - supports reactive updates
- \`external_report_progress({ reportId: 'dashboard', id?, parentId?, value, max?, label? })\` — progress bar

**Operations:**
- \`external_report_update({ reportId: 'dashboard', componentId, props })\` — update component props
- \`external_report_remove({ reportId: 'dashboard', componentId })\` — remove a component

### Subscriptions and Live Data

Components can subscribe to signals and auto-refresh when data changes:

\`\`\`typescript
// Metric with subscription
external_report_metric({
  reportId: 'dashboard',
  id: 'savings-balance',
  parentId: 'savings-card',
  value: balances.savings,
  label: 'Current Balance',
  prefix: '$',
  subscriptions: ['balances'],
  dataSource: \`
    const b = await external_get_balances({})
    return { value: b.savings }
  \`
})

// Chart with subscription - updates when transactions change
const txs = await external_get_transactions({ limit: 10 })
external_report_chart({
  reportId: 'dashboard',
  id: 'account-history-chart',
  parentId: 'history-card',
  type: 'line',
  data: txs.map(tx => ({ date: tx.date, balance: tx.balance })),
  xKey: 'date',
  yKey: 'balance',
  subscriptions: ['transactions'],
  dataSource: \`
    const txs = await external_get_transactions({ limit: 10 })
    return { data: txs.map(tx => ({ date: tx.date, balance: tx.balance })) }
  \`
})

// Data table with subscription - updates when transactions change
const transactions = await external_get_transactions({ limit: 20 })
external_report_dataTable({
  reportId: 'dashboard',
  id: 'transactions-table',
  parentId: 'transactions-card',
  columns: [
    { key: 'date', label: 'Date', format: 'date' },
    { key: 'type', label: 'Type', format: 'text' },
    { key: 'amount', label: 'Amount', format: 'currency' },
    { key: 'balance', label: 'Balance', format: 'currency' }
  ],
  rows: transactions,
  subscriptions: ['transactions'],
  dataSource: \`
    const txs = await external_get_transactions({ limit: 20 })
    return { rows: txs }
  \`
})
\`\`\`

### Watchers (Conditional Alerts)

Register code that runs when data changes and a condition is met:

\`\`\`typescript
external_subscribe_watcher({
  reportId: 'dashboard',
  id: 'low-savings-alert',
  description: 'Alert when savings below $50',
  signals: ['balances'],
  condition: \`
    const b = await external_get_balances({})
    return b.savings < 50
  \`,
  action: \`
    await external_ui_toast({ message: 'Warning: Savings below $50!', variant: 'error' })
  \`,
  once: true
})
\`\`\`

### Button Handlers

Buttons can include handlers that execute when clicked:

\`\`\`typescript
external_report_button({
  reportId: 'dashboard',
  id: 'transfer-btn',
  parentId: 'some-card',
  label: 'Transfer $10',
  variant: 'primary',
  handlers: {
    onPress: \`
      const result = await external_transfer({ from: 'checking', to: 'savings', amount: 10 })
      if (result.success) {
        external_ui_toast({ message: 'Transferred $10!', variant: 'success' })
      }
    \`
  }
})
\`\`\`

### Existing Dashboard Components

The dashboard already has:
- \`balances-row\` — horizontal container for balance cards
- \`checking-card\` — card containing checking balance
- \`checking-balance\` — metric showing checking balance (subscribed to 'balances')
- \`savings-card\` — card containing savings balance
- \`savings-balance\` — metric showing savings balance (subscribed to 'balances')

You can add new components to the root level or nest them inside existing containers using \`parentId\`.
`

// Lazy initialization
let codeModeCache: {
  tool: ReturnType<typeof createCodeMode>['tool']
  systemPrompt: string
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
    const driver = await createIsolateDriver('node')
    const { tool, systemPrompt } = createCodeMode({
      driver,
      tools: allTools,
      timeout: 60000,
      memoryLimit: 128,
      getSkillBindings: async () => createReportBindings(),
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

export const Route = createFileRoute('/_banking-demo/api/banking-demo' as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'anthropic'
        const model: string | undefined = data?.model

        const adapter = getAdapter(provider, model)
        const { tool, systemPrompt } = await getCodeModeTools()

        // Filter out report creation tools - we don't want the LLM to create new reports
        const filteredReportTools = reportTools.filter(
          (t) => t.name !== 'new_report' && t.name !== 'delete_report',
        )

        try {
          const stream = chat({
            adapter,
            messages,
            tools: [tool, ...filteredReportTools],
            systemPrompts: [
              CODE_MODE_SYSTEM_PROMPT,
              systemPrompt,
              BANKING_DEMO_SYSTEM_PROMPT,
            ],
            agentLoopStrategy: maxIterations(20),
            abortController,
            maxTokens: 8192,
          })

          const sseStream = toServerSentEventsStream(stream, abortController)

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error: unknown) {
          console.error('[API Banking Demo Route] Error:', error)

          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }

          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
