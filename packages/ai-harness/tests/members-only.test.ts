import { describe, expect, it } from 'vitest'
import { membersOnly } from '../src/access'
import type { SessionMember } from '@tanstack/ai-persistence'
import type {
  AccessAction,
  AccessRun,
  AccessSession,
  HarnessAccess,
  MembersOnlyOptions,
} from '../src/access'
import type { HarnessUser } from '../src/types'

const { isAllowed } = membersOnly()

const members: ReadonlyArray<SessionMember> = [
  { userId: 'mia', role: 'member' },
  { userId: 'vic', role: 'viewer' },
  { userId: 'oto', role: 'operator' },
]

const session: AccessSession = {
  threadId: 'thread-1',
  members: [{ userId: 'olga', role: 'owner' }, ...members],
}

type Column = 'owner' | 'member' | 'viewer' | 'operator' | 'stranger'

/** The roles table of the design. */
const table: Array<{ action: AccessAction } & Record<Column, boolean>> = [
  {
    action: 'read',
    owner: true,
    member: true,
    viewer: true,
    operator: true,
    stranger: false,
  },
  {
    action: 'list',
    owner: true,
    member: true,
    viewer: true,
    operator: true,
    stranger: false,
  },
  {
    action: 'send',
    owner: true,
    member: true,
    viewer: false,
    operator: false,
    stranger: false,
  },
  {
    action: 'answer',
    owner: true,
    member: true,
    viewer: false,
    operator: false,
    stranger: false,
  },
  {
    action: 'cancel',
    owner: true,
    member: true,
    viewer: false,
    operator: false,
    stranger: false,
  },
  {
    action: 'configure',
    owner: true,
    member: false,
    viewer: false,
    operator: false,
    stranger: false,
  },
  {
    action: 'share',
    owner: true,
    member: false,
    viewer: false,
    operator: false,
    stranger: false,
  },
  {
    action: 'delete',
    owner: true,
    member: false,
    viewer: false,
    operator: false,
    stranger: false,
  },
  {
    action: 'fork',
    owner: true,
    member: true,
    viewer: false,
    operator: false,
    stranger: false,
  },
  {
    action: 'transfer',
    owner: true,
    member: false,
    viewer: false,
    operator: false,
    stranger: false,
  },
  {
    action: 'operator',
    owner: false,
    member: false,
    viewer: false,
    operator: true,
    stranger: false,
  },
]

const callers: Array<{
  who: string
  id: string
  target: AccessSession
  column: Column
}> = [
  { who: 'owner', id: 'olga', target: session, column: 'owner' },
  { who: 'member', id: 'mia', target: session, column: 'member' },
  { who: 'viewer', id: 'vic', target: session, column: 'viewer' },
  { who: 'operator', id: 'oto', target: session, column: 'operator' },
  { who: 'stranger', id: 'sam', target: session, column: 'stranger' },
]

const cases = table.flatMap((row) =>
  callers.map((caller) => ({
    ...caller,
    action: row.action,
    allowed: row[caller.column],
  })),
)

describe('membersOnly roles', () => {
  // Each caller targets a run that the caller started, so `answer` and
  // `cancel` follow the role alone here.
  it.each(cases)(
    '$who: $action is $allowed',
    async ({ id, target, action, allowed }) => {
      const run = { runId: 'run-1', userId: id }
      const decision = await isAllowed({
        user: { id },
        action,
        session: target,
        run,
      })
      expect(decision).toBe(allowed)
    },
  )
})

describe('membersOnly runs for answer and cancel', () => {
  const runCases: Array<{
    who: string
    id: string
    target: string
    run: AccessRun | undefined
    allowed: boolean
  }> = [
    {
      who: 'member',
      id: 'mia',
      target: 'a run of another user',
      run: { runId: 'run-2', userId: 'olga' },
      allowed: false,
    },
    {
      who: 'member',
      id: 'mia',
      target: 'a run with no user',
      run: { runId: 'run-3' },
      allowed: false,
    },
    {
      who: 'member',
      id: 'mia',
      target: 'no run',
      run: undefined,
      allowed: false,
    },
    {
      who: 'owner',
      id: 'olga',
      target: 'a run of another user',
      run: { runId: 'run-4', userId: 'mia' },
      allowed: true,
    },
    {
      who: 'owner',
      id: 'olga',
      target: 'no run',
      run: undefined,
      allowed: true,
    },
  ]
  const actions: Array<AccessAction> = ['answer', 'cancel']
  const rows = actions.flatMap((action) =>
    runCases.map((runCase) => ({ ...runCase, action })),
  )

  it.each(rows)(
    '$who: $action on $target is $allowed',
    async ({ id, action, run, allowed }) => {
      const decision = await isAllowed({
        user: { id },
        action,
        session,
        run,
      })
      expect(decision).toBe(allowed)
    },
  )
})

describe('membersOnly operator roles', () => {
  it('gives the operator action to the roles in operator.roles', async () => {
    const owners = membersOnly({ operator: { roles: ['owner', 'operator'] } })
    const can = (id: string) =>
      owners.isAllowed({ user: { id }, action: 'operator', session })
    expect(await can('olga')).toBe(true)
    expect(await can('oto')).toBe(true)
    expect(await can('mia')).toBe(false)
    expect(await can('sam')).toBe(false)
  })
})

describe('membersOnly list filter and members', () => {
  const defaults: Array<{
    name: string
    options: MembersOnlyOptions | undefined
  }> = [
    { name: 'no options', options: undefined },
    { name: 'no fork option', options: {} },
    { name: 'a fork option without members', options: { fork: {} } },
  ]

  it.each(defaults)('sets fork members to self with $name', ({ options }) => {
    expect(membersOnly(options).members).toEqual({ fork: 'self' })
  })

  it('sets fork members to all when the option is all', () => {
    expect(membersOnly({ fork: { members: 'all' } }).members).toEqual({
      fork: 'all',
    })
  })

  it('lists only the sessions of the member', () => {
    expect(membersOnly().filterSessionList({ id: 'mia' })).toEqual({
      memberId: 'mia',
    })
  })
})

interface AppUser extends HarnessUser {
  plan: 'free' | 'pro'
}

describe('membersOnly with a wider user type', () => {
  it('works as the rules of an access object', async () => {
    const access: HarnessAccess<AppUser> = {
      getUser: () => null,
      rules: membersOnly(),
    }
    const user: AppUser = { id: 'mia', plan: 'pro' }
    const decision = await access.rules.isAllowed({
      user,
      action: 'send',
      session,
    })
    expect(decision).toBe(true)
  })
})
