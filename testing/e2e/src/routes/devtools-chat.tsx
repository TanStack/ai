import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { ChatUI } from '@/components/ChatUI'
import { DevtoolsHarness } from '@/components/DevtoolsHarness'
import { parseDevtoolsRouteSearch } from '@/lib/devtools-test'

export const Route = createFileRoute('/devtools-chat')({
  component: DevtoolsChatRoute,
  validateSearch: parseDevtoolsRouteSearch,
})

function DevtoolsChatRoute() {
  const { testId, aimockPort } = Route.useSearch()
  const [showSecondary, setShowSecondary] = useState(false)
  const chat = useChat({
    id: 'devtools-chat:primary',
    connection: fetchServerSentEvents('/api/chat'),
    body: { provider: 'openai', feature: 'chat', testId, aimockPort },
    devtools: { name: 'Support Chat' },
  })

  return (
    <DevtoolsHarness>
      <div className="space-y-4">
        <section className="rounded border border-gray-800 bg-gray-900/40">
          <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
            <div>
              <div className="text-sm font-semibold text-orange-300">
                Support Chat
              </div>
              <div
                data-testid="support-chat-status"
                className="text-xs text-gray-400"
              >
                {chat.status}
              </div>
            </div>
            <button
              type="button"
              data-testid="mount-secondary-chat"
              className="rounded border border-gray-700 px-3 py-1 text-xs text-gray-200"
              onClick={() => setShowSecondary(true)}
            >
              Mount Secondary Chat
            </button>
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
        {showSecondary ? (
          <SecondaryChat testId={testId} aimockPort={aimockPort} />
        ) : null}
      </div>
    </DevtoolsHarness>
  )
}

function SecondaryChat({
  testId,
  aimockPort,
}: {
  testId?: string
  aimockPort?: number
}) {
  const secondary = useChat({
    id: 'devtools-chat:secondary',
    connection: fetchServerSentEvents('/api/chat'),
    body: { provider: 'openai', feature: 'chat', testId, aimockPort },
    devtools: { name: 'Secondary Chat' },
  })

  return (
    <section
      data-testid="secondary-chat-mounted"
      className="rounded border border-gray-800 bg-gray-900/40 p-3"
    >
      <div className="text-sm font-semibold text-orange-300">
        Secondary Chat
      </div>
      <div className="text-xs text-gray-400">{secondary.status}</div>
    </section>
  )
}
