import {
  AI_AGENT_META_KEY,
  AI_STREAM_CHUNK_EVENT,
  WORKFLOW_APPROVAL_REQUESTED_EVENT,
  WORKFLOW_APPROVAL_RESOLVED_EVENT,
  WORKFLOW_SIGNAL_AWAITED_EVENT,
  WORKFLOW_SIGNAL_RESOLVED_EVENT,
  WORKFLOW_STEP_FAILED_EVENT,
} from './constants'
import { EventType } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import type { WorkflowEvent } from '@tanstack/workflow-core'

export interface WorkflowEventMapperOptions {
  /** AG-UI thread ID. Defaults to the Workflow run ID. */
  threadId?: string
  /** AG-UI run ID or a resolver from Workflow run ID. Defaults to the Workflow run ID. */
  runId?: string | ((workflowRunId: string) => string)
  /** Project Workflow state patches as AG-UI state patches. Disabled by default. */
  includeState?: boolean
}

export interface WorkflowEventMappingContext extends WorkflowEventMapperOptions {
  workflowRunId?: string
}

export type WorkflowEventMapper = (
  event: WorkflowEvent,
  workflowRunId?: string,
) => Array<StreamChunk>

export function workflowEventToStreamChunks(
  event: WorkflowEvent,
  context: WorkflowEventMappingContext = {},
): Array<StreamChunk> {
  const workflowRunId =
    event.type === 'RUN_STARTED' ||
    event.type === 'RUN_FINISHED' ||
    event.type === 'RUN_ERRORED'
      ? event.runId
      : context.workflowRunId
  const runId = workflowRunId
    ? resolveRunId(workflowRunId, context.runId)
    : undefined
  const threadId = context.threadId ?? workflowRunId

  switch (event.type) {
    case 'RUN_STARTED':
      return [
        {
          type: EventType.RUN_STARTED,
          timestamp: event.ts,
          runId: runId ?? event.runId,
          threadId: threadId ?? event.runId,
        },
      ]
    case 'RUN_FINISHED':
      return [
        {
          type: EventType.RUN_FINISHED,
          timestamp: event.ts,
          runId: runId ?? event.runId,
          threadId: threadId ?? event.runId,
          result: event.output,
        },
      ]
    case 'RUN_ERRORED':
      return [
        {
          type: EventType.RUN_ERROR,
          timestamp: event.ts,
          message: event.error.message,
          code: event.code,
        },
      ]
    case 'STEP_STARTED': {
      const agentName = readAgentName(event.meta)
      return [
        {
          type: EventType.STEP_STARTED,
          timestamp: event.ts,
          stepName: agentName ?? event.stepId,
          stepId: event.stepId,
          stepType: agentName ? 'agent' : 'workflow',
        },
      ]
    }
    case 'STEP_FINISHED': {
      const agentName = readAgentName(event.meta)
      return [
        {
          type: EventType.STEP_FINISHED,
          timestamp: event.ts,
          stepName: agentName ?? event.stepId,
          stepId: event.stepId,
        },
      ]
    }
    case 'STEP_FAILED': {
      const agentName = readAgentName(event.meta)
      return [
        {
          type: EventType.STEP_FINISHED,
          timestamp: event.ts,
          stepName: agentName ?? event.stepId,
          stepId: event.stepId,
        },
        customChunk(event.ts, WORKFLOW_STEP_FAILED_EVENT, {
          stepId: event.stepId,
          error: event.error,
        }),
      ]
    }
    case 'APPROVAL_REQUESTED':
      return [
        customChunk(event.ts, WORKFLOW_APPROVAL_REQUESTED_EVENT, {
          stepId: event.stepId,
          approvalId: event.approvalId,
          title: event.title,
          ...(event.description === undefined
            ? {}
            : { description: event.description }),
          ...(event.meta === undefined ? {} : { meta: event.meta }),
        }),
      ]
    case 'APPROVAL_RESOLVED':
      return [
        customChunk(event.ts, WORKFLOW_APPROVAL_RESOLVED_EVENT, {
          stepId: event.stepId,
          approvalId: event.approvalId,
          approved: event.approved,
          ...(event.feedback === undefined ? {} : { feedback: event.feedback }),
          ...(event.meta === undefined ? {} : { meta: event.meta }),
        }),
      ]
    case 'SIGNAL_AWAITED':
      return [
        customChunk(event.ts, WORKFLOW_SIGNAL_AWAITED_EVENT, {
          stepId: event.stepId,
          name: event.name,
          ...(event.deadline === undefined ? {} : { deadline: event.deadline }),
          ...(event.meta === undefined ? {} : { meta: event.meta }),
        }),
      ]
    case 'SIGNAL_RESOLVED':
      return [
        customChunk(event.ts, WORKFLOW_SIGNAL_RESOLVED_EVENT, {
          stepId: event.stepId,
          name: event.name,
          ...(event.signalId === undefined ? {} : { signalId: event.signalId }),
          ...(event.meta === undefined ? {} : { meta: event.meta }),
        }),
      ]
    case 'STATE_DELTA':
      return context.includeState
        ? [
            {
              type: EventType.STATE_DELTA,
              timestamp: event.ts,
              delta: [...event.delta],
            },
          ]
        : []
    case 'CUSTOM':
      if (event.name === AI_STREAM_CHUNK_EVENT) {
        const chunk = readStreamChunk(event.value.chunk)
        return chunk ? [chunk] : []
      }
      return [customChunk(event.ts, event.name, event.value, runId, threadId)]
    case 'NOW_RECORDED':
    case 'UUID_RECORDED':
      return []
  }
}

export function createWorkflowEventMapper(
  options: WorkflowEventMapperOptions = {},
): WorkflowEventMapper {
  let currentWorkflowRunId: string | undefined

  return (event, workflowRunId) => {
    if (event.type === 'RUN_STARTED') currentWorkflowRunId = event.runId
    return workflowEventToStreamChunks(event, {
      ...options,
      workflowRunId: workflowRunId ?? currentWorkflowRunId,
    })
  }
}

export async function* toAIStream(
  events: AsyncIterable<WorkflowEvent>,
  options: WorkflowEventMapperOptions = {},
): AsyncIterable<StreamChunk> {
  const map = createWorkflowEventMapper(options)
  for await (const event of events) {
    for (const chunk of map(event)) yield chunk
  }
}

export function createAIEventPublisher(options: {
  publish: (runId: string, chunk: StreamChunk) => void | Promise<void>
  mapping?: WorkflowEventMapperOptions
}): (runId: string, event: WorkflowEvent) => Promise<void> {
  const map = createWorkflowEventMapper(options.mapping)

  return async (workflowRunId, event) => {
    const runId = resolveRunId(workflowRunId, options.mapping?.runId)
    for (const chunk of map(event, workflowRunId)) {
      await options.publish(runId, chunk)
    }
  }
}

function resolveRunId(
  workflowRunId: string,
  configured: WorkflowEventMapperOptions['runId'],
): string {
  if (typeof configured === 'function') return configured(workflowRunId)
  return configured ?? workflowRunId
}

function readAgentName(meta: Record<string, unknown> | undefined) {
  const value = meta?.[AI_AGENT_META_KEY]
  return typeof value === 'string' ? value : undefined
}

function customChunk(
  timestamp: number,
  name: string,
  value: Record<string, unknown>,
  runId?: string,
  threadId?: string,
): StreamChunk {
  return {
    type: 'CUSTOM',
    timestamp,
    name,
    value,
    ...(runId === undefined ? {} : { runId }),
    ...(threadId === undefined ? {} : { threadId }),
  }
}

function readStreamChunk(value: unknown): StreamChunk | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    typeof value.type !== 'string'
  ) {
    return undefined
  }
  return value as StreamChunk
}
