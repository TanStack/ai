import type { ApprovalResult } from '../types'

export interface WorkflowRequestParams {
  approval?: ApprovalResult
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
  const body = (await request.json()) as RawBody
  return {
    approval: body.approval,
    input: body.input,
    runId: body.runId,
    abort: body.abort,
  }
}
