import { cloneAndDeepFreezeJson } from '@tanstack/ai'
import type {
  InterruptPersistenceGateway,
  InterruptRecoveryQuery,
  InterruptRecoveryStateV1,
  InterruptSubmissionError,
} from '@tanstack/ai'

export type InterruptRecoveryAuthorization =
  | { authorized: false }
  | { authorized: true; includeResolutions: boolean }

export interface InterruptRecoveryHandlerOptions {
  gateway: InterruptPersistenceGateway
  authorize: (
    request: Request,
    input: InterruptRecoveryQuery,
  ) => InterruptRecoveryAuthorization | Promise<InterruptRecoveryAuthorization>
}

export interface GetInterruptRecoveryStateOptions {
  includeResolutions?: boolean
}

function redactCommittedResolutions(
  state: InterruptRecoveryStateV1,
): InterruptRecoveryStateV1 {
  if (!state.committed || state.committed.resolutions === undefined) {
    return state
  }
  return cloneAndDeepFreezeJson({
    ...state,
    committed: {
      fingerprint: state.committed.fingerprint,
      ...(state.committed.continuationRunId
        ? { continuationRunId: state.committed.continuationRunId }
        : {}),
      committedAt: state.committed.committedAt,
    },
  })
}

export async function getInterruptRecoveryState(
  gateway: InterruptPersistenceGateway,
  query: InterruptRecoveryQuery,
  options?: GetInterruptRecoveryStateOptions,
): Promise<InterruptRecoveryStateV1> {
  const state = await gateway.getInterruptRecoveryState(query)
  return options?.includeResolutions === true
    ? state
    : redactCommittedResolutions(state)
}

function recoveryError(input: {
  threadId: string
  interruptedRunId: string
  generation: number
  code: 'recovery-unavailable' | 'protocol' | 'server'
  message: string
  source?: 'client' | 'server'
  retryable?: boolean
}): InterruptSubmissionError {
  return {
    scope: 'batch',
    threadId: input.threadId,
    interruptedRunId: input.interruptedRunId,
    generation: input.generation,
    interruptIds: [],
    code: input.code,
    message: input.message,
    source: input.source ?? 'server',
    retryable: input.retryable ?? false,
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function createInterruptRecoveryHandler(
  options: InterruptRecoveryHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url)
    const threadId = url.searchParams.get('threadId') ?? ''
    const interruptedRunId = url.searchParams.get('interruptedRunId') ?? ''
    const knownGenerationText = url.searchParams.get('knownGeneration')
    const knownGeneration =
      knownGenerationText === null ? Number.NaN : Number(knownGenerationText)
    if (
      !threadId ||
      !interruptedRunId ||
      !Number.isSafeInteger(knownGeneration) ||
      knownGeneration < 0
    ) {
      return jsonResponse(
        {
          errors: [
            recoveryError({
              threadId,
              interruptedRunId,
              generation: Number.isSafeInteger(knownGeneration)
                ? knownGeneration
                : 0,
              code: 'protocol',
              message:
                'Recovery requires threadId, interruptedRunId, and a non-negative integer knownGeneration.',
              source: 'client',
            }),
          ],
        },
        400,
      )
    }
    const input = { threadId, interruptedRunId, knownGeneration }
    let authorization: InterruptRecoveryAuthorization
    try {
      authorization = await options.authorize(request, input)
    } catch (error) {
      return jsonResponse(
        {
          errors: [
            recoveryError({
              threadId: '',
              interruptedRunId: '',
              generation: 0,
              code: 'server',
              message: `Interrupt recovery authorization failed: ${error instanceof Error ? error.message : String(error)}`,
              retryable: true,
            }),
          ],
        },
        500,
      )
    }
    if (!authorization.authorized) {
      return jsonResponse(
        {
          errors: [
            recoveryError({
              threadId: '',
              interruptedRunId: '',
              generation: 0,
              code: 'recovery-unavailable',
              message: 'Interrupt recovery is not authorized.',
            }),
          ],
        },
        401,
      )
    }

    try {
      const state = await getInterruptRecoveryState(options.gateway, input, {
        includeResolutions: authorization.includeResolutions,
      })
      return jsonResponse(state, 200)
    } catch (error) {
      return jsonResponse(
        {
          errors: [
            recoveryError({
              threadId,
              interruptedRunId,
              generation: knownGeneration,
              code: 'recovery-unavailable',
              message: `Interrupt recovery failed: ${error instanceof Error ? error.message : String(error)}`,
              retryable: true,
            }),
          ],
        },
        503,
      )
    }
  }
}
