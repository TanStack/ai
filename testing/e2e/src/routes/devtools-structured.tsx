import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { ChatUI } from '@/components/ChatUI'
import { DevtoolsHarness } from '@/components/DevtoolsHarness'
import { parseDevtoolsRouteSearch } from '@/lib/devtools-test'
import { guitarRecommendationSchema } from '@/lib/schemas'

export const Route = createFileRoute('/devtools-structured')({
  component: DevtoolsStructuredRoute,
  validateSearch: parseDevtoolsRouteSearch,
})

function DevtoolsStructuredRoute() {
  const { testId, aimockPort } = Route.useSearch()
  const [contentDeltaCount, setContentDeltaCount] = useState(0)
  const [structuredObject, setStructuredObject] = useState<unknown>(null)
  const chat = useChat({
    id: 'devtools-structured:primary',
    connection: fetchServerSentEvents('/api/chat'),
    body: {
      provider: 'openai',
      feature: 'structured-output-stream',
      testId,
      aimockPort,
    },
    outputSchema: guitarRecommendationSchema,
    devtools: { name: 'Structured Recommendation' },
    onCustomEvent: (eventType, data) => {
      if (eventType === 'structured-output.complete') {
        const value = data as { object?: unknown } | undefined
        setStructuredObject(value?.object ?? null)
      }
    },
    onChunk: (chunk) => {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        setContentDeltaCount((count) => count + 1)
      }
    },
  })

  return (
    <DevtoolsHarness>
      <section className="rounded border border-gray-800 bg-gray-900/40">
        <div className="border-b border-gray-800 px-3 py-2">
          <div className="text-sm font-semibold text-orange-300">
            Structured Recommendation
          </div>
          <div
            data-testid="structured-route-status"
            className="text-xs text-gray-400"
          >
            {chat.status}
          </div>
        </div>
        <ChatUI
          messages={chat.messages}
          isLoading={chat.isLoading}
          structuredObject={structuredObject}
          contentDeltaCount={contentDeltaCount}
          onSendMessage={(text) => {
            void chat.sendMessage(text)
          }}
          onStop={chat.stop}
        />
        <div
          data-testid="structured-partial-json"
          className="border-t border-gray-800 p-3 text-xs text-gray-300"
        >
          {JSON.stringify(chat.partial)}
        </div>
      </section>
    </DevtoolsHarness>
  )
}
