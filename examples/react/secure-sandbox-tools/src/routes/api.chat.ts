import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { secureTools } from '@/lib/secure-chat-tools'

const SYSTEM_PROMPT =
  'You are an inventory assistant. Use the checkInventory tool to answer ' +
  'stock questions. Its body runs in a sandbox, so it can only read the ' +
  'inventory table.'

export async function POST({ request }: { request: Request }) {
  const params = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages: params.messages,
    threadId: params.threadId,
    runId: params.runId,
    systemPrompts: [SYSTEM_PROMPT],
    tools: secureTools,
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST,
    },
  },
})
