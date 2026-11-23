import { describe, expect, it } from 'vitest'
import { StreamReconnectLimitError } from '@tanstack/ai-client'
import { APICallError } from 'ai'
import { fromChatTransport } from '../src'
import type { StreamChunk } from '@tanstack/ai'
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

/**
 * The reply from the start. It fails after `dropAfter` chunks, or with
 * `close`, ends cleanly there.
 */
function replay(
  dropAfter = Infinity,
  close = false,
): ReadableStream<UIMessageChunk> {
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index === dropAfter) {
        if (close) controller.close()
        else controller.error(new TypeError('network error'))
      } else if (index === REPLY.length) controller.close()
      else controller.enqueue(REPLY[index++]!)
    },
  })
}

/** The 404 that `DefaultChatTransport` throws for a route with no resume GET. */
const notFound = new APICallError({
  message: 'Not Found',
  url: 'http://x/api/chat/chat-1/stream',
  requestBodyValues: undefined,
  statusCode: 404,
})

async function run(
  drops: Array<number>,
  {
    reconnect = {},
    close = false,
    reconnectToStream,
  }: {
    reconnect?: { maxAttempts?: number }
    close?: boolean
    reconnectToStream?: () => Promise<ReadableStream<UIMessageChunk> | null>
  } = {},
): Promise<{ text: string; reconnects: number; last?: StreamChunk }> {
  let reconnects = 0
  const transport: ChatTransport<UIMessage> = {
    resumeStreamIsReplay: true,
    sendMessages: () => Promise.resolve(replay(drops[0], close)),
    reconnectToStream: () => {
      reconnects++
      return reconnectToStream
        ? reconnectToStream()
        : Promise.resolve(replay(drops[reconnects], close))
    },
  }
  const connection = fromChatTransport(transport, {
    reconnect: { initialDelayMs: 1, ...reconnect },
  })
  let text = ''
  let last: StreamChunk | undefined
  for await (const event of connection.connect([], undefined, undefined, {
    threadId: 'chat-1',
    runId: 'run-1',
  })) {
    if (event.type === 'TEXT_MESSAGE_CONTENT') text += event.delta
    last = event
  }
  return { text, reconnects, last }
}

describe('fromChatTransport reconnect', () => {
  it('reconnects with backoff and skips the replayed prefix', async () => {
    // Drops after 3 chunks, then the first replay drops after 4.
    const result = await run([3, 4])
    expect(result).toMatchObject({ text: 'One two three.', reconnects: 2 })
  })

  it('stops at the limit when reconnects make no progress', async () => {
    // Every replay drops before it passes the chunks already delivered.
    await expect(
      run([3, 2, 2, 2], { reconnect: { maxAttempts: 2 } }),
    ).rejects.toBeInstanceOf(StreamReconnectLimitError)
  })

  it('reconnects when the stream ends cleanly before its finish chunk', async () => {
    // A proxy or a serverless timeout closes the response mid reply.
    const result = await run([3], { close: true })
    expect(result).toMatchObject({ text: 'One two three.', reconnects: 1 })
  })

  it('ends a clean early stop when the route cannot resume', async () => {
    const result = await run([3], {
      close: true,
      reconnectToStream: () => Promise.reject(notFound),
    })
    expect(result).toMatchObject({ text: 'One ', reconnects: 1 })
  })

  it('fails with the drop error when the route cannot resume', async () => {
    // Without the 4xx check, this waits through every retry to the limit.
    await expect(
      run([3], { reconnectToStream: () => Promise.reject(notFound) }),
    ).rejects.toThrow('network error')
  })
})
