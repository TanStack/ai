import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  createPluginEvent,
  defineHarness,
  definePlugin,
  logIdOf,
  scrubSecrets,
} from '../src'
import { Redactor, redactMiddleware } from '../src/auth'
import { mockAdapter, text, toolCall } from './helpers'
import type { ChatMiddlewareConfig } from '@tanstack/ai'
import type { HarnessRunContext } from '../src'

const THREAD = 't1'
const LOG = logIdOf({ logId: THREAD })
const ada = { id: 'ada' }
// A quote and a slash, so the JSON-escaped and URL-encoded forms differ
// from the raw value.
const KEY = 'sk-"live"/7fQ2mX9pLr'
// Each form of KEY has this part. A text with it still has the key.
const KEY_PART = '7fQ2mX9pLr'
const leaked = createPluginEvent<{ key: string }>('test/leaked')

/**
 * A host where ada saved KEY as her `openai` key, and a session that she
 * opens. The tool `leak` reads the key and puts it in plugin state, in a
 * plugin event, and in its result, or throws it with `fail`.
 */
async function open({ fail }: { fail: boolean }) {
  const credentials = memoryCredentialStore()
  await credentials.set({
    scope: { threadId: THREAD, userId: ada.id },
    id: 'openai',
    credential: { type: 'api_key', value: KEY },
  })
  const leaky = definePlugin({
    name: 'test/leaky',
    setup: (ctx) => {
      const state = ctx.state({ seen: '' })
      const tool = toolDefinition({
        name: 'leak',
        description: 'Echo the key',
        inputSchema: z.object({}),
      }).server<HarnessRunContext>(async (_input, { context }) => {
        const key = await context.run.keys.require('openai')
        await state.update(() => ({ seen: key }))
        ctx.emit(leaked, { key })
        if (fail) throw new Error(`The key ${key} was refused.`)
        // The tool message holds this as JSON, so `key` is there in its
        // JSON-escaped form.
        return {
          key,
          url: `https://example.com/?key=${encodeURIComponent(key)}`,
        }
      })
      return { tools: [tool] }
    },
  })
  const model = mockAdapter([() => toolCall('leak', {}), () => text('done')])
  const persistence = memoryPersistence()
  const host = createHarnessHost({ persistence, credentials })
  const harness = defineHarness({
    name: 'test/redaction',
    adapter: model.adapter,
    plugins: () => [leaky],
  })
  const session = await host.open(harness, {
    threadId: THREAD,
    principal: ada,
  })
  const events: Array<unknown> = []
  session.onEvent((entry) => events.push(entry))
  return {
    host,
    session,
    events,
    calls: model.calls,
    log: persistence.stores.log,
  }
}

describe('the redaction sink of a session', () => {
  it.each([
    { fail: false, what: 'result' },
    { fail: true, what: 'error' },
  ])(
    'scrubs a provider key that a tool echoes in its $what from the log, the feed, plugin state, and the next model call',
    async ({ fail }) => {
      const { host, session, events, calls, log } = await open({ fail })

      await session.send('Leak it.')

      const stored = JSON.stringify(await log.read({ logId: LOG }))
      expect(stored).toContain('[redacted]')
      expect(stored).not.toContain(KEY_PART)

      const fed = JSON.stringify(events)
      expect(fed).toContain('[redacted]')
      expect(fed).not.toContain(KEY_PART)

      expect(session.snapshot().plugins['test/leaky']).toEqual({
        seen: '[redacted]',
      })

      // The call after the tool call gets its result (or error).
      const next = JSON.stringify(calls[1].messages)
      expect(next).toContain('[redacted]')
      expect(next).not.toContain(KEY_PART)
      await host.close()
    },
  )
})

describe('Redactor', () => {
  it('scrubs the raw, JSON-escaped, and URL-encoded forms in strings at any depth', () => {
    const redactor = new Redactor()
    redactor.add(KEY)
    const value = {
      count: 3,
      ok: true,
      none: null,
      list: ['a', `raw ${KEY}`, { json: JSON.stringify({ key: KEY }) }],
      url: `?key=${encodeURIComponent(KEY)}`,
    }

    expect(redactor.redact(value)).toEqual({
      count: 3,
      ok: true,
      none: null,
      list: ['a', 'raw [redacted]', { json: '{"key":"[redacted]"}' }],
      url: '?key=[redacted]',
    })
    // The input is not changed.
    expect(value.list[1]).toBe(`raw ${KEY}`)
  })

  it('returns the same object when no secret is in it, and keeps the parts that did not change', () => {
    const redactor = new Redactor()
    redactor.add(KEY)
    const clean = { a: { b: ['x', 1] }, c: 'text' }
    expect(redactor.redact(clean)).toBe(clean)

    const mixed = { clean: clean.a, dirty: { key: KEY } }
    const redacted = redactor.redact(mixed)
    expect(redacted).not.toBe(mixed)
    expect(redacted.clean).toBe(clean.a)
    expect(redacted.dirty).toEqual({ key: '[redacted]' })
  })

  it('leaves values shorter than 6 characters, and does nothing while it has no secret', () => {
    const redactor = new Redactor()
    const value = { pin: '12345' }
    expect(redactor.isEmpty).toBe(true)
    expect(redactor.redact(value)).toBe(value)

    redactor.add('12345')
    expect(redactor.isEmpty).toBe(true)
    expect(redactor.scrub('pin 12345')).toBe('pin 12345')
  })

  it('scrubs like the core scrubSecrets, which the harness exports', () => {
    const redactor = new Redactor()
    redactor.add('abcdef')
    redactor.add('abcdefgh')
    const textWith = 'token abcdefgh and abcdef'
    expect(redactor.scrub(textWith)).toBe(
      scrubSecrets(textWith, ['abcdef', 'abcdefgh']),
    )
    expect(redactor.scrub(textWith)).toBe('token [redacted] and [redacted]')
  })
})

describe('redactMiddleware', () => {
  // The session test above passes through the log fold too, so this checks
  // the middleware alone.
  const configWith = (content: string): ChatMiddlewareConfig => ({
    messages: [{ role: 'tool', toolCallId: 'c1', content }],
    systemPrompts: [`Use ${content}`],
    tools: [],
  })

  it('gives the model the messages and system prompts without the secrets', async () => {
    const redactor = new Redactor()
    redactor.add(KEY)
    const config = configWith(JSON.stringify({ key: KEY }))

    const change = await redactMiddleware(redactor).onConfig?.(
      {} as never,
      config,
    )

    expect(change).toEqual({
      providerMessages: [
        { role: 'tool', toolCallId: 'c1', content: '{"key":"[redacted]"}' },
      ],
      systemPrompts: ['Use {"key":"[redacted]"}'],
    })
    // The transcript keeps its messages: the log view scrubs those.
    expect(config.messages[0]?.content).toContain(KEY_PART)
  })

  it('changes nothing when the context has no secret', async () => {
    const redactor = new Redactor()
    redactor.add(KEY)
    const change = await redactMiddleware(redactor).onConfig?.(
      {} as never,
      configWith('clean'),
    )
    expect(change).toBeUndefined()
  })
})
