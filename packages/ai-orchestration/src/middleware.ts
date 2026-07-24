import { createMiddleware } from '@tanstack/workflow-core'
import { AI_AGENT_META_KEY, AI_STREAM_CHUNK_EVENT } from './constants'
import { executeAgent } from './execute-agent'
import type { StreamChunk } from '@tanstack/ai'
import type { Middleware, WorkflowCtx } from '@tanstack/workflow-core'
import type {
  AIWorkflowContext,
  AgentInput,
  AgentOptions,
  AgentOutput,
  AnyAgentDefinition,
} from './types'

/** Adds the package-owned `ctx.ai` namespace to a Workflow handler. */
export function agentMiddleware(): Middleware<
  WorkflowCtx,
  { ai: AIWorkflowContext }
> {
  return createMiddleware<WorkflowCtx>().server<{ ai: AIWorkflowContext }>(
    async ({ ctx, next }) => {
      const ai: AIWorkflowContext = {
        agent: <TAgent extends AnyAgentDefinition>(
          id: string,
          definition: TAgent,
          input: AgentInput<TAgent>,
          options?: AgentOptions,
        ): Promise<AgentOutput<TAgent>> => {
          const meta = {
            ...options?.meta,
            [AI_AGENT_META_KEY]: definition.name,
          }

          return ctx.step(
            id,
            (step) =>
              executeAgent<AgentInput<TAgent>, AgentOutput<TAgent>>({
                definition,
                input,
                signal: step.signal,
                emit: (chunk: StreamChunk) => {
                  ctx.emit(AI_STREAM_CHUNK_EVENT, {
                    stepId: step.id,
                    attempt: step.attempt,
                    chunk,
                  })
                },
              }),
            { ...options, meta },
          )
        },
      }

      return next({ context: { ai } })
    },
  )
}
