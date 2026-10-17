import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { defineByokProvider, keyedAdapter } from '@tanstack/ai/byok'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  createHarnessHost,
  defineHarness,
  definePlugin,
  membersOnly,
} from '../src'
import { after, gate, mockAdapter, text, toolCall } from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  Authorize,
  HarnessHost,
  HarnessRunContext,
  HostEvent,
} from '../src'
import type { Reply } from './helpers'

afterEach(() => {
  vi.unstubAllEnvs()
})

interface User {
  id: string
  tenantId: string
  role: 'user' | 'admin'
}

const olga: User = { id: 'olga', tenantId: 'acme', role: 'user' }
const bea: User = { id: 'bea', tenantId: 'acme', role: 'user' }
const vic: User = { id: 'vic', tenantId: 'acme', role: 'user' }
const cid: User = { id: 'cid', tenantId: 'acme', role: 'user' }
const gus: User = { id: 'gus', tenantId: 'globex', role: 'user' }

const THREAD = 't1'

/** A host with access, and a harness whose turns are `replies`. */
function accessHost({
  replies = () => text('ok'),
  authorize = membersOnly(),
  envKeys,
  adapter,
}: {
  replies?: Array<Reply> | Reply
  authorize?: Authorize<User>
  envKeys?: boolean
  adapter?: AnyTextAdapter | ReturnType<typeof acmeAdapter>['adapter']
} = {}) {
  const persistence = memoryPersistence()
  const { sessions } = persistence.stores
  const host = createHarnessHost({
    persistence,
    access: {
      identify: (): User | null => null,
      authorize,
      ...(envKeys !== undefined ? { envKeys } : {}),
    },
  })
  const harness = defineHarness({
    name: 'test/access',
    adapter: adapter ?? mockAdapter(replies).adapter,
  })
  const open = (principal: User, threadId = THREAD) =>
    host.open(harness, { threadId, principal })
  return { host, harness, sessions, open }
}

/** A tool that keeps the user of each run that calls it. */
function whoami() {
  const seen: Array<string | undefined> = []
  const tool = toolDefinition({
    name: 'whoami',
    description: 'Who runs this?',
    inputSchema: z.object({}),
  })
  const plugin = definePlugin({
    name: 'test/whoami',
    setup: () => ({
      tools: [
        tool.server<HarnessRunContext>((_input, { context }) => {
          seen.push(context.run.principal?.id)
          return Promise.resolve({})
        }),
      ],
    }),
  })
  return { plugin, seen }
}

const acme = defineByokProvider({
  id: 'acme',
  label: 'Acme',
  env: 'ACME_TEST_KEY',
})

/** A keyed adapter for `acme`. It keeps each key it got. */
function acmeAdapter() {
  const keys: Array<string> = []
  const adapter = keyedAdapter(acme, (key) => {
    keys.push(key)
    return mockAdapter(() => text('keyed answer')).adapter
  })
  return { adapter, keys }
}

/** Read `host.events()` into a list until `stop` runs. */
function readEvents(host: Pick<HarnessHost<User>, 'events'>) {
  const events: Array<HostEvent> = []
  const reader = new AbortController()
  const reading = (async () => {
    for await (const event of host.events({ signal: reader.signal })) {
      events.push(event)
    }
  })()
  const stop = async () => {
    reader.abort()
    await reading
  }
  return { events, stop }
}

describe('host access with membersOnly()', () => {
  it('lets a member that the owner shared with send, and refuses a stranger', async () => {
    const { host, harness, open } = accessHost({
      replies: [() => text('one'), () => text('two')],
    })
    const owner = await open(olga)
    await owner.send('Hi.')
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      principal: olga,
    })

    const member = await open(bea)

    expect(await member.send('Me too.')).toEqual({ text: 'two', media: [] })
    await expect(open(cid)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(
      host.sessions.get({ threadId: THREAD, principal: cid }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    const listed = async (principal: User) =>
      (await host.sessions.list({ principal })).entries.map(
        (entry) => entry.threadId,
      )
    expect(await listed(bea)).toEqual([THREAD])
    expect(await listed(cid)).toEqual([])
    expect(host.isOpen(harness, { threadId: THREAD, principal: bea })).toBe(
      true,
    )
    await host.close()
  })

  it('opens a thread id of another tenant as a new session of the own tenant', async () => {
    const { host, open } = accessHost()
    const owner = await open(olga)
    await owner.send('The plan of acme.')

    const other = await open(gus)

    expect(await other.transcript()).toEqual([])
    expect(
      await host.sessions.get({ threadId: THREAD, principal: gus }),
    ).toMatchObject({
      tenantId: 'globex',
      ownerId: 'gus',
      members: [{ userId: 'gus', role: 'owner' }],
    })
    expect(
      await host.sessions.get({ threadId: THREAD, principal: olga }),
    ).toMatchObject({ tenantId: 'acme', ownerId: 'olga' })
    await host.close()
  })

  it('lets a viewer read but not send, and a member send but not configure', async () => {
    const { host, open } = accessHost()
    await open(olga)
    for (const [userId, role] of [
      ['bea', 'member'],
      ['vic', 'viewer'],
    ] as const) {
      await host.sessions.share({
        threadId: THREAD,
        userId,
        role,
        principal: olga,
      })
    }
    const viewer = await open(vic)
    const member = await open(bea)

    expect(await viewer.transcript()).toEqual([])
    await expect(viewer.send('Hi.')).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(
      member.configure({ settings: { instructions: 'Be short.' } }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    expect(member.settings()).toEqual({})
    await host.close()
  })

  it('lets a member cancel only a run that the member started', async () => {
    const release = gate()
    const { host, open } = accessHost({
      replies: [after(release.opened, 'owner done'), () => text('never')],
    })
    const owner = await open(olga)
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      principal: olga,
    })
    const member = await open(bea)
    const ownerTurn = owner.send('A long task.')
    await ownerTurn.receipt
    const memberTurn = member.send('After that.')
    expect((await memberTurn.receipt).status).toBe('queued')

    await expect(
      member.cancel({ operationId: ownerTurn.id }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    expect((await member.cancel({ operationId: memberTurn.id })).status).toBe(
      'accepted',
    )

    await expect(memberTurn).rejects.toThrow('Cancelled before it started.')
    release.open()
    expect(await ownerTurn).toEqual({ text: 'owner done', media: [] })
    await host.close()
  })

  it('removes a member with unshare: their queued turn stops, and their handle refuses every call', async () => {
    const release = gate()
    const { host, open } = accessHost({
      replies: [after(release.opened, 'owner done'), () => text('never')],
    })
    const owner = await open(olga)
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      principal: olga,
    })
    const member = await open(bea)
    const ownerTurn = owner.send('A long task.')
    await ownerTurn.receipt
    const memberTurn = member.send('After that.')
    expect((await memberTurn.receipt).status).toBe('queued')

    const changed = await host.sessions.unshare({
      threadId: THREAD,
      userId: 'bea',
      principal: olga,
    })

    expect(changed?.members).toEqual([{ userId: 'olga', role: 'owner' }])
    await expect(memberTurn).rejects.toThrow('Cancelled before it started.')
    expect(() => member.send('Again.')).toThrow(AccessDeniedError)
    expect(() => member.snapshot()).toThrow(AccessDeniedError)
    await expect(open(bea)).rejects.toBeInstanceOf(AccessDeniedError)
    await expect(
      host.sessions.unshare({
        threadId: THREAD,
        userId: 'olga',
        principal: olga,
      }),
    ).rejects.toThrow('the owner cannot be removed')
    release.open()
    expect(await ownerTurn).toEqual({ text: 'owner done', media: [] })
    await host.close()
  })

  it("forks for the forker alone by default, and with the source's members for 'all'", async () => {
    const { host, harness, open } = accessHost({
      replies: () => text('answer'),
    })
    const owner = await open(olga)
    await owner.send('Hi.')
    for (const [userId, role] of [
      ['bea', 'member'],
      ['vic', 'viewer'],
    ] as const) {
      await host.sessions.share({
        threadId: THREAD,
        userId,
        role,
        principal: olga,
      })
    }
    const last = (await owner.transcript()).at(-1)?.id ?? ''
    const fork = (members?: 'self' | 'all') =>
      host.sessions.fork({
        harness,
        threadId: THREAD,
        at: { through: last },
        ...(members ? { members } : {}),
        principal: bea,
      })

    expect(await fork()).toMatchObject({
      ownerId: 'bea',
      members: [{ userId: 'bea', role: 'owner' }],
    })
    expect(await fork('all')).toMatchObject({
      ownerId: 'bea',
      members: [
        { userId: 'bea', role: 'owner' },
        { userId: 'olga', role: 'member' },
        { userId: 'vic', role: 'viewer' },
      ],
    })
    await host.close()
  })

  it("forks with the source's members by default under membersOnly({ fork: { members: 'all' } })", async () => {
    const { host, harness, open } = accessHost({
      authorize: membersOnly({ fork: { members: 'all' } }),
    })
    const owner = await open(olga)
    await owner.send('Hi.')
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'member',
      principal: olga,
    })
    const last = (await owner.transcript()).at(-1)?.id ?? ''

    const entry = await host.sessions.fork({
      harness,
      threadId: THREAD,
      at: { through: last },
      principal: olga,
    })

    expect(entry).toMatchObject({
      ownerId: 'olga',
      members: [
        { userId: 'olga', role: 'owner' },
        { userId: 'bea', role: 'member' },
      ],
    })
    await host.close()
  })

  it('does not give an entry with no owner to the next opener', async () => {
    const { host, sessions, open } = accessHost()
    await sessions.upsert({
      tenantId: 'acme',
      threadId: 'orphan',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })

    await expect(open(olga, 'orphan')).rejects.toBeInstanceOf(AccessDeniedError)
    expect(
      await sessions.get({
        tenantId: 'acme',
        threadId: 'orphan',
      }),
    ).toEqual({
      tenantId: 'acme',
      threadId: 'orphan',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })
    await host.close()
  })

  it('checks a child thread through its root thread', async () => {
    const { host, sessions, open } = accessHost()
    await open(olga)
    await host.sessions.share({
      threadId: THREAD,
      userId: 'bea',
      role: 'viewer',
      principal: olga,
    })
    const child = {
      tenantId: 'acme',
      threadId: 'subagent:run-1',
      parentThreadId: THREAD,
      ownerId: 'olga',
      members: [],
      createdAt: 1,
      updatedAt: 1,
    }
    await sessions.upsert(child)

    expect(
      (await host.sessions.list({ parentThreadId: THREAD, principal: bea }))
        .entries,
    ).toEqual([child])
    expect(
      await host.sessions.get({ threadId: child.threadId, principal: bea }),
    ).toEqual(child)
    await expect(
      host.sessions.list({ parentThreadId: THREAD, principal: cid }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    await host.close()
  })
})

describe('host access with your own access tables', () => {
  /** An authorize that allows the users in `allowed`, for every action. */
  function tableAccess(...users: Array<string>) {
    const allowed = new Set(users)
    const authorize: Authorize<User> = ({ principal }) =>
      allowed.has(principal.id)
    return { allowed, authorize }
  }

  it('closes the handles of a revoked user and tells host.events() readers', async () => {
    const table = tableAccess('olga', 'bea')
    const { host, open } = accessHost({ authorize: table.authorize })
    await open(olga)
    const member = await open(bea)
    const reader = readEvents(host)

    table.allowed.delete('bea')
    host.revoke({ threadId: THREAD, principal: bea })

    expect(() => member.snapshot()).toThrow(AccessDeniedError)
    expect(() => member.logState()).toThrow(AccessDeniedError)
    await vi.waitFor(() =>
      expect(reader.events.filter((event) => event.type === 'revoked')).toEqual(
        [
          {
            type: 'revoked',
            tenantId: 'acme',
            threadId: THREAD,
            principalId: 'bea',
            at: expect.any(Number),
          },
        ],
      ),
    )
    // The app gives the access back: a new open works.
    table.allowed.add('bea')
    expect((await open(bea)).snapshot().threadId).toBe(THREAD)
    await reader.stop()
    await host.close()
  })

  it('refuses share without membersOnly()', async () => {
    const { host, open } = accessHost({
      authorize: tableAccess('olga').authorize,
    })
    await open(olga)

    await expect(
      host.sessions.share({
        threadId: THREAD,
        userId: 'bea',
        role: 'member',
        principal: olga,
      }),
    ).rejects.toThrow(
      'host.sessions.share needs membersOnly() as the authorize of the host access. With your own access tables, change them and call host.revoke.',
    )
    await host.close()
  })
})

describe('host access and principals', () => {
  it('needs a principal on each public host call', async () => {
    const { host, harness } = accessHost()

    await expect(host.open(harness, { threadId: THREAD })).rejects.toThrow(
      'host.open needs a principal: the host has access.',
    )
    await expect(host.sessions.list()).rejects.toThrow(
      'host.sessions.list needs a principal: the host has access.',
    )
    expect(() => host.isOpen(harness, { threadId: THREAD })).toThrow(
      'host.isOpen needs a principal: the host has access.',
    )
    await host.close()
  })

  it('refuses a call that acts as another principal than the handle', async () => {
    const { host, open } = accessHost()
    const owner = await open(olga)

    expect(() => owner.send('Hi.', { principal: bea })).toThrow(
      'This handle acts as "olga". Open another handle for "bea".',
    )
    await host.close()
  })

  it('runs the send of a second opener as that opener, without access', async () => {
    const { plugin, seen } = whoami()
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const harness = defineHarness({
      name: 'test/two-openers',
      adapter: mockAdapter([
        () => toolCall('whoami', {}, 'c1'),
        () => text('ok'),
        () => toolCall('whoami', {}, 'c2'),
        () => text('ok'),
      ]).adapter,
      plugins: () => [plugin],
    })
    const alice = await host.open(harness, {
      threadId: THREAD,
      principal: { id: 'alice' },
    })
    const bob = await host.open(harness, {
      threadId: THREAD,
      principal: { id: 'bob' },
    })

    await bob.send('Who am I?')
    await alice.send('And me?')

    expect(seen).toEqual(['bob', 'alice'])
    await host.close()
  })
})

describe('provider keys with host access', () => {
  it('does not read env vars without envKeys', async () => {
    vi.stubEnv('ACME_TEST_KEY', 'sk-acme-env-0000')
    const keyed = acmeAdapter()
    const { host, open } = accessHost({ adapter: keyed.adapter })
    const owner = await open(olga)

    await expect(owner.send('Hi.')).rejects.toThrow(
      'Sign in to acme first. Run /connect acme.',
    )
    expect(keyed.keys).toEqual([])
    await host.close()
  })

  it('reads env vars with envKeys: true', async () => {
    vi.stubEnv('ACME_TEST_KEY', 'sk-acme-env-0000')
    const keyed = acmeAdapter()
    const { host, open } = accessHost({ adapter: keyed.adapter, envKeys: true })
    const owner = await open(olga)

    expect(await owner.send('Hi.')).toEqual({
      text: 'keyed answer',
      media: [],
    })
    expect(keyed.keys).toEqual(['sk-acme-env-0000'])
    await host.close()
  })
})

it('needs stores.sessions for host access', () => {
  expect(() =>
    createHarnessHost({
      persistence: {
        stores: { log: memoryLogStore() },
      },
      access: { identify: () => null, authorize: membersOnly() },
    }),
  ).toThrow(
    'Host access needs stores.sessions: each session keeps its owner and members there.',
  )
})
