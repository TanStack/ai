import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations } from '@tanstack/ai'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { useTransaction } from '@tanstack/ai-react/transaction'
import { openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'
import { ChatUI } from '@/components/ChatUI'
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

// Client-side transaction definition. `defineTransaction` is inert — none of
// these callbacks ever run in the browser. `useTransaction` only reads the
// declared verb names (and their kinds/types) off this value to build the
// typed client system; the actual requests are always sent to the server
// route `/api/transaction`, which defines its own (real) verbs. Mirroring
// the server route's three verbs (primaryChat + banner + bannerPair) here
// just keeps the client types in sync with what the server actually runs.
//
// Uses the single-provider openai adapter directly (not the multi-provider
// `@/lib/providers` factory) so the browser bundle doesn't pull in every
// provider SDK (e.g. ollama's `node:fs`) — the callbacks are inert on the
// client, so only their input/result TYPES matter.
const banner = verb({
  input: z.object({ prompt: z.string() }),
  execute: async ({ input }) => ({ prompt: input.prompt, text: '' }),
})

const transaction = defineTransaction({
  primaryChat: chatVerb((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      agentLoopStrategy: maxIterations(5),
      threadId: req.threadId,
      runId: req.runId,
    }),
  ),
  banner,
  bannerPair: verb({
    input: z.object({ topic: z.string() }),
    execute: async ({ input }, ctx) => {
      const hero = await ctx.call(banner, { prompt: `hero ${input.topic}` })
      const thumb = await ctx.call(banner, { prompt: `thumb ${input.topic}` })
      return { hero, thumb }
    },
  }),
})

function TransactionRoute() {
  const { provider, testId, aimockPort } = Route.useSearch()

  // Routing metadata (provider/testId/aimockPort) rides along in every
  // verb's forwardedProps; the server route peeks it to build adapters and
  // the one-shot verbs' zod schemas simply strip the extra fields.
  const routing = { provider, testId, aimockPort }

  const txn = useTransaction(transaction, {
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
