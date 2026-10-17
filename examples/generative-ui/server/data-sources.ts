/**
 * Host live data-source registry for the POC (the sibling of the compute
 * registry). A `create_artifact` call may bind an artifact to one of these by
 * name; the host then streams values into the mounted frame over the bridge so
 * the view updates in real time. Values are host-authoritative — the model
 * never computes them, it just renders what arrives.
 *
 * `spendFeed` simulates a live transaction feed: an initial snapshot, then a new
 * transaction every interval with the running total recomputed host-side. Each
 * subscription gets its own closure state and its own timer, cleared by the
 * returned unsubscribe.
 */

import { DataSourceRegistry } from '@tanstack/ai-generative-ui'

interface Txn {
  id: string
  label: string
  amount: number
}

const MERCHANTS = [
  'Figma', 'Vercel', 'AWS', 'GitHub', 'Linear', 'Notion', 'Datadog',
  'OpenAI', 'Anthropic', 'Cloudflare', 'Stripe fee', 'Fly.io',
]

let txnSeq = 0

export const dataSources = new DataSourceRegistry()

dataSources.register(
  'spendFeed',
  (params, emit) => {
    const currency = typeof params.currency === 'string' ? params.currency : 'USD'
    const intervalMs = Math.max(400, Number(params.intervalMs) || 1500)
    let total = 0
    const recent: Array<Txn> = []

    const tick = () => {
      const amount = Math.round(20 + Math.random() * 480)
      const label = MERCHANTS[Math.floor(Math.random() * MERCHANTS.length)] ?? 'Charge'
      total += amount
      recent.unshift({ id: `txn_${++txnSeq}`, label, amount })
      if (recent.length > 6) recent.pop()
      emit({ currency, total, recent: [...recent], updatedAt: new Date().toISOString() })
    }

    // Seed one transaction immediately so the view has something live at once,
    // then keep streaming.
    tick()
    const timer = setInterval(tick, intervalMs)
    return () => clearInterval(timer)
  },
  {
    description:
      'A live monthly spend feed: a running total plus the most recent transactions, updating continuously. Render the running total prominently and list the recent transactions. Read the streamed value with useHostData() / window.__ogui.onData.',
    params: ['currency', 'intervalMs'],
    output: '{ currency, total, recent: [{ id, label, amount }], updatedAt }',
  },
)
