import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { ChatUI } from '@/components/ChatUI'
import { DevtoolsHarness } from '@/components/DevtoolsHarness'
import { parseDevtoolsRouteSearch } from '@/lib/devtools-test'

export const Route = createFileRoute('/devtools-memory')({
  component: DevtoolsMemoryRoute,
  validateSearch: parseDevtoolsRouteSearch,
})

function DevtoolsMemoryRoute() {
  const { testId, aimockPort } = Route.useSearch()
  const chat = useChat({
    id: 'devtools-memory:primary',
    connection: fetchServerSentEvents('/api/devtools-memory'),
    body: { feature: 'chat', testId, aimockPort },
    devtools: { name: 'Memory Chat' },
  })

  return (
    <DevtoolsHarness>
      <section className="rounded border border-gray-800 bg-gray-900/40">
        <div className="border-b border-gray-800 px-3 py-2">
          <div className="text-sm font-semibold text-orange-300">
            Memory Chat
          </div>
          <div data-testid="memory-chat-status" className="text-xs text-gray-400">
            {chat.status}
          </div>
        </div>
        <ChatUI
          messages={chat.messages}
          isLoading={chat.isLoading}
          onSendMessage={(text) => {
            void chat.sendMessage(text)
          }}
          onStop={chat.stop}
        />
      </section>
    </DevtoolsHarness>
  )
}
