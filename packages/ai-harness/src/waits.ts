import {
  INTERRUPT_PAYLOAD_METADATA_KEY,
  readUnopenedInterruptBinding,
} from '@tanstack/ai'
import { isRecord } from './utils'
import type { Interrupt } from '@tanstack/ai'
import type { WaitState } from './log-records'
import type { PendingQuestion } from './types'

/**
 * What a wait waits for.
 *
 * - `approval`: a yes or no for a tool call.
 * - `question`: an answer of the wait's `schema`, for example from `ask()`
 *   or an MCP form.
 * - `sign-in`: the user signs in to a connector.
 * - `client-tool`: the output of a tool that runs in the client.
 * - `human`: a person (an operator) takes over, for example after a handoff,
 *   or an app interrupt of `defineInterrupt`.
 */
export type WaitKind =
  | 'approval'
  | 'question'
  | 'sign-in'
  | 'client-tool'
  | 'human'

/** How a wait ended. */
export type WaitOutcome = 'answered' | 'cancelled' | 'expired'

/**
 * One thing that a run waits for: an approval, a question, a sign-in, a
 * client tool, or a human. The session log keeps it, so any machine can
 * answer it, and it can expire.
 */
export interface Wait {
  waitId: string
  kind: WaitKind
  /** The run that waits. */
  runId: string
  /** Who started the run. That user (or the owner of the session) may answer. */
  principal?: { id: string; tenantId?: string }
  /** The shape of the answer, as JSON Schema. */
  schema?: unknown
  /** When the wait expires with no answer, in epoch milliseconds. */
  expiresAt?: number
  /** The text to show the user. */
  message?: string
}

/** A wait, or an interrupt that is one. */
type WaitLike = Wait | Interrupt

const isWait = (item: WaitLike): item is Wait => 'waitId' in item

/**
 * The sign-in that an interrupt waits for, from
 * `credentials.require(id, { wait: true })`: the connector, and its page.
 */
export function signInOf(
  interrupt: Interrupt,
): { connector: string; url?: string } | undefined {
  if (interrupt.reason !== 'auth_required') return undefined
  const payload = interrupt.metadata?.[INTERRUPT_PAYLOAD_METADATA_KEY]
  const request = isRecord(payload) ? payload.request : undefined
  if (!isRecord(request) || typeof request.connector !== 'string') {
    return undefined
  }
  return {
    connector: request.connector,
    ...(typeof request.url === 'string' ? { url: request.url } : {}),
  }
}

/**
 * The kind of a wait, or of an interrupt of the last turn. One rule for
 * every transport:
 *
 * - A sign-in interrupt (`auth_required` with a connector) is `sign-in`.
 * - A tool approval is `approval`. An interrupt with no binding of
 *   `chat()` is a plain stop for a yes or no, so it is `approval` too.
 * - A client tool is `client-tool`.
 * - An interrupt of `defineInterrupt` is `human`. Any other interrupt with
 *   a generic binding (an MCP form) is `question`.
 *
 * @example
 * ```ts
 * for (const interrupt of session.snapshot().pendingInterrupts) {
 *   if (waitKind(interrupt) === 'client-tool') runInBrowser(interrupt)
 * }
 * ```
 */
export function waitKind(wait: WaitLike): WaitKind {
  if (isWait(wait)) return wait.kind
  if (signInOf(wait)) return 'sign-in'
  const binding = readUnopenedInterruptBinding(wait)
  switch (binding?.kind) {
    case 'client-tool-execution':
      return 'client-tool'
    case 'generic':
      return binding.definitionId === undefined ? 'question' : 'human'
    case 'tool-approval':
    case undefined:
      return 'approval'
  }
}

/** True for a wait (or an interrupt) that asks for a yes or no on a tool call. */
export function isApproval(wait: WaitLike): boolean {
  return waitKind(wait) === 'approval'
}

/** The time of an ISO date, or `undefined` for a value that is not one. */
function timeOf(iso: string | undefined) {
  if (iso === undefined) return undefined
  const time = Date.parse(iso)
  return Number.isFinite(time) ? time : undefined
}

/**
 * The wait of an interrupt that the run `runId` stopped for.
 *
 * @example
 * ```ts
 * const waits = snapshot.pendingInterrupts.map((interrupt) =>
 *   waitOfInterrupt({ interrupt, runId }),
 * )
 * ```
 */
export function waitOfInterrupt({
  interrupt,
  runId,
  principal,
}: {
  interrupt: Interrupt
  runId: string
  principal?: Wait['principal']
}): Wait {
  const expiresAt = timeOf(interrupt.expiresAt)
  return {
    waitId: interrupt.id,
    kind: waitKind(interrupt),
    runId,
    ...(principal ? { principal } : {}),
    ...(interrupt.responseSchema !== undefined
      ? { schema: interrupt.responseSchema }
      : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(interrupt.message ? { message: interrupt.message } : {}),
  }
}

/** The wait of a question that the run `runId` asked. */
export function waitOfQuestion({
  question,
  runId,
  principal,
  expiresAt,
}: {
  question: PendingQuestion
  runId: string
  principal?: Wait['principal']
  expiresAt?: number
}): Wait {
  return {
    waitId: question.questionId,
    kind: 'question',
    runId,
    ...(principal ? { principal } : {}),
    ...(question.schema !== undefined ? { schema: question.schema } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    message: question.message,
  }
}

/**
 * How long a wait of each kind waits when its opener names no `expiresAt`,
 * in milliseconds. `undefined`: no limit. A sign-in waits as long as a
 * device login does.
 */
const DEFAULT_WAIT_MS: Readonly<Record<WaitKind, number | undefined>> = {
  approval: undefined,
  question: undefined,
  'client-tool': undefined,
  human: undefined,
  'sign-in': 15 * 60 * 1000,
}

/** The `expiresAt` of a new wait of `kind`: `expiresAt`, else the default. */
export function expiryOf(
  kind: WaitKind,
  expiresAt: number | undefined,
  now = Date.now(),
) {
  if (expiresAt !== undefined) return expiresAt
  const ms = DEFAULT_WAIT_MS[kind]
  return ms === undefined ? undefined : now + ms
}

/** The waits of `waits` that did not end, oldest first. */
export function openWaits(waits: ReadonlyMap<string, WaitState> | undefined) {
  return [...(waits?.values() ?? [])].filter(
    (state) => state.outcome === undefined,
  )
}

/** The question of an open wait of kind `question`, as a snapshot lists it. */
function questionOf({ wait, secret, url }: WaitState): Array<PendingQuestion> {
  if (wait.kind !== 'question') return []
  return [
    {
      questionId: wait.waitId,
      message: wait.message ?? '',
      ...(wait.schema !== undefined ? { schema: wait.schema } : {}),
      ...(secret ? { secret: true } : {}),
      ...(url ? { url } : {}),
    },
  ]
}

/**
 * The waits of a snapshot: the interrupts that the turn `stopped` waits
 * for, then the open waits of the log. The questions are a view of them.
 */
export function snapshotWaits({
  stopped,
  interrupts,
  waits,
}: {
  stopped: { runId: string; principal?: Wait['principal'] } | null | undefined
  interrupts: ReadonlyArray<Interrupt>
  waits: ReadonlyMap<string, WaitState> | undefined
}) {
  const open = openWaits(waits)
  const runId = stopped?.runId ?? 'session'
  const principal = stopped?.principal
  return {
    pendingQuestions: open.flatMap(questionOf),
    pendingWaits: [
      ...interrupts.map((interrupt) =>
        waitOfInterrupt({
          interrupt,
          runId,
          ...(principal ? { principal } : {}),
        }),
      ),
      ...open.map(({ wait }) => wait),
    ],
  }
}
