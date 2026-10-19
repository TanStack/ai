import { AccessDeniedError } from '../access'
import { InputRejectedError } from '../types'
import { isSameSender } from './helpers'
import type { AccessAction, AccessRun, AccessWait } from '../access'
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
  authorize: (
    action: AccessAction,
    run?: AccessRun,
    wait?: AccessWait,
  ) => Promise<void>
  /** `host.revoke` took the access of the principal of the handle. */
  isRevoked: () => boolean
  /**
   * Call `listener` when `host.revoke` (or `unshare`) takes the access of
   * the principal of the handle. Returns a function that stops the calls.
   */
  onRevoke: (listener: () => void) => () => void
}

/**
 * @internal The items of `read`, until `signal` aborts or `onRevoke` calls
 * its listener. A revoke ends the read with `AccessDeniedError`, so a read
 * that started before the revoke stops too. The listener is added at the
 * call, not at the first pull, so a revoke between them ends the read too.
 *
 * ponytail: an iterable that is never read keeps its listener until the
 * revoke.
 */
export function untilRevoked<T>({
  onRevoke,
  threadId,
  signal,
  read,
}: {
  onRevoke: HandleGuard['onRevoke']
  threadId: string
  signal: AbortSignal | undefined
  read: (signal: AbortSignal) => AsyncIterable<T>
}): AsyncGenerator<T> {
  const revoked = new AbortController()
  const stop = onRevoke(() => revoked.abort())
  return (async function* () {
    try {
      yield* read(
        signal ? AbortSignal.any([signal, revoked.signal]) : revoked.signal,
      )
    } finally {
      stop()
    }
    if (revoked.signal.aborted) {
      throw new AccessDeniedError({ action: 'read', threadId })
    }
  })()
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

/**
 * @internal Throws `AccessDeniedError` unless `authorize` allows `input`. An
 * answer or a resolve of a `human` wait needs the `operator` action, not
 * `answer`.
 */
export async function authorizeInput({
  authorize,
  input,
  run,
  wait,
}: {
  authorize: HandleGuard['authorize']
  input: HarnessInput
  run: AccessRun | undefined
  wait: AccessWait | undefined
}) {
  const action = actionOf(input)
  // A `human` wait takes an operator, not the user who waits for a person.
  const isHuman = action === 'answer' && wait?.kind === 'human'
  await authorize(isHuman ? 'operator' : action, run, wait)
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
    // An operator reply answers the `human` wait of a handoff.
    case 'prompt':
      return input.as === 'operator' ? 'operator' : 'send'
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
  'logState',
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
          ({ input, run: accessRun, wait }) =>
            authorizeInput({
              authorize: guard.authorize,
              input,
              run: accessRun,
              wait,
            }),
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
  /** The operations that `guarded` wrapped, so one operation gets one wrapper. */
  const wrapped = new WeakMap<object, unknown>()
  /**
   * `operation`, with its `cancel` and `send` through this handle: they act
   * as the principal of the handle, after `authorize` allows them.
   */
  const guarded = <T extends Operation<unknown>>(operation: T): T => {
    const known = wrapped.get(operation)
    if (known) return known as T
    const proxy = new Proxy(operation, {
      get(target, key) {
        if (key === 'cancel') {
          return async () => cancel({ operationId: target.id })
        }
        const value: unknown = Reflect.get(target, key)
        if (typeof value !== 'function') return value
        if (key === 'send') {
          return async (
            message: UserInput,
            options?: Omit<AgentSendOptions, 'to'>,
          ) => {
            const sent = send(message, { ...options, to: target.id })
            const receipt = await sent.receipt
            // A refused access check throws, as the calls of the handle do.
            if (receipt.status === 'rejected') {
              await Promise.resolve(sent).catch((error: unknown) => {
                if (error instanceof AccessDeniedError) throw error
              })
            }
            return receipt
          }
        }
        return value.bind(target)
      },
    })
    wrapped.set(operation, proxy)
    return proxy
  }
  /** A call that stores an input and returns its operation. */
  const storingOperation = <T extends Operation<unknown>>(
    kind: OperationKind,
    call: (target: Session<THarness>) => T,
    agent?: string,
  ) => {
    live('send')
    return runOperation(
      kind,
      (target) => guarded(checkedOn(target, call)),
      agent,
    )
  }
  /**
   * A call that stores no input: it runs after `authorize` allows `action`.
   * With a guard, `runOf` gives the run that the call targets, when it
   * targets one.
   */
  const acting = <T>(
    action: AccessAction,
    call: (target: Session<THarness>) => Promise<T>,
    runOf?: (
      target: Session<THarness>,
    ) => AccessRun | undefined | Promise<AccessRun | undefined>,
  ) => {
    live(action)
    return run(async (target) => {
      if (guard) await guard.authorize(action, await runOf?.(target))
      return call(target)
    })
  }
  const agentOf = (name: string) => ({
    run: (input?: unknown, options?: AgentRunOptions) =>
      storingOperation(
        'agent',
        (target) =>
          target
            .agentHandle(name, actor(options?.principal))
            .run(input, options),
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
    const read = (next?: EventsOptions) =>
      isHeld ? target.events(next) : heldEvents(next)
    if (!guard) return read(options)
    // A revoke ends a read that runs now, not only the next call.
    return untilRevoked({
      onRevoke: guard.onRevoke,
      threadId,
      signal: options?.signal,
      read: (signal) => read({ ...options, signal }),
    })
  }
  const send = (message: UserInput, options?: SendOptions | AgentSendOptions) =>
    storingOperation(options?.to === undefined ? 'chat' : 'agent', (target) =>
      options?.to === undefined
        ? target.send(message, as(options ?? {}))
        : target.send(message, as(options)),
    )
  const sendForRun = (
    message: UserInput,
    options?: Parameters<Session<THarness>['sendForRun']>[1],
  ) =>
    storingOperation('chat', (target) =>
      target.sendForRun(message, as(options ?? {})),
    )
  const cancel = (options?: Parameters<Session<THarness>['cancel']>[0]) =>
    storing('cancel', (target) => target.cancel(as(options ?? {})))
  /** The operation `id` of the session, through this handle. */
  const operationOf = <T extends Operation<unknown>>(
    find: (target: Session<THarness>) => T | undefined,
  ) => {
    live('read')
    const found = find(open() ?? last)
    return found && guarded(found)
  }
  const methods = new Map<PropertyKey, unknown>([
    ...Object.entries({
      send,
      sendForRun,
      // A returned operation cancels, and an agent run takes messages,
      // through this handle too.
      operation: (id: string) => operationOf((target) => target.operation(id)),
      agentRun: (id: string) => operationOf((target) => target.agentRun(id)),
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
      cancel,
      cancelInput: (options: Parameters<Session<THarness>['cancelInput']>[0]) =>
        storing('cancel', (target) => target.cancelInput(as(options))),
      configure: (options: Parameters<Session<THarness>['configure']>[0]) =>
        storing('configure', (target) => target.configure(as(options))),
      setConfig: (options: Parameters<Session<THarness>['setConfig']>[0]) =>
        storing('configure', (target) => target.setConfig(as(options))),
      agents,
      agent: (name: string) =>
        (open() ?? last).agent(name) === undefined ? undefined : agentOf(name),
      // These store no input, so the handle asks `authorize` itself.
      revert: (options: Parameters<Session<THarness>['revert']>[0]) =>
        acting('send', (target) => target.revert(as(options))),
      unrevert: () => acting('send', (target) => target.unrevert()),
      background: (options?: Parameters<Session<THarness>['background']>[0]) =>
        acting('send', (target) => target.background(as(options ?? {}))),
      append: (options: Parameters<Session<THarness>['append']>[0]) =>
        acting('send', (target) => target.append(as(options))),
      putMedia: (upload: Parameters<Session<THarness>['putMedia']>[0]) =>
        acting('send', (target) => target.putMedia(upload)),
      updateEntry: (update: Parameters<Session<THarness>['updateEntry']>[0]) =>
        acting('configure', (target) => target.updateEntry(update)),
      reload: () => acting('configure', (target) => target.reload()),
      // A schedule needs the action of the input it runs later. An answer or
      // a cancel is checked with its run from the log, which must exist now.
      schedule: (options: Parameters<Session<THarness>['schedule']>[0]) =>
        acting(
          actionOf(options.input),
          (target) => target.schedule(as(options)),
          async (target) => {
            const found = await target.loggedRun(options.input)
            if (found !== null) return found
            // A user with no access to the action learns nothing of the run.
            await guard?.authorize(actionOf(options.input))
            throw new InputRejectedError({
              inputId: `schedule:${options.scheduleId ?? 'new'}`,
              status: 'rejected',
              reason: 'unknown_run',
            })
          },
        ),
      cancelSchedule: (
        options: Parameters<Session<THarness>['cancelSchedule']>[0],
      ) =>
        acting(
          'cancel',
          (target) => target.cancelSchedule(options),
          (target) => target.scheduleRun(options.scheduleId),
        ),
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
