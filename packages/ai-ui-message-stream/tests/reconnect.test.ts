import { describe, expect, it } from 'vitest'
import { StreamReconnectLimitError } from '@tanstack/ai-client'
import { fromChatTransport } from '../src'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

const REPLY: Array<UIMessageChunk> = [
  { type: 'start', messageId: 'a-1' },
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta: 'One ' },
  { type: 'text-delta', id: 't', delta: 'two ' },
  { type: 'text-delta', id: 't', delta: 'three.' },
  { type: 'text-end', id: 't' },
  { type: 'finish', finishReason: 'stop' },
]

/** The reply from the start, failing after `dropAfter` chunks. */
function replay(dropAfter = Infinity): ReadableStream<UIMessageChunk> {
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index === dropAfter) controller.error(new TypeError('network error'))
      else if (index === REPLY.length) controller.close()
      else controller.enqueue(REPLY[index++]!)
    },
  })
}

async function run(
  drops: Array<number>,
  reconnect: { maxAttempts?: number } = {},
): Promise<{ text: string; reconnects: number }> {
  let reconnects = 0
  const transport: ChatTransport<UIMessage> = {
    resumeStreamIsReplay: true,
    sendMessages: () => Promise.resolve(replay(drops[0])),
    reconnectToStream: () => {
      reconnects++
      return Promise.resolve(replay(drops[reconnects]))
    },
  }
  const connection = fromChatTransport(transport, {
    reconnect: { initialDelayMs: 1, ...reconnect },
  })
  let text = ''
  for await (const event of connection.connect([], undefined, undefined, {
    threadId: 'chat-1',
    runId: 'run-1',
  })) {
    if (event.type === 'TEXT_MESSAGE_CONTENT') text += event.delta
  }
  return { text, reconnects }
}

describe('fromChatTransport reconnect', () => {
  it('reconnects with backoff and skips the replayed prefix', async () => {
    // Drops after 3 chunks, then the first replay drops after 4.
    const result = await run([3, 4])
    expect(result).toEqual({ text: 'One two three.', reconnects: 2 })
  })

  it('stops at the limit when reconnects make no progress', async () => {
    // Every replay drops before it passes the chunks already delivered.
    await expect(run([3, 2, 2, 2], { maxAttempts: 2 })).rejects.toBeInstanceOf(
      StreamReconnectLimitError,
    )
  })
})
