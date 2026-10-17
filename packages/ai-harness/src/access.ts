import type { SessionMember } from '@tanstack/ai-persistence'
import type { Principal } from './types'

/**
 * What a principal tries to do with a session.
 *
 * - `read`: stream, snapshot, transcript, media, and child runs.
 * - `list`: see the session in a list of sessions.
 * - `send`: prompt, steer, follow up, start agents, and run commands.
 * - `answer`: answer a question or an approval of a run.
 * - `cancel`: stop a run.
 * - `configure`: change the settings of the thread.
 * - `share`: add or remove members.
 * - `delete`: delete the session.
 * - `fork`: copy the session into a new session.
 * - `transfer`: give the session to a new owner.
 */
export type AccessAction =
  | 'read'
  | 'send'
  | 'answer'
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
  /** The user id of the owner. Without it, the session has no owner. */
  ownerId?: string
  /** The thread that started this one. Set on a subagent child. */
  parentThreadId?: string
  members: ReadonlyArray<SessionMember>
}

/** The run that an `answer` or `cancel` targets: who started it. */
export interface AccessRun {
  runId: string
  /** The id of the principal who started the run. */
  principalId?: string
}

/** What `authorize` gets for one action. */
export interface AuthorizeInput<P extends Principal = Principal> {
  principal: P
  action: AccessAction
  session: AccessSession
  /** The run that an `answer` or `cancel` targets, when the host knows it. */
  run?: AccessRun
}

/** Decide if a principal may do one action. Return `false` to refuse. */
export type Authorize<P extends Principal = Principal> = (
  input: AuthorizeInput<P>,
) => boolean | Promise<boolean>

/**
 * Who may use the sessions of a host, and what they may do. The type of the
 * principal comes from the return value of `identify`.
 */
export interface HarnessAccess<P extends Principal = Principal> {
  /**
   * Who is calling: your own login check, once per request. Return null to
   * refuse with 401.
   */
  identify: (input: { request: Request }) => P | null | Promise<P | null>
  /**
   * What they may do. Called for every action. The harness checks the
   * tenant before it calls this.
   */
  authorize: Authorize<P>
  /**
   * Let keyed (BYOK) adapters and `ctx.keys` fall back to the server's env
   * vars. Default `false` when access is on.
   */
  envKeys?: boolean
}

/**
 * Thrown when the host refuses an action: `authorize` returned `false`, or
 * `host.revoke` took the access of the handle's principal. The HTTP handler
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
}

/**
 * The options of a {@link membersOnly} authorize, with the defaults filled
 * in. The host reads it with {@link membersOnlyPolicyOf}.
 */
export interface MembersOnlyPolicy {
  readonly fork: { readonly members: 'self' | 'all' }
}

type Role = SessionMember['role']

/**
 * The role of a user in a session. The `ownerId` makes a user the owner,
 * also when `members` has no entry for that user.
 */
function roleOf(session: AccessSession, userId: string) {
  if (session.ownerId === userId) return 'owner'
  return session.members.find((member) => member.userId === userId)?.role
}

function allows(role: Role, { principal, action, run }: AuthorizeInput) {
  switch (action) {
    case 'read':
    case 'list':
      return true
    case 'send':
    case 'fork':
      return role !== 'viewer'
    case 'answer':
    case 'cancel': {
      const startedTheRun = run?.principalId === principal.id
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
 * A ready-made `authorize`: only the members of a session may use it, each
 * with the limits of the member's role.
 *
 * - Owner: every action.
 * - Member: read, list, send, and fork. Answer and cancel only the runs that
 *   the member started.
 * - Viewer: read and list.
 * - Not a member: no action.
 *
 * The owner is the `ownerId` of the session, or a member with the role
 * `owner`. This function does not check the tenant: the host does that
 * before it calls `authorize`. For a child thread, the host passes the root
 * session, so this function has no special rules for children.
 *
 * The function also has a `membersOnly` property with its options. The host
 * reads it to list only the sessions of a member, and to get the default of
 * a fork.
 *
 * @param options - `fork.members` sets who is a member of a forked session.
 *   The default is `'self'`.
 *
 * @example
 * access: {
 *   identify: ({ request }) => getUser(request),
 *   authorize: membersOnly({ fork: { members: 'self' } }),
 * }
 */
export function membersOnly(options: MembersOnlyOptions = {}) {
  const marker: { readonly membersOnly: MembersOnlyPolicy } = {
    membersOnly: { fork: { members: options.fork?.members ?? 'self' } },
  }
  // A new function on each call, so each one keeps its own marker.
  const authorize: Authorize = (input) => {
    const role = roleOf(input.session, input.principal.id)
    if (role === undefined) return false
    return allows(role, input)
  }
  return Object.assign(authorize, marker)
}

/**
 * The options of an `authorize` that {@link membersOnly} made, or
 * `undefined` for any other `authorize`.
 *
 * @param authorize - The `authorize` of the host's `access`.
 */
export function membersOnlyPolicyOf<P extends Principal>(
  authorize: Authorize<P> & { readonly membersOnly?: MembersOnlyPolicy },
) {
  return authorize.membersOnly
}
