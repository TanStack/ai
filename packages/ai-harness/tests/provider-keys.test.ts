import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { defineByokProvider, keyedAdapter } from '@tanstack/ai/byok'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
  logIdOf,
} from '../src'
import { compact, modelPicker, providerKeys } from '../src/first-party'
import { mockAdapter, questionsOf, text, toolCall } from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  AnyAgent,
  HarnessPlugin,
  HarnessSession,
  SessionEvent,
} from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

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
  /** A host with access that allows each action, without `allowServerEnvKeys`. */
  access?: boolean
}) {
  const persistence = memoryPersistence()
  const credentials = memoryCredentialStore()
  const host = createHarnessHost({
    persistence,
    credentials,
    ...(options.access
      ? { access: { getUser: () => null, rules: { isAllowed: () => true } } }
      : {}),
  })
  const session = await host.open(
    defineHarness({
      name: 'test/provider-keys',
      adapter: options.adapter,
      agents: options.agents ?? [],
      subagents: { agents: options.subagents ?? [] },
      plugins: () => options.plugins ?? [],
    }),
    {
      threadId: 't',
      user: { id: 'user-1' },
    },
  )
  const events: Array<SessionEvent> = []
  const reader = new AbortController()
  const reading = (async () => {
    for await (const entry of session.events({ signal: reader.signal }))
      events.push(entry)
  })()
  const saveKey = (value: string) =>
    credentials.set({
      scope: USER,
      id: 'acme',
      credential: {
        type: 'api_key',
        value,
      },
    })
  const close = async () => {
    reader.abort()
    await reading
    await host.close()
  }
  return { session, persistence, credentials, events, saveKey, close }
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
  const result = session.runCommand({ name: 'connect:acme' })
  await waitFor(() => expect(questionsOf(session.snapshot())).toHaveLength(1))
  const [question] = questionsOf(session.snapshot())
  const receipt = await session.answer({
    questionId: question?.questionId ?? '',
    value: answer,
  })
  return { question, receipt, result: await result }
}

describe('a keyed main adapter', () => {
  it('uses the key saved in the credential store before the env var', async () => {
    vi.stubEnv('ACME_TEST_KEY', 'sk-acme-env-0000')
    const keyed = keyedMock([() => text('hello from acme')])
    const { session, saveKey, close } = await open({ adapter: keyed.adapter })
    await saveKey(SAVED_KEY)
    expect(await session.send('hi')).toEqual({
      text: 'hello from acme',
      media: [],
    })
    expect(keyed.keys).toEqual([SAVED_KEY])
    await close()
  })

  it('reads the env var when no key is saved', async () => {
    vi.stubEnv('ACME_TEST_KEY', 'sk-acme-env-0000')
    const keyed = keyedMock([() => text('hello')])
    const { session, close } = await open({ adapter: keyed.adapter })
    await session.send('hi')
    expect(keyed.keys).toEqual(['sk-acme-env-0000'])
    await close()
  })

  it('stops the turn and asks for a sign-in when there is no key', async () => {
    vi.stubEnv('ACME_TEST_KEY', '')
    const keyed = keyedMock([() => text('never')])
    const { session, events, close } = await open({ adapter: keyed.adapter })
    await expect(session.send('hi')).rejects.toThrow(
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
    await session.runCommand({ name: 'model', input: 'acme' })
    expect(await session.send('hi')).toEqual({
      text: 'keyed answer',
      media: [],
    })
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
    expect(await session.send('write it')).toEqual({
      text: 'The writer is done.',
      media: [],
    })
    expect(keyed.keys).toEqual([SAVED_KEY])
    await close()
  })
})

describe('compact with a keyed adapter', () => {
  it('compacts with the saved key', async () => {
    const summarizer = keyedMock([() => text('We talked.')])
    const main = mockAdapter([() => text('one'), () => text('two')])
    const { session, saveKey, close } = await open({
      adapter: main.adapter,
      plugins: [compact({ adapter: summarizer.adapter })],
    })
    await saveKey(SAVED_KEY)
    await session.send('first')
    await session.send('second')
    expect(await session.runCommand({ name: 'compact' })).toBe(
      'Compacted 4 messages into a summary.',
    )
    expect(summarizer.keys).toEqual([SAVED_KEY])
    await close()
  })
})

describe('providerKeys', () => {
  function plugin() {
    return providerKeys({ providers: [acme, beta, gamma] })
  }

  it('saves a pasted key and shows it masked', async () => {
    const { session, credentials, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    const { question, result } = await connectWith(session, `  ${PASTED_KEY}  `)
    expect(question).toMatchObject({
      message: 'Paste your Acme API key',
      secret: true,
    })
    expect(result).toBe('Connected to Acme (key ...5678).')
    expect(await credentials.get({ scope: USER, id: 'acme' })).toEqual({
      type: 'api_key',
      value: PASTED_KEY,
    })
    expect(await session.runCommand({ name: 'keys' })).toContain(
      'Acme: connected (key ...5678)',
    )
    await close()
  })

  it('scrubs a key that /connect saved from the errors of the session', async () => {
    const leaky = defineAgent({
      name: 'leaky',
      description: 'Fails with the key in its error',
      run: async () => {
        throw new Error(`fetch failed: Bearer ${PASTED_KEY}`)
      },
    })
    const { session, close } = await open({
      adapter: mockAdapter([]).adapter,
      agents: [leaky],
      plugins: [plugin()],
    })
    await connectWith(session, PASTED_KEY)
    const errors: Array<string> = []
    session.onEvent(EventType.RUN_ERROR, ({ event }) => {
      errors.push(event.message)
    })
    await expect(session.agent('leaky')?.run()).rejects.toThrow('[redacted]')
    expect(errors).toEqual(['fetch failed: Bearer [redacted]'])
    await close()
  })

  it('refuses an empty key', async () => {
    const { session, credentials, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    await expect(connectWith(session, '   ')).rejects.toThrow(
      'No Acme key was given. Nothing was saved.',
    )
    expect(await credentials.get({ scope: USER, id: 'acme' })).toBeNull()
    await close()
  })

  it('stops a cancelled /connect, and a late answer saves nothing', async () => {
    const { session, credentials, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    const connecting = session.runCommand({ name: 'connect:acme' })
    await waitFor(() => expect(questionsOf(session.snapshot())).toHaveLength(1))
    const [question] = questionsOf(session.snapshot())
    await connecting.cancel()
    await expect(connecting).rejects.toBeDefined()
    if (question)
      await session.answer({
        questionId: question.questionId,
        value: PASTED_KEY,
      })
    expect(await credentials.get({ scope: USER, id: 'acme' })).toBeNull()
    await close()
  })

  it('deletes the key on disconnect', async () => {
    const { session, credentials, saveKey, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    await saveKey(SAVED_KEY)
    expect(await session.runCommand({ name: 'disconnect:acme' })).toBe(
      'Disconnected from Acme.',
    )
    expect(await credentials.get({ scope: USER, id: 'acme' })).toBeNull()
    expect(await session.runCommand({ name: 'keys' })).toContain(
      'Acme: missing. Run /connect acme.',
    )
    await close()
  })

  it('opens the key page of a provider with keyUrl before it asks', async () => {
    const { session, credentials, events, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [
        providerKeys({
          providers: [{ ...acme, keyUrl: 'https://acme.example/keys' }],
        }),
      ],
    })
    const { question, result } = await connectWith(session, PASTED_KEY)
    expect(authRequired(events)).toEqual([
      { connector: 'acme', url: 'https://acme.example/keys' },
    ])
    expect(question).toMatchObject({
      message:
        'Paste your Acme API key. The page to make one is open in your browser.',
      secret: true,
    })
    expect(result).toBe('Connected to Acme (key ...5678).')
    expect(await credentials.get({ scope: USER, id: 'acme' })).toEqual({
      type: 'api_key',
      value: PASTED_KEY,
    })
    await close()
  })

  it('runs signIn with open through authRequired and saves its key', async () => {
    const signIn = async (ctx: { open: (url: string) => void }) => {
      ctx.open('https://acme.example/sign-in')
      return 'sk-acme-signed-9876'
    }
    const { session, credentials, events, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [providerKeys({ providers: [{ ...acme, signIn }] })],
    })
    expect(await session.runCommand({ name: 'connect:acme' })).toBe(
      'Connected to Acme (key ...9876).',
    )
    expect(authRequired(events)).toEqual([
      { connector: 'acme', url: 'https://acme.example/sign-in' },
    ])
    expect(await credentials.get({ scope: USER, id: 'acme' })).toEqual({
      type: 'api_key',
      value: 'sk-acme-signed-9876',
    })
    await close()
  })

  it('lists the env vars in the plugin state, and the keys of the user only in /keys', async () => {
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
    expect(await session.runCommand({ name: 'keys' })).toBe(
      [
        'Acme: missing. Run /connect acme.',
        'Beta: from the BETA_TEST_KEY env var',
        'Gamma: missing. Run /connect gamma.',
      ].join('\n'),
    )
    await connectWith(session, PASTED_KEY)
    // Every member reads the state: the key of one user is not in it.
    expect(session.snapshot().plugins['tanstack/provider-keys']).toEqual({
      providers: [
        { id: 'acme', label: 'Acme', state: 'missing' },
        { id: 'beta', label: 'Beta', state: 'env' },
        { id: 'gamma', label: 'Gamma', state: 'missing' },
      ],
    })
    expect(await session.runCommand({ name: 'keys' })).toContain(
      'Acme: connected (key ...5678)',
    )
    await close()
  })

  it('does not show an env var that a host with access does not read', async () => {
    vi.stubEnv('BETA_TEST_KEY', 'sk-beta-env-4321')
    const { session, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
      access: true,
    })

    expect(session.snapshot().plugins['tanstack/provider-keys']).toEqual({
      providers: [
        { id: 'acme', label: 'Acme', state: 'missing' },
        { id: 'beta', label: 'Beta', state: 'missing' },
        { id: 'gamma', label: 'Gamma', state: 'missing' },
      ],
    })
    expect(await session.runCommand({ name: 'keys' })).toContain(
      'Beta: missing. Run /connect beta.',
    )
    await close()
  })

  it('marks the key question as secret in the snapshot', async () => {
    const { session, close } = await open({
      adapter: mockAdapter([]).adapter,
      plugins: [plugin()],
    })
    const connecting = session.runCommand({ name: 'connect:acme' })
    await waitFor(() =>
      expect(questionsOf(session.snapshot())).toMatchObject([
        { message: 'Paste your Acme API key', secret: true },
      ]),
    )
    const [question] = questionsOf(session.snapshot())
    if (question)
      await session.answer({
        questionId: question.questionId,
        value: PASTED_KEY,
      })
    await connecting
    await close()
  })

  it('keeps the key out of events, results, the log, and the transcript', async () => {
    const keyed = keyedMock([() => text('hello')])
    const { session, persistence, events, close } = await open({
      adapter: keyed.adapter,
      plugins: [plugin()],
    })
    const { result } = await connectWith(session, PASTED_KEY)
    const results = [
      result,
      await session.runCommand({ name: 'keys' }),
      await session.send('hi'),
    ]
    expect(keyed.keys).toEqual([PASTED_KEY])
    // The log of the thread `t`, in the default tenant: inputs and events.
    const logged = await persistence.stores.log.read({
      logId: logIdOf({ logId: 't' }),
    })
    const transcript = await session.transcript()
    const everything = JSON.stringify({ events, results, logged, transcript })
    expect(everything).not.toContain(PASTED_KEY)
    expect(everything).toContain('...5678')
    await close()
  })
})
