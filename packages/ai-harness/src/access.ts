import type { SessionMember } from '@tanstack/ai-persistence'
import type { HarnessUser } from './types'
import type { WaitKind } from './waits'

/**
 * What a user tries to do with a session.
 *
 * - `read`: stream, snapshot, transcript, media, and child runs.
 * - `list`: see the session in a list of sessions.
 * - `send`: prompt, steer, follow up, start agents, and run commands.
 * - `answer`: answer a question or an approval of a run.
 * - `operator`: answer a `human` wait of any run, and reply as an operator
 *   who takes over from the agent. A `human` wait takes only `operator`,
 *   so the user who waits for a person cannot answer it.
 * - `cancel`: stop a run.
 * - `configure`: change the settings of the thread.
 * - `share`: add or remove members.
 * - `delete`: delete the session.
 * - `fork`: copy the session into a new session.
 * - `transfer`: move the conversation to a new thread, maybe of another
 *   harness, with `host.transfer`.
 */
export type AccessAction =
  | 'read'
  | 'send'
  | 'answer'
  | 'operator'
  | 'cancel'
  | 'configure'
  | 'share'
  | 'delete'
  | 'fork'
  | 'transfer'
  | 'list'

/** The session that an action targets, as the index row has it. */
export interface AccessSession {
  threadId: string
  tenantId?: string
  /** The thread that started this one. Set on a subagent child. */
  parentThreadId?: string
  /**
   * The users of the session. The owner is the member with the role
   * `owner`. Without one, the session has no owner.
   */
  members: ReadonlyArray<SessionMember>
}

/** The run that an `answer` or `cancel` targets: who started it. */
export interface AccessRun {
  runId: string
  /** The id of the user who started the run. */
  userId?: string
}

/** The wait that an `answer` or `operator` action answers. */
export interface AccessWait {
  waitId: string
  kind: WaitKind
}

/** What `isAllowed` gets for one action. */
export interface AuthorizeInput<U extends HarnessUser = HarnessUser> {
  user: U
  action: AccessAction
  session: AccessSession
  /** The run that an `answer` or `cancel` targets, when the host knows it. */
  run?: AccessRun
  /** The wait that an `answer` or `operator` action answers, when the host knows it. */
  wait?: AccessWait
}

/** Decide if a user may do one action. Return `false` to refuse. */
export type Authorize<U extends HarnessUser = HarnessUser> = (
  input: AuthorizeInput<U>,
) => boolean | Promise<boolean>

/**
 * What the host does with the members list of a session: `share` and
 * `unshare` change it, and a fork copies it.
 */
export interface AccessMembers {
  /**
   * Who is a member of the new session after a fork without a `members`
   * option.
   *
   * - `'self'` (default): only the user who forked it, as the owner.
   * - `'all'`: the members of the source session too.
   */
  fork?: 'self' | 'all'
}

/**
 * The rules of a host: `rules` in {@link HarnessAccess}.
 * {@link membersOnly} returns one, or write your own with only `isAllowed`.
 */
export interface AccessPolicy<U extends HarnessUser = HarnessUser> {
  /**
   * What a user may do. Called for every action. The harness checks
   * the tenant before it calls this.
   */
  isAllowed: Authorize<U>
  /**
   * A filter that `host.sessions.list` passes to the sessions store, so a
   * page holds only sessions that the user can list. `isAllowed` still
   * checks each entry. Without it, the store gives every session of the
   * tenant, and `isAllowed` drops the others, so a page can come back short.
   */
  filterSessionList?: (user: U) => { memberId?: string }
  /**
   * Turn on `host.sessions.share` and `unshare`, which change the members
   * list of a session, and set the members of a fork. Without it, `share`
   * and `unshare` throw: change your own access tables and call
   * `host.revoke`.
   */
  members?: AccessMembers
}

/**
 * Who may use the sessions of a host, and what they may do. The type of the
 * user comes from the return value of `getUser`.
 *
 * @example
 * access: {
 *   getUser: ({ request }) => findUser(request),
 *   rules: membersOnly(),
 * }
 */
export interface HarnessAccess<U extends HarnessUser = HarnessUser> {
  /**
   * Who is calling: your own login check, once per request. Return null to
   * refuse with 401.
   */
  getUser: (input: { request: Request }) => U | null | Promise<U | null>
  /**
   * What each user may do: `membersOnly()`, or your own
   * `{ isAllowed, filterSessionList?, members? }`.
   */
  rules: AccessPolicy<U>
  /**
   * A guest for a signed media URL with no login, for example an `<img>`
   * that sends no cookies. The handler calls it only on the signed media
   * route, after the signature checks out, and only when `getUser` finds no
   * user. `tenantId` is the tenant of the URL. `isAllowed` then decides
   * `read` for the guest. Return null, or leave it out, to answer 401. A
   * guest never reaches another route.
   *
   * @example
   * getGuestUser: ({ tenantId }) => ({ id: 'guest', tenantId, isGuest: true })
   */
  getGuestUser?: (input: {
    tenantId: string | undefined
  }) => U | null | Promise<U | null>
  /**
   * Let keyed (BYOK) adapters and `ctx.keys` fall back to the server's env
   * vars. Default `false` when access is on.
   */
  allowServerEnvKeys?: boolean
}

/**
 * Thrown when the host refuses an action: `isAllowed` returned `false`, or
 * `host.revoke` took the access of the handle's user. The HTTP handler
 * answers it with 403. Catch it with `instanceof AccessDeniedError`.
 */
export class AccessDeniedError extends Error {
  readonly code = 'forbidden'
  readonly action: AccessAction
  readonly threadId: string

  constructor({
    action,
    threadId,
  }: {
    action: AccessAction
    threadId: string
  }) {
    super(`Access denied: ${action} on thread ${JSON.stringify(threadId)}.`)
    this.name = 'AccessDeniedError'
    this.action = action
    this.threadId = threadId
  }
}

/** Options for {@link membersOnly}. */
export interface MembersOnlyOptions {
  fork?: {
    /**
     * Who is a member of the new session after a fork.
     *
     * - `'self'` (default): only the user who forked it, as the owner.
     * - `'all'`: the members of the source session too.
     */
    members?: 'self' | 'all'
  }
  operator?: {
    /**
     * The roles that have the `operator` action: they answer a `human` wait
     * and reply as an operator. Default `['operator']`: only members with
     * the role `operator`. The owner and plain members do not have it, so
     * the user who waits for a person cannot act as that person.
     */
    roles?: ReadonlyArray<SessionMember['role']>
  }
}

type Role = SessionMember['role']

/** The role of a user in a session. */
function roleOf(session: AccessSession, userId: string) {
  return session.members.find((member) => member.userId === userId)?.role
}

/** The user id of the owner of a session, or `undefined` for no owner. */
export function ownerOf(session: Pick<AccessSession, 'members'>) {
  return session.members.find((member) => member.role === 'owner')?.userId
}

function allows(
  role: Role,
  { user, action, run }: AuthorizeInput,
  operators: ReadonlyArray<Role>,
) {
  switch (action) {
    case 'read':
    case 'list':
      return true
    case 'send':
    case 'fork':
      return role === 'owner' || role === 'member'
    case 'operator':
      return operators.includes(role)
    case 'answer':
    case 'cancel': {
      const startedTheRun = run?.userId === user.id
      return role === 'owner' || (role === 'member' && startedTheRun)
    }
    case 'configure':
    case 'share':
    case 'delete':
    case 'transfer':
      return role === 'owner'
  }
}

/**
 * Ready-made access rules: only the members of a session may use it, each
 * with the limits of the member's role. Use it as the `rules` of `access`.
 *
 * - Owner: every action but `operator`.
 * - Member: read, list, send, and fork. Answer and cancel only the runs
 *   that the member started.
 * - Operator: read, list, and `operator` (answer a `human` wait, and reply
 *   as an operator).
 * - Viewer: read and list.
 * - Not a member: no action.
 *
 * `operator.roles` changes who has `operator`.
 *
 * The owner is the member with the role `owner`. `isAllowed` does not check
 * the tenant: the host does that before it calls it. For a child thread, the
 * host passes the root session, so it has no special rules for children.
 *
 * It also lists only the sessions of a member (`filterSessionList`), and turns on
 * `host.sessions.share` and `unshare` (`members`).
 *
 * @param options - `fork.members` sets who is a member of a forked session.
 *   The default is `'self'`. `operator.roles` sets the roles with the
 *   `operator` action. The default is `['operator']`.
 *
 * @example
 * access: {
 *   getUser: ({ request }) => findUser(request),
 *   rules: membersOnly({ fork: { members: 'self' } }),
 * }
 */
export function membersOnly(
  options: MembersOnlyOptions = {},
): Required<AccessPolicy> {
  const operators = options.operator?.roles ?? ['operator']
  return {
    isAllowed: (input) => {
      const role = roleOf(input.session, input.user.id)
      if (role === undefined) return false
      return allows(role, input, operators)
    },
    filterSessionList: (user) => ({ memberId: user.id }),
    members: { fork: options.fork?.members ?? 'self' },
  }
}
