import { EventType } from '@tanstack/ai'
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'
import { expect, test } from './fixtures'

test('preserves tool input when an argument delta arrives after the end event', async ({
  baseURL,
}) => {
  let sawLateDelta = false
  const client = new ChatClient({
    threadId: 'late-tool-args-wire',
    connection: fetchServerSentEvents(`${baseURL}/api/late-tool-args-wire`),
    onChunk: (chunk) => {
      if (chunk.type === EventType.TOOL_CALL_ARGS && chunk.delta === '}') {
        sawLateDelta = true
      }
    },
  })

  await client.sendMessage('What is the weather in Paris?')

  expect(sawLateDelta).toBe(true)
  const toolCall = client
    .getMessages()
    .flatMap((message) => message.parts)
    .find((part) => part.type === 'tool-call')
  expect(toolCall).toMatchObject({
    state: 'complete',
    arguments: '{"city":"Paris"}',
    input: { city: 'Paris' },
    output: { forecast: 'Sunny in Paris' },
  })
})
