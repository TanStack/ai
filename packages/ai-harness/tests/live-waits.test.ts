import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, defineInterrupt, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  oauthConnector,
} from '../src'
import {
  mockAdapter,
  storedThreadState,
  text,
  toolCall,
  turnInterrupts,
} from './helpers'
import type { AnyChatMiddleware } from '@tanstack/ai'
import type { HarnessRunContext, PluginSessionApi } from '../src'
import type { OAuthConfig } from '../src/oauth'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'
const alice = { id: 'alice' }

const oauth: OAuthConfig = {
  authorizationUrl: 'https://auth.example/authorize',
  tokenUrl: 'https://auth.example/token',
  deviceUrl: 'https://auth.example/device',
  clientId: 'client-1',
}

/**
 * A device login for `github`. The server sends `device`, then each token
 * request waits for `release` and gets a token.
 */
function githubLogin(device: Record<string, unknown>, release: Promise<void>) {
  const fake: typeof fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url === oauth.deviceUrl) return Response.json(device)
    await release
    return Response.json({ access_token: 'gh-token' })
  }
  return oauthConnector({
    id: 'github',
    label: 'GitHub',
    oauth,
    login: 'device',
    fetch: fake,
    tools: () => [],
  })
}

async function openWith(
  plugins: ReturnType<typeof githubLogin>,
  persistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/live-waits',
      adapter: mockAdapter([]).adapter,
      plugins: () => [plugins],
    }),
    { threadId: THREAD, user: alice },
  )
  return { host, session, persistence }
}

describe('the sign-in of a command is a live wait', () => {
  it('opens a sign-in wait of the command run, and it ends answered when the command completes', async () => {
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const before = Date.now()
    const { host, session, persistence } = await openWith(
      githubLogin(
        {
          device_code: 'd1',
          user_code: 'WXYZ',
          verification_uri: 'https://gh.example/device',
          interval: 1,
          expires_in: 600,
        },
        released,
      ),
    )

    const command = session.runCommand({ name: 'connect:github' })
    await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
    const [wait] = session.snapshot().pendingWaits
    expect(wait).toMatchObject({
      kind: 'sign-in',
      runId: command.id,
      user: alice,
      message: 'Sign in to github with the code WXYZ.',
    })
    expect(wait?.expiresAt).toBeGreaterThanOrEqual(before + 600_000)
    expect(wait?.expiresAt).toBeLessThan(before + 15 * 60_000)

    release()
    await expect(command).resolves.toBe('Connected to GitHub.')
    await waitFor(() => expect(session.snapshot().pendingWaits).toEqual([]))
    const stored = await storedThreadState(persistence.stores.log, {
      threadId: THREAD,
    })
    expect(stored.waits.get(wait?.waitId ?? '')).toMatchObject({
      live: true,
      url: 'https://gh.example/device',
      outcome: 'answered',
    })
    await host.close()
  })

  it('ends expired at its expiresAt, and the command is cancelled', async () => {
    const { host, session, persistence } = await openWith(
      githubLogin(
        {
          device_code: 'd1',
          user_code: 'WXYZ',
          verification_uri: 'https://gh.example/device',
          // The login polls after 5 s. The code expires before that.
          interval: 5,
          expires_in: 0.3,
        },
        new Promise(() => {}),
      ),
    )

    const command = session.runCommand({ name: 'connect:github' })
    command.then(
      () => {},
      () => {},
    )
    await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
    const [wait] = session.snapshot().pendingWaits

    await expect(command).rejects.toThrow()
    expect(command.status()).toBe('cancelled')
    expect(session.snapshot().pendingWaits).toEqual([])
    const stored = await storedThreadState(persistence.stores.log, {
      threadId: THREAD,
    })
    expect(stored.waits.get(wait?.waitId ?? '')).toMatchObject({
      outcome: 'expired',
    })
    await host.close()
  })
})

/** An app interrupt that asks a person to review. */
const review = defineInterrupt({
  id: 'test/review',
  responseSchema: z.object({ ok: z.boolean() }),
})

describe('an interrupt of a turn with expiresAt', () => {
  it('ends on time: the turn takes no answer, and the thread takes new turns', async () => {
    let isAsked = false
    const asker: AnyChatMiddleware = {
      name: 'test/review',
      onInterruptBoundary: (run) => {
        if (run.phase !== 'beforeTools' || isAsked) return undefined
        isAsked = true
        return {
          interrupts: [
            review.interrupt({
              key: 'review-1',
              reason: 'review',
              message: 'Review the plan.',
              expiresAt: new Date(Date.now() + 200).toISOString(),
            }),
          ],
        }
      },
    }
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      inputSchema: z.object({ path: z.string() }),
    }).server(() => Promise.resolve({ removed: true }))
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/turn-expiry',
        adapter: mockAdapter([
          () => toolCall('remove', { path: 'a' }),
          () => text('Hello again.'),
        ]).adapter,
        tools: [remove],
        interrupts: [review],
        middleware: [asker],
      }),
      { threadId: THREAD, user: alice },
    )

    const turn = await session.send('Clean up.')
    const [interrupt] = turn.interrupts ?? []
    expect(session.snapshot().pendingWaits).toMatchObject([
      { waitId: interrupt?.id, kind: 'human' },
    ])

    await waitFor(() => expect(turnInterrupts(session.snapshot())).toEqual([]))
    expect(session.snapshot()).toMatchObject({
      status: 'idle',
      pendingWaits: [],
    })
    // An answer after the expiry finds nothing to answer.
    await expect(
      session.resolve({
        resume: [
          {
            interruptId: interrupt?.id ?? '',
            status: 'resolved',
            payload: { ok: true },
          },
        ],
      }),
    ).resolves.toMatchObject({ status: 'rejected' })
    await expect(session.send('Hello?')).resolves.toMatchObject({
      text: 'Hello again.',
    })
    await host.close()
  })

  it('shows the default expiry of a sign-in interrupt, and drops its wake when it ends', async () => {
    const listIssues = toolDefinition({
      name: 'list_issues',
      description: 'List issues',
    }).server<HarnessRunContext>(async (_args, ctx) => {
      await ctx.context.run.credentials.require('github', { wait: true })
      return ['#1']
    })
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/sign-in-expiry',
        adapter: mockAdapter([
          () => toolCall('list_issues', {}),
          () => text('No issues.'),
        ]).adapter,
        tools: [listIssues],
      }),
      { threadId: THREAD, user: alice },
    )
    const before = Date.now()
    await session.send('List my issues.')

    const { pendingWaits } = session.snapshot()
    expect(pendingWaits).toMatchObject([{ kind: 'sign-in' }])
    const expiresAt = pendingWaits[0]?.expiresAt ?? 0
    expect(expiresAt).toBeGreaterThanOrEqual(before + 15 * 60_000)
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 15 * 60_000)
    // The interrupt that a client answers stays as chat() made it.
    expect(pendingWaits[0]?.interrupt?.expiresAt).toBeUndefined()
    const interruptId = pendingWaits[0]?.waitId ?? ''
    const schedules = async () =>
      (await storedThreadState(persistence.stores.log, { threadId: THREAD }))
        .schedules
    expect((await schedules()).get(`wait:${interruptId}`)).toEqual({
      at: expiresAt,
    })

    const receipt = await session.resolve({
      resume: [{ interruptId, status: 'cancelled' }],
      inputId: 'no',
    })
    expect(receipt.status).toBe('accepted')
    await session.settled({ inputId: 'no' })
    await waitFor(async () =>
      expect((await schedules()).has(`wait:${interruptId}`)).toBe(false),
    )
    await host.close()
  })
})

describe('a live wait of a tool call', () => {
  /**
   * A plugin with the agent `booker`. Its tool `book` asks for a city as a
   * live wait of its run, the way an MCP elicitation asks.
   */
  function booking() {
    const model = mockAdapter([
      () => toolCall('book', {}),
      () => text('Booked.'),
    ])
    // The session API of the plugin, as an MCP plugin has it.
    let session: PluginSessionApi | undefined
    const asker = definePlugin({
      name: 'test/asker',
      setup: (ctx) => {
        session = ctx.session
        return {}
      },
    })
    const book = toolDefinition({
      name: 'book',
      description: 'Book a trip',
    }).server((_args, call) => {
      const { run } = call?.context as HarnessRunContext
      if (!session) throw new Error('The plugin is not set up.')
      return session.ask({
        message: 'Which city?',
        schema: z.string(),
        live: { name: 'mcp-elicitation', run },
      })
    })
    const booker = defineAgent({
      name: 'booker',
      description: 'Books trips',
      run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [book] }),
    })
    return defineHarness({
      name: 'test/live-tool-wait',
      adapter: mockAdapter([]).adapter,
      agents: [booker],
      plugins: () => [asker],
    })
  }

  it('belongs to the background run of the call, and an answer goes to the call', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const session = await host.open(booking(), {
      threadId: THREAD,
      user: alice,
    })
    const run = session.agents.booker.start()
    const wait = await session.waitForRun({
      runId: run.id,
      signal: AbortSignal.timeout(5_000),
    })
    expect(wait).toMatchObject({
      kind: 'question',
      runId: run.id,
      user: alice,
      message: 'Which city?',
    })

    await session.answer({ questionId: wait.waitId, value: 'Paris' })
    await expect(run).resolves.toBe('Booked.')
    const stored = await storedThreadState(persistence.stores.log, {
      threadId: THREAD,
    })
    expect(stored.waits.get(wait.waitId)).toMatchObject({
      live: true,
      outcome: 'answered',
    })
    await host.close()
  })

  it('ends cancelled when its run is cancelled', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const session = await host.open(booking(), {
      threadId: THREAD,
      user: alice,
    })
    const run = session.agents.booker.start()
    run.then(
      () => {},
      () => {},
    )
    const wait = await session.waitForRun({ runId: run.id })

    await session.cancel({ operationId: run.id })
    await expect(run).rejects.toThrow()
    expect(session.snapshot().pendingWaits).toEqual([])
    const stored = await storedThreadState(persistence.stores.log, {
      threadId: THREAD,
    })
    expect(stored.waits.get(wait.waitId)).toMatchObject({
      outcome: 'cancelled',
    })
    await host.close()
  })
})
