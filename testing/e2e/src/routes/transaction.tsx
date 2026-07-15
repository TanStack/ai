import { createFileRoute } from '@tanstack/react-router'
import { clientTransaction } from '@tanstack/ai/transaction'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { ChatUI } from '@/components/ChatUI'
import type { E2eTransaction } from './api.transaction'
import type { Provider } from '@/lib/types'

export interface TransactionRouteSearch {
  provider: Provider
  testId?: string
  aimockPort?: number
}

const DEFAULT_PROVIDER: Provider = 'openai'

function parseTransactionRouteSearch(
  search: Record<string, unknown>,
): TransactionRouteSearch {
  const aimockPort =
    typeof search.aimockPort === 'string'
      ? Number.parseInt(search.aimockPort, 10)
      : undefined
  const provider =
    typeof search.provider === 'string'
      ? (search.provider as Provider)
      : DEFAULT_PROVIDER

  return {
    provider,
    ...(typeof search.testId === 'string' ? { testId: search.testId } : {}),
    ...(aimockPort !== undefined && !Number.isNaN(aimockPort)
      ? { aimockPort }
      : {}),
  }
}

export const Route = createFileRoute('/transaction')({
  component: TransactionRoute,
  validateSearch: parseTransactionRouteSearch,
})

// Type-only binding to the server definition — no inert verb mirrors or
// provider imports in the browser bundle.
const e2eTxnDef = clientTransaction<E2eTransaction>({
  primaryChat: 'chat',
  banner: 'one-shot',
  bannerPair: 'one-shot',
})

function TransactionRoute() {
  const { provider, testId, aimockPort } = Route.useSearch()

  // Routing metadata (provider/testId/aimockPort) rides along in every
  // verb's forwardedProps; the server route peeks it to build adapters and
  // the one-shot verbs' zod schemas simply strip the extra fields.
  const routing = { provider, testId, aimockPort }

  const txn = useTransaction(e2eTxnDef, {
    connection: fetchServerSentEvents('/api/transaction'),
    verbs: {
      primaryChat: { forwardedProps: routing },
      banner: { forwardedProps: routing },
      bannerPair: { forwardedProps: routing },
    },
  })

  return (
    <div className="flex h-screen flex-col">
      <div className="space-y-2 border-b border-gray-700 p-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="transaction-run-banner"
            className="rounded bg-orange-500 px-3 py-2 text-sm font-medium text-white"
            onClick={() => {
              void txn.banner.run({ prompt: 'solo banner' })
            }}
          >
            Run Banner
          </button>
          <span
            data-testid="transaction-banner-status"
            className="text-xs text-gray-400"
          >
            {txn.banner.status}
          </span>
          <span
            data-testid="transaction-banner-result"
            className="break-all text-xs text-gray-400"
          >
            {txn.banner.result?.text ?? ''}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="transaction-run-banner-pair"
            className="rounded bg-purple-500 px-3 py-2 text-sm font-medium text-white"
            onClick={() => {
              void txn.bannerPair.run({ topic: 'guitars' })
            }}
          >
            Run Banner Pair
          </button>
          <span
            data-testid="transaction-banner-pair-status"
            className="text-xs text-gray-400"
          >
            {txn.bannerPair.status}
          </span>
          <span
            data-testid="transaction-banner-pair-result"
            className="break-all text-xs text-gray-400"
          >
            {txn.bannerPair.result
              ? `${txn.bannerPair.result.hero.text} + ${txn.bannerPair.result.thumb.text}`
              : ''}
          </span>
        </div>
        <ul data-testid="transaction-sub-runs" className="space-y-1">
          {txn.bannerPair.subRuns.map((sub) => (
            <li
              key={sub.runId}
              data-testid={`transaction-sub-run-${sub.index}`}
              data-verb={sub.verb}
              data-status={sub.status}
              className="text-xs text-gray-400"
            >
              {sub.verb}:{sub.status}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1 overflow-hidden">
        <ChatUI
          messages={txn.primaryChat.messages}
          isLoading={txn.primaryChat.isLoading}
          onSendMessage={(text) => {
            void txn.primaryChat.sendMessage(text)
          }}
          onStop={txn.primaryChat.stop}
        />
      </div>
    </div>
  )
}
