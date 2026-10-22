import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  AuthRequiredError,
  HARNESS_EVENTS,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  logIdOf,
  oauthConnector,
} from '../src'
import { createHarnessHandler } from '../src/server'
import {
  after,
  appendToLog,
  gate,
  mockAdapter,
  storedThreadState,
  text,
  toolCall,
  turnInterrupts,
} from './helpers'
import type { HarnessRunContext, HarnessSession } from '../src'
import type { OAuthConfig } from '../src/oauth'
import type { Reply } from './helpers'

const oauth: OAuthConfig = {
  authorizationUrl: 'https://auth.example/authorize',
  tokenUrl: 'https://auth.example/token',
  deviceUrl: 'https://auth.example/device',
  clientId: 'client-1',
  scopes: ['repo'],
}

/**
 * A `github` tool that needs a credential, and a `connect:github` command
 * that saves one. `wait` is the option the tool gives `require`.
 */
function github(seen: Array<string>, wait: boolean) {
  return definePlugin({
    name: 'test/github',
    setup: () => ({
      tools: [
        toolDefinition({
          name: 'list_issues',
          description: 'List issues',
        }).server<HarnessRunContext>(async (_args, ctx) => {
          const credential = await ctx.context.run.credentials.require(
            'github',
            wait ? { wait: true } : undefined,
          )
          seen.push(credential.type === 'api_key' ? credential.value : '')
          return ['#1']
        }),
      ],
      commands: {
        // A command saves for the user who runs it.
        'connect:github': defineCommand({
          description: 'Sign in to GitHub',
          run: async (_input, command) => {
            await command.credentials.set({
              id: 'github',
              credential: {
                type: 'api_key',
                value: `${command.user?.id}-key`,
              },
            })
            return 'Connected.'
          },
        }),
        // A save of another credential, for the user who runs the command.
        note: defineCommand({
          description: 'Save a note credential',
          run: (_input, command) =>
            command.credentials.set({
              id: 'note',
              credential: { type: 'api_key', value: 'n' },
            }),
        }),
      },
    }),
  })
}

/** The next settlement that is not `interrupted`. Start it before the input. */
function nextEnd(session: HarnessSession) {
  return (async () => {
    for await (const { event } of session.events({
      from: session.snapshot().cursor,
    })) {
      if (event.type !== 'CUSTOM' || event.name !== HARNESS_EVENTS.inputSettled)
        continue
      const value = event.value as { inputId: string; outcome: string }
      // The connect command settles too. Wait for the turn the sign-in resumes.
      if (!value.inputId.startsWith('sign-in:')) continue
      if (value.outcome !== 'interrupted') return value
    }
    throw new Error('The session closed.')
  })()
}

/** The stores of a durable host, so a second host reads the same thread. */
function durableStores() {
  const { metadata } = memoryPersistence().stores
  return { log: memoryLogStore(), metadata }
}

describe('require with wait', () => {
  it('stops the turn for the sign-in, and connect runs the tool again', async () => {
    const seenTokens: Array<string> = []
    const responses: Array<Record<string, unknown>> = [
      {
        device_code: 'd1',
        user_code: 'WXYZ',
        verification_uri: 'https://gh.example/device',
        interval: 1,
      },
      { access_token: 'gh-token' },
    ]
    const fake: typeof fetch = async () =>
      new Response(JSON.stringify(responses.shift()), {
        headers: { 'content-type': 'application/json' },
      })
    const connector = oauthConnector({
      id: 'github',
      label: 'GitHub',
      oauth,
      login: 'device',
      fetch: fake,
      tools: (token) => [
        toolDefinition({
          name: 'list_issues',
          description: 'List issues',
        }).server<HarnessRunContext>(async (_args, ctx) => {
          seenTokens.push(await token({ run: ctx.context.run, wait: true }))
          return ['#1']
        }),
      ],
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('list_issues', {}),
      () => text('One issue.'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/auth-wait',
        adapter,
        plugins: () => [connector],
      }),
      {
        threadId: 't',
        user: { id: 'user-1' },
      },
    )
    const signIns: Array<unknown> = []
    const reader = new AbortController()
    void (async () => {
      for await (const { event } of session.events({
        signal: reader.signal,
      })) {
        if (
          event.type === 'CUSTOM' &&
          event.name === HARNESS_EVENTS.authRequired
        )
          signIns.push(event.value)
      }
    })()

    const turn = await session.send('List my issues.', { inputId: 'ask' })
    expect(turn.interrupts).toMatchObject([
      {
        reason: 'auth_required',
        toolCallId: 'call-1',
        metadata: {
          'tanstack:interruptPayload': { request: { connector: 'github' } },
        },
      },
    ])
    expect(await session.settled({ inputId: 'ask' })).toMatchObject({
      outcome: 'interrupted',
    })
    expect(signIns).toEqual([{ connector: 'github' }])
    expect(seenTokens).toEqual([])

    const ended = nextEnd(session)
    await expect(session.runCommand({ name: 'connect:github' })).resolves.toBe(
      'Connected to GitHub.',
    )
    expect(await ended).toMatchObject({ outcome: 'completed' })
    expect(seenTokens).toEqual(['gh-token'])
    // No new prompt: the second model call is the answer of the same turn.
    expect(calls).toHaveLength(2)
    expect(turnInterrupts(session.snapshot())).toEqual([])
    reader.abort()
    await host.close()
  })

  it('continues the turn on another host after a restart', async () => {
    const stores = durableStores()
    const seen: Array<string> = []
    const start = (replies: Array<Reply>) => {
      const { adapter } = mockAdapter(replies)
      const host = createHarnessHost({ persistence: { stores } })
      const harness = defineHarness({
        name: 'test/auth-wait-restart',
        adapter,
        plugins: () => [github(seen, true)],
      })
      return {
        host,
        open: () =>
          host.open(harness, { threadId: 't', user: { id: 'user-1' } }),
      }
    }

    const a = start([() => toolCall('list_issues', {})])
    const turn = await (await a.open()).send('List my issues.')
    expect(turn.interrupts?.[0]?.reason).toBe('auth_required')
    await a.host.close()

    const b = start([() => text('One issue.')])
    const session = await b.open()
    expect(turnInterrupts(session.snapshot())).toMatchObject([
      { reason: 'auth_required' },
    ])
    const ended = nextEnd(session)
    await session.runCommand({ name: 'connect:github' })
    expect(await ended).toMatchObject({ outcome: 'completed' })
    expect(seen).toEqual(['user-1-key'])
    await b.host.close()
  })

  it('fails the tool as before when the user cancels the sign-in', async () => {
    const seen: Array<string> = []
    const { adapter, calls } = mockAdapter([
      () => toolCall('list_issues', {}),
      () => text('You did not sign in.'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/auth-wait-cancel',
        adapter,
        plugins: () => [github(seen, true)],
      }),
      {
        threadId: 't',
        user: { id: 'user-1' },
      },
    )
    const turn = await session.send('List my issues.')
    const interruptId = turn.interrupts?.[0]?.id
    if (!interruptId) throw new Error('The turn did not stop for the sign-in.')

    const receipt = await session.resolve({
      resume: [{ interruptId, status: 'cancelled' }],
      inputId: 'no',
    })
    expect(receipt.status).toBe('accepted')
    expect(await session.settled({ inputId: 'no' })).toMatchObject({
      outcome: 'completed',
    })
    expect(seen).toEqual([])
    expect(turnInterrupts(session.snapshot())).toEqual([])
    // The model got the tool error, as without `wait`.
    expect(JSON.stringify(calls[1]?.messages)).toContain(
      'Sign in to github first',
    )
    await host.close()
  })

  it('fails the tool without wait, as before', async () => {
    const seen: Array<string> = []
    const { adapter, calls } = mockAdapter([
      () => toolCall('list_issues', {}),
      () => text('Sign in first.'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/auth-no-wait',
        adapter,
        plugins: () => [github(seen, false)],
      }),
      {
        threadId: 't',
        user: { id: 'user-1' },
      },
    )
    const turn = await session.send('List my issues.', { inputId: 'ask' })
    expect(turn.interrupts).toBeUndefined()
    expect(await session.settled({ inputId: 'ask' })).toMatchObject({
      outcome: 'completed',
    })
    expect(JSON.stringify(calls[1]?.messages)).toContain(
      'Sign in to github first',
    )

    // A credential saved later starts nothing.
    await session.runCommand({ name: 'connect:github' })
    expect(calls).toHaveLength(2)
    expect(seen).toEqual([])
    await host.close()
  })

  it('does not wait in a command, also while a turn runs', async () => {
    const started = gate()
    const release = gate()
    const { adapter } = mockAdapter([
      (request) => (started.open(), after(release.opened, 'Done.')(request)),
    ])
    const caught: Array<unknown> = []
    const checker = definePlugin({
      name: 'test/checker',
      setup: () => ({
        commands: {
          check: defineCommand({
            description: 'Check the GitHub sign-in',
            run: async (_input, { credentials }) => {
              await credentials
                .require('github', { wait: true })
                .catch((error: unknown) => caught.push(error))
            },
          }),
        },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/auth-command-wait',
        adapter,
        plugins: () => [checker],
      }),
      {
        threadId: 't',
        user: { id: 'user-1' },
      },
    )
    const turn = session.send('Work.')
    await started.opened
    await session.runCommand({ name: 'check' })
    release.open()
    await turn

    expect(caught).toHaveLength(1)
    expect(caught[0]).toBeInstanceOf(AuthRequiredError)
    await host.close()
  })
})

describe('sign-ins in a shared thread', () => {
  const alice = { id: 'alice' }
  const bob = { id: 'bob' }

  it("never answers bob's sign-in with alice's credential", async () => {
    const seen: Array<string> = []
    const { adapter, calls } = mockAdapter([
      () => toolCall('list_issues', {}),
      () => text('One issue.'),
    ])
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    await credentials.set({
      scope: { threadId: 't', userId: 'alice' },
      id: 'github',
      credential: { type: 'api_key', value: 'alice-key' },
    })
    const host = createHarnessHost({ persistence, credentials })
    const session = await host.open(
      defineHarness({
        name: 'test/auth-wait-shared',
        adapter,
        plugins: () => [github(seen, true)],
      }),
      {
        threadId: 't',
        user: alice,
      },
    )
    const turn = await session.send('List my issues.', { user: bob })
    expect(turn.interrupts?.[0]?.reason).toBe('auth_required')

    // Saves for alice, while bob's turn waits for bob's sign-in.
    await session.runCommand({ name: 'note' })
    expect(turnInterrupts(session.snapshot())).toHaveLength(1)
    await session.runCommand({ name: 'connect:github', user: alice })

    expect(seen).toEqual([])
    expect(calls).toHaveLength(1)
    expect(turnInterrupts(session.snapshot())).toMatchObject([
      { reason: 'auth_required' },
    ])
    await host.close()
  })

  it("saves bob's sign-in for bob and continues bob's turn as bob", async () => {
    const seen: Array<string> = []
    const { adapter, calls } = mockAdapter([
      () => toolCall('list_issues', {}),
      () => text('One issue.'),
    ])
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    const host = createHarnessHost({
      persistence,
      credentials,
      access: {
        getUser: ({ request }) => ({
          id: request.headers.get('x-user') ?? '',
        }),
        rules: { isAllowed: () => true },
      },
    })
    const harness = defineHarness({
      name: 'test/auth-wait-shared-http',
      adapter,
      plugins: () => [github(seen, true)],
      expose: { commands: ['connect:github'] },
    })
    const handler = createHarnessHandler({ host, harness })
    const control = async (user: string, input: object) =>
      (
        await handler(
          new Request('http://h.test/control', {
            method: 'POST',
            headers: { 'x-user': user },
            body: JSON.stringify({ threadId: 't', input }),
          }),
        )
      ).json()
    // Alice opens the thread. Bob's turn waits for bob's sign-in.
    const session = await host.open(harness, {
      threadId: 't',
      user: alice,
    })
    const asked = await control('bob', {
      op: 'prompt',
      message: 'List my issues.',
    })
    expect(await session.settled({ inputId: asked.inputId })).toMatchObject({
      outcome: 'interrupted',
    })

    const ended = nextEnd(session)
    await control('bob', { op: 'command', name: 'connect:github' })
    expect(await ended).toMatchObject({ outcome: 'completed' })
    expect(seen).toEqual(['bob-key'])
    expect(calls).toHaveLength(2)
    expect(
      await credentials.get({
        scope: { threadId: 't', userId: 'bob' },
        id: 'github',
      }),
    ).toMatchObject({ value: 'bob-key' })
    expect(
      await credentials.get({
        scope: { threadId: 't', userId: 'alice' },
        id: 'github',
      }),
    ).toBeNull()
    await host.close()
  })

  it('runs a command from control as its sender, and the log keeps the sender', async () => {
    const ran: Array<string | undefined> = []
    const stores = durableStores()
    const host = createHarnessHost({ persistence: { stores } })
    const harness = defineHarness({
      name: 'test/command-sender',
      adapter: mockAdapter([]).adapter,
      plugins: () => [
        definePlugin({
          name: 'test/whoami',
          setup: () => ({
            commands: {
              whoami: defineCommand({
                description: 'Who runs this?',
                run: (_input, command) => {
                  ran.push(command.user?.id)
                  return command.user?.id
                },
              }),
            },
          }),
        }),
      ],
      expose: { commands: ['whoami'] },
    })
    const handler = createHarnessHandler({
      host,
      harness,
      openAccess: { user: bob },
      media: { secret: 'test-secret-of-at-least-32-bytes!' },
    })
    const session = await host.open(harness, {
      threadId: 't',
      user: alice,
    })
    const receipt = await (
      await handler(
        new Request('http://h.test/control', {
          method: 'POST',
          body: JSON.stringify({
            threadId: 't',
            input: { op: 'command', name: 'whoami' },
          }),
        }),
      )
    ).json()
    await expect(session.operation(receipt.operationId)).resolves.toBe('bob')
    expect(ran).toEqual(['bob'])
    const commands = (await stores.log.read({ logId: logIdOf({ logId: 't' }) }))
      .map((entry) => entry.record)
      .filter(
        (record) =>
          record.type === 'harness.input' &&
          (record['input'] as { op?: string } | undefined)?.op === 'command',
      )
    expect(commands.map((record) => record['user'])).toEqual([{ id: 'bob' }])
    await host.close()
  })

  it('loads a stored sign-in wait from before senders were kept', async () => {
    const stores = durableStores()
    const seen: Array<string> = []
    const start = (replies: Array<Reply>) => {
      const { adapter } = mockAdapter(replies)
      const host = createHarnessHost({ persistence: { stores } })
      const harness = defineHarness({
        name: 'test/auth-wait-old-copy',
        adapter,
        plugins: () => [github(seen, true)],
      })
      return {
        host,
        open: () => host.open(harness, { threadId: 't', user: alice }),
      }
    }
    const a = start([() => toolCall('list_issues', {})])
    await (await a.open()).send('List my issues.')
    await a.host.close()
    // A copy without `user`, as an older version wrote it.
    const { interrupted } = await storedThreadState(stores.log, {
      threadId: 't',
    })
    if (!interrupted) throw new Error('No stored interrupted turn.')
    const { user: _user, ...old } = interrupted
    await appendToLog(stores.log, { threadId: 't' }, [
      { type: 'harness.interrupted', turn: old },
    ])

    const b = start([() => text('One issue.')])
    const session = await b.open()
    expect(turnInterrupts(session.snapshot())).toMatchObject([
      { reason: 'auth_required' },
    ])
    const ended = nextEnd(session)
    await session.runCommand({ name: 'connect:github' })
    expect(await ended).toMatchObject({ outcome: 'completed' })
    expect(seen).toEqual(['alice-key'])
    await b.host.close()
  })
})
