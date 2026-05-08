import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(req: Request) {
  const body = await req.json()
  const stream = chat({
    adapter: openaiText('gpt-4o'),
    messages: body.messages,
    conversationId: body.forwardedProps?.conversationId,
  })
  return toServerSentEventsResponse(stream)
}
