import type { ApprovalResult, SignalResult } from '../types'

export interface WorkflowRequestParams {
  approval?: ApprovalResult
  /** Generic signal delivery (Q5). Mutually exclusive with `approval`
   *  in practice; `signalDelivery` takes precedence if both are set. */
  signalDelivery?: SignalResult
  input?: unknown
  runId?: string
  /**
   * `true` when the client invoked `WorkflowClient.stop()` — the route
   * handler should look up the live run by `runId` and abort it instead of
   * starting a new workflow.
   */
  abort?: boolean
}

interface RawBody {
  abort?: boolean
  approval?: ApprovalResult
  signal?: SignalResult
  input?: unknown
  runId?: string
}

/**
 * Parse a workflow run request body. Returns the params to spread into
 * `runWorkflow(...)`. Mirrors how chat routes pull `messages` and `data`
 * out of `request.json()`.
 *
 * @example
 * ```typescript
 * POST: async ({ request }) => {
 *   const params = await parseWorkflowRequest(request)
 *   if (params.abort && params.runId) {
 *     runStore.getLive(params.runId)?.abortController.abort()
 *     return new Response(null, { status: 204 })
 *   }
 *   const stream = runWorkflow({ workflow, runStore, ...params })
 *   return toServerSentEventsResponse(stream)
 * }
 * ```
 */
export async function parseWorkflowRequest(
  request: Request,
): Promise<WorkflowRequestParams> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch (err) {
    // Wrap JSON parse failures in a typed error so route handlers can
    // distinguish bad client input (return 400) from genuine engine
    // errors. Without this the raw SyntaxError surfaces as a 500.
    throw new WorkflowRequestParseError(
      err instanceof Error ? err.message : 'Invalid JSON body',
      err,
    )
  }
  // Reject obviously-malformed bodies (string, array, null). The fields
  // are validated lazily downstream, but rejecting the shell early keeps
  // the engine's invariants narrow.
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new WorkflowRequestParseError(
      'Workflow request body must be a JSON object.',
    )
  }
  const body = raw as RawBody
  // Document precedence at the parse boundary: `signal` wins over
  // `approval` when both are set. The engine's resume path is documented
  // to ignore `approval` when `signalDelivery` is present, but a
  // forwarded `approval` next to `signalDelivery` is ambiguous on the
  // wire — normalize here so downstream code never has to disambiguate.
  return {
    approval: body.signal ? undefined : body.approval,
    signalDelivery: body.signal,
    input: body.input,
    runId: body.runId,
    abort: body.abort,
  }
}

/**
 * Thrown by `parseWorkflowRequest` when the body cannot be parsed or is
 * not a JSON object. Route handlers should catch and return a 400.
 */
export class WorkflowRequestParseError extends Error {
  override readonly name = 'WorkflowRequestParseError'
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message)
  }
}
