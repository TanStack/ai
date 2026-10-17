import { AccessDeniedError } from '../access'
import { isSameSender } from './helpers'
import type { AccessAction, AccessRun } from '../access'
import type { AnyHarness } from '../define'
import type {
  AgentSendOptions,
  HarnessInput,
  Operation,
  OperationKind,
  Principal,
  SendOptions,
  UserInput,
} from '../types'
import type { SessionImpl } from './harness-session'
import type { AgentRunOptions, AgentStartOptions } from './types'

/** What the handle of a host with access checks. */
export interface HandleGuard {
  /** Throws `AccessDeniedError` unless `authorize` allows `action` now. */
  authorize: (action: AccessAction, run?: AccessRun) => Promise<void>
  /** `host.revoke` took the access of the principal of the handle. */
  isRevoked: () => boolean
}

/** How a handle reaches the shared session of its thread. The host gives one. */
export interface HandleLease<THarness extends AnyHarness> {
  /** The open session of the thread, or `undefined` when none is open now. */
  current: () => SessionImpl<THarness> | undefined
  /**
   * Open the session of the thread again, with the checks of `host.open`.
   * Throws at once when the host is closed.
   */
  reopen: () => Promise<SessionImpl<THarness>>
  /** One more holder: the session does not close on idle while it is held. */
  hold: () => void
  /**
   * One holder less. `dropped`: the garbage collector dropped the handle,
   * so the host warns. Resolves after the close that the release starts.
   */
  release: (options?: { dropped?: boolean }) => Promise<void>
}

/** What the finalizer of a handle needs. It must not hold the handle. */
interface HandleToken {
  isReleased: boolean
  release: (options: { dropped: boolean }) => Promise<void>
}

/** Release a handle that its holder dropped without `close()`. */
function releaseDropped(token: HandleToken) {
  if (token.isReleased) return
  token.isReleased = true
  void token.release({ dropped: true })
}

const dropped = new FinalizationRegistry(releaseDropped)
const tokens = new WeakMap<object, HandleToken>()

/**
 * @internal Run the finalizer of `handle`, as if the garbage collector
 * dropped it. Tests use it, as a test cannot force a collection.
 */
export function finalizeHandle(handle: object) {
  const token = tokens.get(handle)
  if (!token) return
  dropped.unregister(token)
  releaseDropped(token)
}

/** @internal The action that `authorize` gets for an input. */
export function actionOf(input: HarnessInput): AccessAction {
  switch (input.op) {
    case 'resolve':
    case 'answer':
      return 'answer'
    case 'cancel':
    case 'cancelInput':
      return 'cancel'
    case 'configure':
    case 'config':
      return 'configure'
    case 'prompt':
    case 'steer':
    case 'followUp':
    case 'continue':
    case 'tool':
    case 'reset':
    case 'command':
    case 'agent':
    case 'agentMessage':
    case 'setDelivery':
    case 'background':
    case 'append':
    case 'revert':
    case 'unrevert':
      return 'send'
  }
}

/** A listener that waits for the operation of a session that opens again. */
interface Waiting {
  member: 'onEvent' | 'onMedia'
  args: Array<unknown>
  stop: (() => void) | undefined
}

/**
 * The operation of a call on a session that opens again. `call` runs on the
 * session once it opened, and each member waits for that. `id` is known only
 * then: await `receipt` before you read it.
 */
function laterOperation<TSession, TOperation extends Operation<unknown>>({
  kind,
  agent,
  opening,
  call,
}: {
  kind: OperationKind
  agent: string | undefined
  opening: Promise<TSession>
  call: (session: TSession) => TOperation
}) {
  let bound: TOperation | undefined
  const waiting = new Set<Waiting>()
  // Wrapped: an operation is thenable, so a promise of it would wait for its
  // result.
  const started = opening.then((session) => {
    const operation = call(session)
    bound = operation
    for (const entry of waiting) {
      entry.stop = Reflect.apply(operation[entry.member], operation, entry.args)
    }
    return { operation }
  })
  /** `use` of the operation, once it started. */
  const ready = <R>(use: (operation: TOperation) => R) =>
    started.then(({ operation }) => use(operation))
  const receipt = ready((operation) => operation.receipt)
  // A caller that never awaits a failed open gets no unhandled rejection.
  receipt.catch(() => {})
  const listen =
    (member: Waiting['member']) =>
    (...args: Array<unknown>) => {
      if (bound) return Reflect.apply(bound[member], bound, args)
      const entry: Waiting = { member, args, stop: undefined }
      waiting.add(entry)
      return () => {
        waiting.delete(entry)
        entry.stop?.()
      }
    }
  async function* events(
    options?: Parameters<Operation<unknown>['events']>[0],
  ) {
    const { operation } = await started
    yield* operation.events(options)
  }
  async function* stream(
    options?: Parameters<Operation<unknown>['stream']>[0],
  ) {
    const { operation } = await started
    yield* operation.stream(options)
  }
  return {
    get id() {
      if (!bound) {
        throw new Error(
          'The session of this operation opens again. Await operation.receipt before you read operation.id.',
        )
      }
      return bound.id
    },
    get kind() {
      return bound?.kind ?? kind
    },
    get agent() {
      return bound?.agent ?? agent
    },
    status: () => bound?.status() ?? 'accepted',
    receipt,
    then: <TResult1, TResult2>(
      onfulfilled?: (value: unknown) => TResult1 | PromiseLike<TResult1>,
      onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
    ) => ready((operation) => operation).then(onfulfilled, onrejected),
    events,
    stream,
    onEvent: listen('onEvent'),
    onMedia: listen('onMedia'),
    cancel: (reason?: string) => ready((operation) => operation.cancel(reason)),
    // An agent run takes messages.
    ...(kind === 'agent'
      ? {
          send: (...args: Array<unknown>) =>
            ready((operation) =>
              'send' in operation && typeof operation.send === 'function'
                ? Reflect.apply(operation.send, operation, args)
                : Promise.reject(new Error('This operation takes no message.')),
            ),
        }
      : {}),
  }
}

/**
 * The members that read the stored state of the session. On a session that
 * closed, they open it again. The other members that return a value at once
 * read the last state of the session.
 */
const REOPENING_READS: ReadonlySet<PropertyKey> = new Set([
  'transcript',
  'agentTranscript',
  'entry',
  'settled',
])

type Session<THarness extends AnyHarness> = SessionImpl<THarness>

/**
 * A handle to the shared session of a thread, that `host.open` returns,
 * bound to `principal`: a call that passes no `principal` acts as it. It has
 * every member of the session, and `this` stays the session.
 *
 * `close()` (or `await using`) releases only this handle: `lease` counts the
 * handles, and the host closes the session when none holds it and it is
 * idle. A handle that its holder drops is released by the garbage
 * collector, with a warning. A call on a handle whose session closed opens
 * it again through `lease`. A call through a released handle holds the
 * session while it runs.
 *
 * With `guard` (the host has access), each action asks `authorize` first. An
 * input is checked before the session stores it. A call that passes another
 * principal throws. After `host.revoke`, every call throws
 * `AccessDeniedError`. Reads ask `authorize` once, when the host opens the
 * handle, and again when it opens the session again.
 */
export function sessionHandle<THarness extends AnyHarness>({
  session,
  principal,
  guard,
  lease,
}: {
  session: Session<THarness>
  principal: Principal | undefined
  guard?: HandleGuard
  lease: HandleLease<THarness>
}) {
  const { threadId } = session
  /** The last session that this handle used. */
  let last = session
  const token: HandleToken = {
    isReleased: false,
    release: (options) => lease.release(options),
  }
  const live = (action: AccessAction) => {
    if (guard?.isRevoked()) throw new AccessDeniedError({ action, threadId })
  }
  /** The open session, or `undefined` when it closed. */
  const open = () => {
    const current = lease.current()
    if (current) last = current
    return current
  }
  /**
   * A released handle holds the session while a call runs. The function it
   * returns lets go, once.
   */
  const holdForCall = () => {
    if (!token.isReleased) return () => {}
    lease.hold()
    let isHeld = true
    return () => {
      if (!isHeld) return
      isHeld = false
      void lease.release()
    }
  }
  /** Run `call` on the open session. On a session that closed, open it again. */
  const run = async <T>(call: (target: Session<THarness>) => Promise<T>) => {
    const done = holdForCall()
    try {
      const target = open() ?? (last = await lease.reopen())
      return await call(target)
    } finally {
      done()
    }
  }
  /**
   * `run` for a call that returns an operation at once. On a session that
   * closed, the operation waits for the open.
   */
  const runOperation = <T extends Operation<unknown>>(
    kind: OperationKind,
    call: (target: Session<THarness>) => T,
    agent?: string,
  ) => {
    const done = holdForCall()
    const target = open()
    try {
      if (target) {
        const operation = call(target)
        operation.then(done, done)
        return operation
      }
      const opening = lease.reopen().then((reopened) => {
        last = reopened
        return reopened
      })
      opening.catch(done)
      return laterOperation({
        kind,
        agent,
        opening,
        call: (reopened) => {
          try {
            const operation = call(reopened)
            operation.then(done, done)
            return operation
          } catch (error) {
            done()
            throw error
          }
        },
      })
    } catch (error) {
      done()
      throw error
    }
  }
  /** Who acts in a call that passes `passed`. */
  const actor = (passed: Principal | undefined) => {
    if (passed === undefined) return principal
    const isOther = guard !== undefined && !isSameSender(passed, principal)
    if (isOther) {
      throw new Error(
        `This handle acts as ${JSON.stringify(principal?.id)}. Open another handle for ${JSON.stringify(passed.id)}.`,
      )
    }
    return passed
  }
  /** `options`, with the principal that acts. */
  const as = <T extends { principal?: Principal }>(options: T) => {
    const acting = actor(options.principal)
    return acting ? { ...options, principal: acting } : options
  }
  /** `call` on `target`, which stores an input: the session checks it first. */
  const checkedOn = <T>(
    target: Session<THarness>,
    call: (target: Session<THarness>) => T,
  ) =>
    guard
      ? target.checked(
          ({ input, run: accessRun }) =>
            guard.authorize(actionOf(input), accessRun),
          () => call(target),
        )
      : call(target)
  /** A call that stores an input and resolves to its receipt. */
  const storing = <T>(
    action: AccessAction,
    call: (target: Session<THarness>) => Promise<T>,
  ) => {
    live(action)
    return run((target) => checkedOn(target, call))
  }
  /** A call that stores an input and returns its operation. */
  const storingOperation = <T extends Operation<unknown>>(
    kind: OperationKind,
    call: (target: Session<THarness>) => T,
    agent?: string,
  ) => {
    live('send')
    return runOperation(kind, (target) => checkedOn(target, call), agent)
  }
  /** A call that stores no input: it runs after `authorize` allows `action`. */
  const acting = <T>(
    action: AccessAction,
    call: (target: Session<THarness>) => Promise<T>,
  ) => {
    live(action)
    return run(async (target) => {
      await guard?.authorize(action)
      return call(target)
    })
  }
  const agentOf = (name: string) => ({
    run: (input?: unknown, options?: AgentRunOptions) =>
      storingOperation(
        'agent',
        (target) => target.agentHandle(name, principal).run(input, options),
        name,
      ),
    start: (input?: unknown, options?: AgentStartOptions) =>
      storingOperation(
        'agent',
        (target) =>
          target
            .agentHandle(name, actor(options?.principal))
            .start(input, options),
        name,
      ),
  })
  const agents = new Proxy(session.agents, {
    get: (_target, name) =>
      typeof name === 'string' ? agentOf(name) : undefined,
  })
  /** Release this handle. A second call does nothing. */
  const close = () => {
    if (token.isReleased) return Promise.resolve()
    token.isReleased = true
    dropped.unregister(token)
    return lease.release()
  }
  type EventsOptions = Parameters<Session<THarness>['events']>[0]
  /** `events` of a session that closed, or of a released handle. */
  async function* heldEvents(options: EventsOptions) {
    // A released handle holds the session while it reads.
    const done = holdForCall()
    try {
      const target = open() ?? (last = await lease.reopen())
      yield* target.events(options)
    } finally {
      done()
    }
  }
  const events = (options?: EventsOptions) => {
    live('read')
    const target = open()
    const isHeld = target !== undefined && !token.isReleased
    return isHeld ? target.events(options) : heldEvents(options)
  }
  const methods = new Map<PropertyKey, unknown>([
    ...Object.entries({
      send: (message: UserInput, options?: SendOptions | AgentSendOptions) =>
        storingOperation(
          options?.to === undefined ? 'chat' : 'agent',
          (target) =>
            options?.to === undefined
              ? target.send(message, as(options ?? {}))
              : target.send(message, as(options)),
        ),
      tool: (options: Parameters<Session<THarness>['tool']>[0]) =>
        storingOperation('chat', (target) => target.tool(as(options))),
      continue: (options?: Parameters<Session<THarness>['continue']>[0]) =>
        storingOperation('chat', (target) =>
          target.continue(as(options ?? {})),
        ),
      command: (options: Parameters<Session<THarness>['command']>[0]) =>
        storingOperation('command', (target) => target.command(as(options))),
      reset: (options?: Parameters<Session<THarness>['reset']>[0]) =>
        storing('send', (target) => target.reset(as(options ?? {}))),
      setDelivery: (options: Parameters<Session<THarness>['setDelivery']>[0]) =>
        storing('send', (target) => target.setDelivery(as(options))),
      resolve: (options: Parameters<Session<THarness>['resolve']>[0]) =>
        storing('answer', (target) => target.resolve(as(options))),
      resolveForRun: (
        options: Parameters<Session<THarness>['resolveForRun']>[0],
      ) => storing('answer', (target) => target.resolveForRun(as(options))),
      answer: (options: Parameters<Session<THarness>['answer']>[0]) =>
        storing('answer', (target) => target.answer(as(options))),
      cancel: (options?: Parameters<Session<THarness>['cancel']>[0]) =>
        storing('cancel', (target) => target.cancel(as(options ?? {}))),
      cancelInput: (
        inputId: string,
        options?: Parameters<Session<THarness>['cancelInput']>[1],
      ) =>
        storing('cancel', (target) =>
          target.cancelInput(inputId, as(options ?? {})),
        ),
      configure: (options: Parameters<Session<THarness>['configure']>[0]) =>
        storing('configure', (target) => target.configure(as(options))),
      setConfig: (options: Parameters<Session<THarness>['setConfig']>[0]) =>
        storing('configure', (target) => target.setConfig(as(options))),
      agents,
      agent: (name: string) =>
        (open() ?? last).agent(name) === undefined ? undefined : agentOf(name),
      // These store no input, so the handle asks `authorize` itself.
      revert: (messageId: string) =>
        acting('send', (target) => target.revert(messageId)),
      unrevert: () => acting('send', (target) => target.unrevert()),
      background: (toolCallId?: string) =>
        acting('send', (target) => target.background(toolCallId)),
      append: (records: Parameters<Session<THarness>['append']>[0]) =>
        acting('send', (target) => target.append(records)),
      putMedia: (upload: Parameters<Session<THarness>['putMedia']>[0]) =>
        acting('send', (target) => target.putMedia(upload)),
      updateEntry: (update: Parameters<Session<THarness>['updateEntry']>[0]) =>
        acting('configure', (target) => target.updateEntry(update)),
      reload: () => acting('configure', (target) => target.reload()),
      // A schedule needs the action of the input it runs later.
      schedule: (options: Parameters<Session<THarness>['schedule']>[0]) =>
        acting(actionOf(options.input), (target) =>
          target.schedule(as(options)),
        ),
      cancelSchedule: (
        options: Parameters<Session<THarness>['cancelSchedule']>[0],
      ) => acting('cancel', (target) => target.cancelSchedule(options)),
      events,
      close,
    }),
    [Symbol.asyncDispose, close],
  ])
  // ponytail: a Proxy, so the handle has every member of the session and
  // stays an instance of it. Only the members above change. The other
  // members run on the open session, or on the last one when it closed.
  const handle = new Proxy(session, {
    get(_target, key) {
      if (methods.has(key)) return methods.get(key)
      const target = open() ?? last
      const value: unknown = Reflect.get(target, key)
      if (typeof value !== 'function') return value
      if (REOPENING_READS.has(key)) {
        return (...args: Array<unknown>) => {
          live('read')
          return run(async (reopened) => {
            const member: unknown = Reflect.get(reopened, key)
            return typeof member === 'function'
              ? Reflect.apply(member, reopened, args)
              : member
          })
        }
      }
      return (...args: Array<unknown>) => {
        live('read')
        return Reflect.apply(value, target, args)
      }
    },
  })
  tokens.set(handle, token)
  dropped.register(handle, token, token)
  return handle
}
