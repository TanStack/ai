import { describe, expect, it } from 'vitest'
import { membersOnly, membersOnlyPolicyOf } from '../src/access'
import type { SessionMember } from '@tanstack/ai-persistence'
import type {
  AccessAction,
  AccessRun,
  AccessSession,
  HarnessAccess,
  MembersOnlyOptions,
} from '../src/access'
import type { Principal } from '../src/types'

const authorize = membersOnly()

const members: ReadonlyArray<SessionMember> = [
  { userId: 'mia', role: 'member' },
  { userId: 'vic', role: 'viewer' },
]

/** `olga` owns it through `ownerId` only: `members` has no entry for her. */
const session: AccessSession = {
  threadId: 'thread-1',
  ownerId: 'olga',
  members,
}

/** `otto` owns it through `members` only: it has no `ownerId`. */
const sessionOwnedByMembers: AccessSession = {
  threadId: 'thread-2',
  members: [{ userId: 'otto', role: 'owner' }, ...members],
}

type Column = 'owner' | 'member' | 'viewer' | 'stranger'

/** The roles table of the design. */
const table: Array<{ action: AccessAction } & Record<Column, boolean>> = [
  { action: 'read', owner: true, member: true, viewer: true, stranger: false },
  { action: 'list', owner: true, member: true, viewer: true, stranger: false },
  { action: 'send', owner: true, member: true, viewer: false, stranger: false },
  {
    action: 'answer',
    owner: true,
    member: true,
    viewer: false,
    stranger: false,
  },
  {
    action: 'cancel',
    owner: true,
    member: true,
    viewer: false,
    stranger: false,
  },
  {
    action: 'configure',
    owner: true,
    member: false,
    viewer: false,
    stranger: false,
  },
  {
    action: 'share',
    owner: true,
    member: false,
    viewer: false,
    stranger: false,
  },
  {
    action: 'delete',
    owner: true,
    member: false,
    viewer: false,
    stranger: false,
  },
  { action: 'fork', owner: true, member: true, viewer: false, stranger: false },
  {
    action: 'transfer',
    owner: true,
    member: false,
    viewer: false,
    stranger: false,
  },
]

const callers: Array<{
  who: string
  id: string
  target: AccessSession
  column: Column
}> = [
  { who: 'owner by ownerId', id: 'olga', target: session, column: 'owner' },
  {
    who: 'owner by members',
    id: 'otto',
    target: sessionOwnedByMembers,
    column: 'owner',
  },
  { who: 'member', id: 'mia', target: session, column: 'member' },
  { who: 'viewer', id: 'vic', target: session, column: 'viewer' },
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
      const run = { runId: 'run-1', principalId: id }
      const decision = await authorize({
        principal: { id },
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
      run: { runId: 'run-2', principalId: 'olga' },
      allowed: false,
    },
    {
      who: 'member',
      id: 'mia',
      target: 'a run with no principal',
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
      run: { runId: 'run-4', principalId: 'mia' },
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
      const decision = await authorize({
        principal: { id },
        action,
        session,
        run,
      })
      expect(decision).toBe(allowed)
    },
  )
})

describe('membersOnly marker', () => {
  const defaults: Array<{
    name: string
    options: MembersOnlyOptions | undefined
  }> = [
    { name: 'no options', options: undefined },
    { name: 'no fork option', options: {} },
    { name: 'a fork option without members', options: { fork: {} } },
  ]

  it.each(defaults)('sets fork members to self with $name', ({ options }) => {
    expect(membersOnly(options).membersOnly).toEqual({
      fork: { members: 'self' },
    })
  })

  it('sets fork members to all when the option is all', () => {
    expect(membersOnly({ fork: { members: 'all' } }).membersOnly).toEqual({
      fork: { members: 'all' },
    })
  })

  it('keeps a separate marker on each authorize', () => {
    const self = membersOnly()
    membersOnly({ fork: { members: 'all' } })
    expect(self.membersOnly).toEqual({ fork: { members: 'self' } })
  })
})

describe('membersOnlyPolicyOf', () => {
  it('reads the marker of a membersOnly authorize', () => {
    const policy = membersOnlyPolicyOf(
      membersOnly({ fork: { members: 'all' } }),
    )
    expect(policy).toEqual({ fork: { members: 'all' } })
  })

  it('is undefined for a plain authorize function', () => {
    expect(membersOnlyPolicyOf(() => true)).toBeUndefined()
  })
})

interface AppUser extends Principal {
  plan: 'free' | 'pro'
}

describe('membersOnly with a wider principal type', () => {
  it('works as the authorize of an access object', async () => {
    const access: HarnessAccess<AppUser> = {
      identify: () => null,
      authorize: membersOnly(),
    }
    const principal: AppUser = { id: 'mia', plan: 'pro' }
    const decision = await access.authorize({
      principal,
      action: 'send',
      session,
    })
    expect(decision).toBe(true)
  })
})
