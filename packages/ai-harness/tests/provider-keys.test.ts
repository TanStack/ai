import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { defineByokProvider, keyedAdapter } from '@tanstack/ai/byok'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { HARNESS_EVENTS, createHarnessHost, defineHarness } from '../src'
import { compact, goal, modelPicker, providerKeys } from '../src/first-party'
import { createSessionView } from '../src/view'
import { mockAdapter, text, toolCall } from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  AnyAgent,
  HarnessPlugin,
  HarnessSession,
  SessionEvent,
} from '../src'

const acme = defineByokProvider({
  id: 'acme',
  label: 'Acme',
  env: 'ACME_TEST_KEY',
})
const beta = defineByokProvider({
  id: 'beta',
  label: 'Beta',
  env: 'BETA_TEST_KEY',
})
const gamma = defineByokProvider({ id: 'gamma', label: 'Gamma' })

/** The credential scope of the test user. */
const USER = { threadId: 't', userId: 'user-1' }
const SAVED_KEY = 'sk-acme-saved-1234'
const PASTED_KEY = 'sk-acme-pasted-5678'

afterEach(() => {
  vi.unstubAllEnvs()
})

/** A keyed adapter for `acme` whose turns are scripted. Records each key it got. */
function keyedMock(replies: Parameters<typeof mockAdapter>[0]) {
  const mock = mockAdapter(replies)
  const keys: Array<string> = []
  const adapter = keyedAdapter(acme, (key) => {
    keys.push(key)
    return mock.adapter
  })
  return { adapter, keys, calls: mock.calls }
}

async function open(options: {
  adapter: AnyTextAdapter | ReturnType<typeof keyedMock>['adapter']
  plugins?: Array<HarnessPlugin>
  agents?: Array<AnyAgent>
  subagents?: Array<AnyAgent>
}) {
  const persistence = memoryPersistence()
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/provider-keys',
      adapter: options.adapter,
      agents: options.agents ?? [],
      subagents: { agents: options.subagents ?? [] },
      plugins: () => options.plugins ?? [],
    }),
    { threadId: 't', principal: { id: 'user-1' } },
  )
  const events: Array<SessionEvent> = []
  const reader = new AbortController()
  const reading = (async () => {
    for await (const entry of session.events({ signal: reader.signal }))
      events.push(entry)
  })()
  const saveKey = (value: string) =>
    persistence.stores.credentials.set(USER, 'acme', {
      type: 'api_key',
      value,
    })
  const close = async () => {
    reader.abort()
    await reading
    await host.close()
  }
  return { session, persistence, events, saveKey, close }
}

/** The connectors named by the `harness.auth_required` events. */
function authRequired(events: ReadonlyArray<SessionEvent>) {
  return events.flatMap(({ event }) =>
    event.type === EventType.CUSTOM &&
    event.name === HARNESS_EVENTS.authRequired
      ? [event.value]
      : [],
  )
}

/** Start `/connect acme`, and answer its question with `answer`. */
async function connectWith(session: HarnessSession, answer: string) {
  const result = session.command('connect:acme')
  await vi.waitFor(() =>
    expect(session.snapshot().pendingQuestions).toHaveLength(1),
  )
  const [question] = session.snapshot().pendingQuestions
  const receipt = await session.answer(question?.questionId ?? '', answer)
  return { question, receipt, result: await result }
}

describe('a keyed main adapter', () => {
  it('uses the key saved in the credential store before the env var', async () => {
    vi.stubEnv('ACME_TEST_KEY', 'sk-acme-env-0000')
    const keyed = keyedMock([() => text('hello from acme')])
    const { session, saveKey, close } = await open({ adapter: keyed.adapter })
    await saveKey(SAVED_KEY)
    expect(await session.prompt('hi')).toEqual({ text: 'hello from acme' })
    expect(keyed.keys).toEqual([SAVED_KEY])
    await close()
  })

  it('reads the env var when no key is saved', async () => {
    vi.stubEnv('ACME_TEST_KEY', 'sk-acme-env-0000')
    const keyed = keyedMock([() => text('hello')])
    const { session, close } = await open({ adapter: keyed.adapter })
    await session.prompt('hi')
    expect(keyed.keys).toEqual(['sk-acme-env-0000'])
    await close()
  })

  it('stops the turn and asks for a sign-in when there is no key', async () => {
    vi.stubEnv('ACME_TEST_KEY', '')
    const keyed = keyedMock([() => text('never')])
    const { session, events, close } = await open({ adapter: keyed.adapter })
    await expect(session.prompt('hi')).rejects.toThrow(
      'Sign in to acme first. Run /connect acme.',
    )
    expect(keyed.calls).toHaveLength(0)
    expect(authRequired(events)).toEqual([{ connector: 'acme' }])
    await close()
  })

  it('builds a keyed model picker choice after /model', async () => {
    const plain = mockAdapter([() => text('plain answer')])
    const keyed = keyedMock([() => text('keyed answer')])
    const { session, saveKey, close } = await open({
      adapter: plain.adapter,
      plugins: [
        modelPicker({
          choices: { plain: plain.adapter, acme: keyed.adapter },
          default: 'plain',
        }),
      ],
    })
    await saveKey(SAVED_KEY)
    await session.command('model', 'acme')
    expect(await session.prompt('hi')).toEqual({ text: 'keyed answer' })
    expect(keyed.keys).toEqual([SAVED_KEY])
    await close()
  })
})

describe('ctx.keys in agents', () => {
  /** An agent that builds a keyed adapter with `ctx.keys` and answers with it. */
  function writerWith(adapter: ReturnType<typeof keyedMock>['adapter']) {
    return defineAgent({
      name: 'writer',
      description: 'Writes with the Acme model',
      run: async (ctx) =>
        ctx.chat({ adapter: await ctx.keys.adapter(adapter), stream: false }),
    })
  }

  it('gives a background agent the session keys', async () => {
    const keyed = keyedMock([() => text('agent answer')])
    const { session, saveKey, close } = await open({
      adapter: mockAdapter([]).adapter,
      agents: [writerWith(keyed.adapter)],
    })
    await saveKey(SAVED_KEY)
    expect(await session.agent('writer')?.run()).toBe('agent answer')
    expect(keyed.keys).toEqual([SAVED_KEY])
    await close()
  })

  it('gives a subagent the model calls the session keys', async () => {
    const keyed = keyedMock([() => text('draft')])
    const lead = mockAdapter([
      () => toolCall('writer', {}),
      () => text('The writer is done.'),
    ])
    const { session, saveKey, close } = await open({
      adapter: lead.adapter,
      subagents: [writerWith(keyed.adapter)],
    })
    await saveKey(SAVED_KEY)
    expect(await session.prompt('write it')).toEqual({
      text: 'The writer is done.',
    })
    expect(keyed.keys).toEqual([SAVED_KEY])
    await close()
  })
})

describe('compact and goal with a keyed adapter', () => {
  it('compacts with the saved key', async () => {
    const summarizer = keyedMock([() => text('We talked.')])
    const main = mockAdapter([() => text('one'), () => text('two')])
    const { session, saveKey, close } = await open({
      adapter: main.adapter,
      plugins: [compact({ adapter: summarizer.adapter })],
    })
    await saveKey(SAVED_KEY)
    await session.prompt('first')
    await session.prompt('second')
    expect(await session.command('compact')).toBe(
      'Compacted 4 messages into a summary.',
    )
    expect(summarizer.keys).toEqual([SAVED_KEY])
    await close()
  })

  it('judges the goal with the saved key', async () => {
    const keys: Array<string> = []
    const keyedJudge = keyedAdapter(acme, (key) => {
      keys.push(key)
      const judge: AnyTextAdapter = {
        ...mockAdapter([]).adapter,
        structuredOutput: async () => ({
          data: { met: true, reason: 'Done.' },
          rawText: '{"met":true,"reason":"Done."}',
        }),
      }
      return judge
    })
    const { session, saveKey, close } = await open({
      adapter: mockAdapter([() => text('did it')]).adapter,
      plugins: [goal({ judge: keyedJudge })],
    })
    await saveKey(SAVED_KEY)
    await session.command('goal', 'ship it')
    await vi.waitFor(async () =>
      expect(await session.command('goal')).toContain('Status: met'),
    )
    expect(keys).toEqual([SAVED_KEY])
    await close()
  })
})

describe('providerKeys', () => {
  function plugin() {
    return providerKeys({ providers: [acme, beta, gamma] })
  }

  it('saves a pasted key and shows it masked', async () => {
    const { session, persistence, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    const { question, result } = await connectWith(session, `  ${PASTED_KEY}  `)
    expect(question).toMatchObject({
      message: 'Paste your Acme API key',
      secret: true,
    })
    expect(result).toBe('Connected to Acme (key ...5678).')
    expect(await persistence.stores.credentials.get(USER, 'acme')).toEqual({
      type: 'api_key',
      value: PASTED_KEY,
    })
    expect(await session.command('keys')).toContain(
      'Acme: connected (key ...5678)',
    )
    await close()
  })

  it('refuses an empty key', async () => {
    const { session, persistence, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    await expect(connectWith(session, '   ')).rejects.toThrow(
      'No Acme key was given. Nothing was saved.',
    )
    expect(await persistence.stores.credentials.get(USER, 'acme')).toBeNull()
    await close()
  })

  it('deletes the key on disconnect', async () => {
    const { session, persistence, saveKey, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    await saveKey(SAVED_KEY)
    expect(await session.command('disconnect:acme')).toBe(
      'Disconnected from Acme.',
    )
    expect(await persistence.stores.credentials.get(USER, 'acme')).toBeNull()
    expect(await session.command('keys')).toContain(
      'Acme: missing. Run /connect acme.',
    )
    await close()
  })

  it('runs signIn with open through authRequired and saves its key', async () => {
    const signIn = async (ctx: { open: (url: string) => void }) => {
      ctx.open('https://acme.example/sign-in')
      return 'sk-acme-signed-9876'
    }
    const { session, persistence, events, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [providerKeys({ providers: [{ ...acme, signIn }] })],
    })
    expect(await session.command('connect:acme')).toBe(
      'Connected to Acme (key ...9876).',
    )
    expect(authRequired(events)).toEqual([
      { connector: 'acme', url: 'https://acme.example/sign-in' },
    ])
    expect(await persistence.stores.credentials.get(USER, 'acme')).toEqual({
      type: 'api_key',
      value: 'sk-acme-signed-9876',
    })
    await close()
  })

  it('lists every provider with its state in the plugin state', async () => {
    vi.stubEnv('BETA_TEST_KEY', 'sk-beta-env-4321')
    const { session, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    expect(session.snapshot().plugins['tanstack/provider-keys']).toEqual({
      providers: [
        { id: 'acme', label: 'Acme', state: 'missing' },
        { id: 'beta', label: 'Beta', state: 'env' },
        { id: 'gamma', label: 'Gamma', state: 'missing' },
      ],
    })
    expect(await session.command('keys')).toBe(
      [
        'Acme: missing. Run /connect acme.',
        'Beta: from the BETA_TEST_KEY env var',
        'Gamma: missing. Run /connect gamma.',
      ].join('\n'),
    )
    await connectWith(session, PASTED_KEY)
    expect(session.snapshot().plugins['tanstack/provider-keys']).toEqual({
      providers: [
        { id: 'acme', label: 'Acme', state: 'connected' },
        { id: 'beta', label: 'Beta', state: 'env' },
        { id: 'gamma', label: 'Gamma', state: 'missing' },
      ],
    })
    await close()
  })

  it('shows a secret question as secret in the view', async () => {
    const { session, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    const view = createSessionView(session)
    await view.ready
    const connecting = session.command('connect:acme')
    await vi.waitFor(() =>
      expect(view.store.get().questions).toMatchObject([
        { message: 'Paste your Acme API key', secret: true },
      ]),
    )
    await view.store.get().questions[0]?.answer(PASTED_KEY)
    await connecting
    view.dispose()
    await close()
  })

  it('keeps the key out of events, results, the inbox, and the transcript', async () => {
    const keyed = keyedMock([() => text('hello')])
    const { session, persistence, events, close } = await open({
      adapter: keyed.adapter,
      plugins: [plugin()],
    })
    const { receipt, result } = await connectWith(session, PASTED_KEY)
    const results = [
      result,
      await session.command('keys'),
      await session.prompt('hi'),
    ]
    expect(keyed.keys).toEqual([PASTED_KEY])
    const inbox = await persistence.stores.inbox.get(receipt.inputId)
    const transcript = await persistence.stores.messages.loadThread('t')
    const everything = JSON.stringify({ events, results, inbox, transcript })
    expect(everything).not.toContain(PASTED_KEY)
    expect(everything).toContain('...5678')
    await close()
  })
})
