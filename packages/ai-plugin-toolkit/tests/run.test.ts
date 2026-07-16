import { EventType } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import { chatPlugin, generationPlugin, imagePlugin } from '../src/index.js'
import type { ChatStream } from '@tanstack/ai'

/**
 * Minimal chat stream: a single `TEXT_MESSAGE_CONTENT` chunk carrying the whole
 * text as its `delta` (the only field `collectChatStream` reads for text).
 */
async function* makeTextStream(text: string): ChatStream {
  yield {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm1',
    delta: text,
    timestamp: Date.now(),
  }
}

describe('generationPlugin.run', () => {
  it('runs with raw input and returns the result', async () => {
    const p = generationPlugin({
      execute: (req) => Promise.resolve({ echo: req.input }),
    })
    expect(await p.run({ a: 1 })).toEqual({ echo: { a: 1 } })
  })

  it('validates raw input against the schema and rejects bad input', async () => {
    const p = imagePlugin(async (req) => ({
      id: 'x',
      model: 'm',
      images: [{ b64Json: req.input.prompt }],
    }))
    const ok = await p.run({ prompt: 'cat' })
    expect(ok.images[0]?.b64Json).toBe('cat')
    await expect(p.run({} as never)).rejects.toThrow() // missing required prompt
  })

  it('accepts a Request form', async () => {
    const p = generationPlugin({ execute: (req) => Promise.resolve(req.input) })
    const body = {
      threadId: 't',
      runId: 'r',
      messages: [],
      tools: [],
      context: [],
      forwardedProps: { plugin: 'x', foo: 'bar' },
    }
    const req = new Request('http://x', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    expect(await p.run(req)).toEqual({ foo: 'bar' })
  })
})

describe('chatPlugin.run', () => {
  it('collects a chat stream into { text, structured }', async () => {
    const p = chatPlugin(() => makeTextStream('hello'))
    const out = await p.run([{ role: 'user', content: 'hi' }])
    expect(out.text).toBe('hello')
    expect(out.structured).toBeNull()
  })
})
