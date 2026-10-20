import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  createPluginEvent,
  defineCommand,
  defineHarness,
  definePlugin,
  durableTool,
  logIdOf,
  scrubSecrets,
} from '../src'
import { createRedactor, redactMiddleware } from '../src/auth'
import { createHarnessHandler } from '../src/server'
import { scrubbedBy } from '../src/session/harness-session'
import { hostBackend } from '../src/first-party/coding/backend'
import { workspaceTools } from '../src/first-party/coding/workspace'
import { mockAdapter, text, toolCall } from './helpers'
import type { AnyTool, ChatMiddlewareConfig } from '@tanstack/ai'
import type { Reply } from './helpers'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'
import type { HarnessPlugin, HarnessRunContext } from '../src'

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
async function open({
  fail,
  tools = [],
  plugins = [],
  replies = [() => toolCall('leak', {}), () => text('done')],
}: {
  fail: boolean
  tools?: Array<AnyTool>
  plugins?: Array<HarnessPlugin>
  replies?: Array<Reply>
}) {
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
  const model = mockAdapter(replies)
  const persistence = memoryPersistence()
  const host = createHarnessHost({ persistence, credentials })
  const harness = defineHarness({
    name: 'test/redaction',
    adapter: model.adapter,
    tools,
    plugins: () => [leaky, ...plugins],
  })
  const session = await host.open(harness, {
    threadId: THREAD,
    user: ada,
  })
  const events: Array<unknown> = []
  session.onEvent((entry) => events.push(entry))
  return {
    host,
    harness,
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

describe('a bash spill', () => {
  it('keeps no key of the session in the file of the full output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tanstack-spill-'))
    try {
      // Long output with the key: the model gets only its end, and the
      // file gets all of it.
      const backend: WorkspaceBackend = {
        ...hostBackend,
        exec: async () => ({
          exitCode: 0,
          stdout: `${KEY}\n`.repeat(3000),
          stderr: '',
        }),
      }
      const { host, session } = await open({
        fail: false,
        plugins: [
          workspaceTools({ root, backend, spillDir: 'spill', web: false }),
        ],
        replies: [
          () => toolCall('leak', {}, 'c0'),
          () => toolCall('bash', { command: 'print-key' }, 'c1'),
          () => text('done'),
        ],
      })

      await session.send('Leak it twice.')

      const [file] = await readdir(join(root, 'spill'))
      if (file === undefined) throw new Error('No spill file.')
      const saved = await readFile(join(root, 'spill', file), 'utf8')
      expect(saved).toContain('[redacted]')
      expect(saved).not.toContain(KEY_PART)
      await host.close()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('the edges of a session', () => {
  it.each([
    { fail: false, what: 'result' },
    { fail: true, what: 'error' },
  ])(
    'stores the tool $what that the model got, without the key',
    async ({ fail }) => {
      const { host, session, log } = await open({ fail })

      await session.send('Leak it.')

      const results = (await log.read({ logId: LOG }))
        .map((entry) => entry.record)
        .filter((record) => record.type === 'harness.tool.result')
      expect(results).toHaveLength(1)
      const stored = JSON.stringify(results)
      expect(stored).toContain('[redacted]')
      expect(stored).not.toContain(KEY_PART)
      // The transcript has the same scrubbed tool message.
      const message = (await session.transcript()).find(
        (entry) => entry.role === 'tool',
      )
      expect(JSON.stringify(message)).toContain('[redacted]')
      expect(JSON.stringify(message)).not.toContain(KEY_PART)
      await host.close()
    },
  )

  it('refuses a durable step value with a secret, and the log keeps no step', async () => {
    let refused: unknown
    const stash = durableTool(
      toolDefinition({
        name: 'stash',
        description: 'Keep a value in a step',
        inputSchema: z.object({}),
      }),
      async (_input, { step }) => {
        refused = await step
          .do('keep', () => ({ value: KEY }))
          .catch((error: unknown) => error)
        return 'kept'
      },
    )
    const { host, session, log } = await open({
      fail: false,
      tools: [stash],
      // The key is a secret of the session after `leak` read it.
      replies: [
        () => toolCall('leak', {}, 'call-leak'),
        () => toolCall('stash', {}, 'call-stash'),
        () => text('done'),
      ],
    })

    await session.send('Leak it, then stash it.')

    expect(String(refused)).toContain(
      'A step result must not hold a secret. Read it outside step.do.',
    )
    const steps = (await log.read({ logId: LOG })).filter(
      (entry) => entry.record.type === 'harness.tool.step',
    )
    expect(steps).toEqual([])
    await host.close()
  })

  it('takes a retry of an input with a secret in it as a duplicate, not a conflict', async () => {
    const note = definePlugin({
      name: 'test/note',
      setup: () => ({
        commands: {
          note: defineCommand({ description: 'Note it', run: () => 'noted' }),
        },
      }),
    })
    const { host, session } = await open({ fail: false, plugins: [note] })
    await session.send('Leak it.')
    // The user pastes the key that the session read. The log keeps the
    // input without it.
    const options = { name: 'note', input: { text: KEY }, inputId: 'note-1' }
    expect(await session.runCommand(options)).toBe('noted')

    await expect(Promise.resolve(session.runCommand(options))).resolves.toBe(
      undefined,
    )
    await host.close()
  })

  it('scrubs the error that the HTTP handler sends, when it has the session', async () => {
    const { host, harness, session } = await open({ fail: false })
    await session.send('Leak it.')
    const handler = createHarnessHandler({
      host,
      harness,
      openAccess: { user: ada },
    })

    // The media type is in the error text of the upload.
    const response = await handler(
      new Request(`http://h.test/media?threadId=${THREAD}&name=x`, {
        method: 'POST',
        headers: { 'Content-Type': `x/${KEY}` },
        body: 'x',
      }),
    )

    expect(response.status).toBe(415)
    const body = JSON.stringify(await response.json())
    expect(body).toContain('[redacted]')
    expect(body).not.toContain(KEY_PART)
    await host.close()
  })

  it('scrubs an error with the secrets of a session, and keeps its class', async () => {
    const { host, session } = await open({ fail: false })
    await session.send('Leak it.')
    class AppError extends Error {}

    const scrubbed = scrubbedBy(session, new AppError(`Refused ${KEY}.`))

    expect(scrubbed).toBeInstanceOf(AppError)
    expect(String(scrubbed)).toContain('Refused [redacted].')
    expect(String(scrubbed)).not.toContain(KEY_PART)
    // With no session, the error stays as it is.
    const raw = new Error(`Refused ${KEY}.`)
    expect(scrubbedBy(undefined, raw)).toBe(raw)
    expect(raw.message).toContain(KEY_PART)
    await host.close()
  })
})

describe('Redactor', () => {
  it('scrubs the raw, JSON-escaped, and URL-encoded forms in strings at any depth', () => {
    const redactor = createRedactor()
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
    const redactor = createRedactor()
    redactor.add(KEY)
    const clean = { a: { b: ['x', 1] }, c: 'text' }
    expect(redactor.redact(clean)).toBe(clean)

    const mixed = { clean: clean.a, dirty: { key: KEY } }
    const redacted = redactor.redact(mixed)
    expect(redacted).not.toBe(mixed)
    expect(redacted.clean).toBe(clean.a)
    expect(redacted.dirty).toEqual({ key: '[redacted]' })
  })

  it('scrubs in Map and Set values, and adds each string of an object secret', () => {
    const redactor = createRedactor()
    redactor.add({ user: 'ada-lovelace', password: KEY, pin: 1234 })
    const state = {
      byId: new Map([['a', { key: KEY }]]),
      seen: new Set([KEY, 'clean']),
    }

    const redacted = redactor.redact(state)

    expect(redacted.byId.get('a')).toEqual({ key: '[redacted]' })
    expect([...redacted.seen]).toEqual(['[redacted]', 'clean'])
    expect(redactor.scrub('user ada-lovelace')).toBe('user [redacted]')
    // A Map and a Set with no secret stay the same objects.
    const clean = { byId: new Map([['a', 'x']]), seen: new Set(['x']) }
    expect(redactor.redact(clean)).toBe(clean)
  })

  it('leaves values shorter than 6 characters, and does nothing while it has no secret', () => {
    const redactor = createRedactor()
    const value = { pin: '12345' }
    expect(redactor.isEmpty).toBe(true)
    expect(redactor.redact(value)).toBe(value)

    redactor.add('12345')
    expect(redactor.isEmpty).toBe(true)
    expect(redactor.scrub('pin 12345')).toBe('pin 12345')
  })

  it('scrubs like the core scrubSecrets, which the harness exports', () => {
    const redactor = createRedactor()
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
    const redactor = createRedactor()
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
    const redactor = createRedactor()
    redactor.add(KEY)
    const change = await redactMiddleware(redactor).onConfig?.(
      {} as never,
      configWith('clean'),
    )
    expect(change).toBeUndefined()
  })
})
