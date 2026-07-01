import { createFileRoute } from '@tanstack/react-router'
import { toolDefinition } from '@tanstack/ai'
import { clientTools } from '@tanstack/ai-client'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { z } from 'zod'
import { ChatUI } from '@/components/ChatUI'
import { DevtoolsHarness } from '@/components/DevtoolsHarness'
import { parseDevtoolsRouteSearch } from '@/lib/devtools-test'

export const Route = createFileRoute('/devtools-tools')({
  component: DevtoolsToolsRoute,
  validateSearch: parseDevtoolsRouteSearch,
})

const inventoryLookupDefinition = toolDefinition({
  name: 'InventoryLookup',
  description: 'Look up guitar inventory by SKU while preserving user casing.',
  inputSchema: z.object({
    sku: z.string().describe('Inventory SKU'),
    includeAvailability: z.boolean().describe('Include stock availability'),
  }),
  outputSchema: z.object({
    sku: z.string(),
    name: z.string(),
    available: z.boolean(),
  }),
})

const inventoryLookupTool = inventoryLookupDefinition.client((input) => ({
  sku: input.sku,
  name: input.sku === 'STRAT-001' ? 'Fender Stratocaster' : 'Unknown Guitar',
  available: input.includeAvailability,
}))

const tools = clientTools(inventoryLookupTool)

function DevtoolsToolsRoute() {
  const { testId, aimockPort } = Route.useSearch()
  const chat = useChat({
    id: 'devtools-tools:primary',
    connection: fetchServerSentEvents('/api/chat'),
    body: { provider: 'openai', feature: 'chat', testId, aimockPort },
    tools,
    devtools: { name: 'Tool Runner' },
  })

  return (
    <DevtoolsHarness>
      <section className="rounded border border-gray-800 bg-gray-900/40">
        <div className="border-b border-gray-800 px-3 py-2">
          <div className="text-sm font-semibold text-orange-300">
            Tool Runner
          </div>
          <div
            data-testid="tool-route-message-count"
            className="text-xs text-gray-400"
          >
            {chat.messages.length}
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
