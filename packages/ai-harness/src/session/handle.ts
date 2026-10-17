import { AccessDeniedError } from '../access'
import { isSameSender } from './helpers'
import type { AccessAction, AccessRun } from '../access'
import type { AnyHarness } from '../define'
import type {
  AgentSendOptions,
  HarnessInput,
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

/** The action that `authorize` gets for an input. */
function actionOf(input: HarnessInput): AccessAction {
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

type Session<THarness extends AnyHarness> = SessionImpl<THarness>

/**
 * The session that `host.open` returns, bound to `principal`: a call that
 * passes no `principal` acts as it. It has every member of the session, and
 * `this` stays the session.
 *
 * With `guard` (the host has access), each action asks `authorize` first. An
 * input is checked before the session stores it. A call that passes another
 * principal throws. After `host.revoke`, every call throws
 * `AccessDeniedError`. Reads ask `authorize` once, when the host opens the
 * handle.
 */
export function sessionHandle<THarness extends AnyHarness>({
  session,
  principal,
  guard,
}: {
  session: Session<THarness>
  principal: Principal | undefined
  guard?: HandleGuard
}) {
  const { threadId } = session
  const live = (action: AccessAction) => {
    if (guard?.isRevoked()) throw new AccessDeniedError({ action, threadId })
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
  /** A call that stores an input: the session checks the input first. */
  const storing = <T>(action: AccessAction, call: () => T) => {
    live(action)
    if (!guard) return call()
    return session.checked(
      ({ input, run }) => guard.authorize(actionOf(input), run),
      call,
    )
  }
  /** A call that stores no input: it runs after `authorize` allows `action`. */
  const acting = async <T>(action: AccessAction, call: () => Promise<T>) => {
    live(action)
    await guard?.authorize(action)
    return call()
  }
  const agentOf = (name: string) => ({
    run: (input?: unknown, options?: AgentRunOptions) =>
      storing('send', () =>
        session.agentHandle(name, principal).run(input, options),
      ),
    start: (input?: unknown, options?: AgentStartOptions) =>
      storing('send', () =>
        session
          .agentHandle(name, actor(options?.principal))
          .start(input, options),
      ),
  })
  const agents = new Proxy(session.agents, {
    get: (_target, name) =>
      typeof name === 'string' ? agentOf(name) : undefined,
  })
  const methods = new Map<PropertyKey, unknown>(
    Object.entries({
      send: (message: UserInput, options?: SendOptions | AgentSendOptions) =>
        storing('send', () =>
          options?.to === undefined
            ? session.send(message, as(options ?? {}))
            : session.send(message, as(options)),
        ),
      tool: (options: Parameters<Session<THarness>['tool']>[0]) =>
        storing('send', () => session.tool(as(options))),
      continue: (options?: Parameters<Session<THarness>['continue']>[0]) =>
        storing('send', () => session.continue(as(options ?? {}))),
      command: (options: Parameters<Session<THarness>['command']>[0]) =>
        storing('send', () => session.command(as(options))),
      reset: (options?: Parameters<Session<THarness>['reset']>[0]) =>
        storing('send', () => session.reset(as(options ?? {}))),
      setDelivery: (options: Parameters<Session<THarness>['setDelivery']>[0]) =>
        storing('send', () => session.setDelivery(as(options))),
      resolve: (options: Parameters<Session<THarness>['resolve']>[0]) =>
        storing('answer', () => session.resolve(as(options))),
      resolveForRun: (
        options: Parameters<Session<THarness>['resolveForRun']>[0],
      ) => storing('answer', () => session.resolveForRun(as(options))),
      answer: (options: Parameters<Session<THarness>['answer']>[0]) =>
        storing('answer', () => session.answer(as(options))),
      cancel: (options?: Parameters<Session<THarness>['cancel']>[0]) =>
        storing('cancel', () => session.cancel(as(options ?? {}))),
      cancelInput: (
        target: string,
        options?: Parameters<Session<THarness>['cancelInput']>[1],
      ) =>
        storing('cancel', () => session.cancelInput(target, as(options ?? {}))),
      configure: (options: Parameters<Session<THarness>['configure']>[0]) =>
        storing('configure', () => session.configure(as(options))),
      setConfig: (options: Parameters<Session<THarness>['setConfig']>[0]) =>
        storing('configure', () => session.setConfig(as(options))),
      agents,
      agent: (name: string) =>
        session.agent(name) === undefined ? undefined : agentOf(name),
      // These store no input, so the handle asks `authorize` itself.
      revert: (messageId: string) =>
        acting('send', () => session.revert(messageId)),
      unrevert: () => acting('send', () => session.unrevert()),
      background: (toolCallId?: string) =>
        acting('send', () => session.background(toolCallId)),
      append: (records: Parameters<Session<THarness>['append']>[0]) =>
        acting('send', () => session.append(records)),
      putMedia: (upload: Parameters<Session<THarness>['putMedia']>[0]) =>
        acting('send', () => session.putMedia(upload)),
      updateEntry: (update: Parameters<Session<THarness>['updateEntry']>[0]) =>
        acting('configure', () => session.updateEntry(update)),
      reload: () => acting('configure', () => session.reload()),
    }),
  )
  // ponytail: a Proxy, so the handle has every member of the session and
  // stays an instance of it. Only the members above change.
  return new Proxy(session, {
    get(target, key) {
      if (methods.has(key)) return methods.get(key)
      const value: unknown = Reflect.get(target, key)
      if (typeof value !== 'function') return value
      return (...args: Array<unknown>) => {
        live('read')
        return Reflect.apply(value, target, args)
      }
    },
  })
}
