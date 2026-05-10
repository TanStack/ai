import { toServerSentEventsResponse } from '@tanstack/ai'
import { runWorkflow } from '../engine/run-workflow'
import type { InMemoryRunStore } from '../run-store/in-memory'
import type { AnyWorkflowDefinition, ApprovalResult } from '../types'

export interface HandleWorkflowRequestOptions {
  request: Request
  runStore: InMemoryRunStore
  workflow: AnyWorkflowDefinition
}

interface RequestBody {
  abort?: boolean
  approval?: ApprovalResult
  input?: unknown
  runId?: string
}

/**
 * Server entry point for workflow runs. Handles JSON parsing, mode detection
 * (start vs resume vs abort), and SSE response shaping.
 *
 *     POST: ({ request }) => handleWorkflowRequest({
 *       workflow: articleWorkflow,
 *       runStore,
 *       request,
 *     })
 */
export async function handleWorkflowRequest(
  options: HandleWorkflowRequestOptions,
): Promise<Response> {
  const body = (await options.request.json()) as RequestBody

  if (body.abort && body.runId) {
    // v1: abort plumbing TODO. No-op response.
    return new Response(null, { status: 204 })
  }

  if (body.approval && body.runId) {
    return toServerSentEventsResponse(
      runWorkflow({
        approval: body.approval,
        runId: body.runId,
        runStore: options.runStore,
        workflow: options.workflow,
      }),
    )
  }

  if (body.input === undefined) {
    return new Response('input required', { status: 400 })
  }

  return toServerSentEventsResponse(
    runWorkflow({
      input: body.input,
      runStore: options.runStore,
      workflow: options.workflow,
    }),
  )
}
