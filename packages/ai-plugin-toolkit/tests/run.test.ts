import { EventType } from '@ag-ui/core'
import { describe, expect, it } from 'vitest'
import { chatPlugin, generationPlugin, imagePlugin } from '../src/index.js'
import type { ChatStream, StreamChunk } from '@tanstack/ai'

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

/**
 * Chat stream emitting only a terminal `structured-output.complete` event —
 * exercises `collectChatStream`'s structured-output branch in isolation.
 */
async function* makeStructuredStream(object: unknown, raw: string): ChatStream {
  yield {
    type: EventType.CUSTOM,
    name: 'structured-output.complete',
    value: { object, raw },
    timestamp: Date.now(),
  }
}

/**
 * One-shot `execute` stream emitting a terminal `generation:result` event —
 * exercises `extractGenerationResult`'s streaming-execute branch.
 */
async function* makeResultStream(value: unknown): AsyncIterable<StreamChunk> {
  yield {
    type: EventType.CUSTOM,
    name: 'generation:result',
    value,
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

  it('threads options.signal through to req.signal', async () => {
    const controller = new AbortController()
    const p = generationPlugin({
      execute: (req) => Promise.resolve(req.signal === controller.signal),
    })
    expect(await p.run({}, { signal: controller.signal })).toBe(true)
  })

  it('runs a body-form input through a streaming execute and extracts generation:result', async () => {
    const p = generationPlugin({
      execute: () => makeResultStream({ done: true }),
    })
    const body = {
      threadId: 't',
      runId: 'r',
      messages: [],
      tools: [],
      context: [],
      forwardedProps: { plugin: 'gen' },
    }
    expect(await p.run(body)).toEqual({ done: true })
  })
})

describe('chatPlugin.run', () => {
  it('collects a chat stream into { text, structured }', async () => {
    const p = chatPlugin(() => makeTextStream('hello'))
    const out = await p.run([{ role: 'user', content: 'hi' }])
    expect(out.text).toBe('hello')
    expect(out.structured).toBeNull()
  })

  it('collects a terminal structured-output.complete event into structured', async () => {
    const p = chatPlugin(() => makeStructuredStream({ ok: 1 }, '{"ok":1}'))
    const out = await p.run([{ role: 'user', content: 'hi' }])
    expect(out).toEqual({ text: '', structured: { ok: 1 } })
  })
})
