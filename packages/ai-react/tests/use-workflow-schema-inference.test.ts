import { act, renderHook } from '@testing-library/react'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { useOrchestration, useWorkflow } from '../src/use-workflow'
import type { WorkflowConnectionAdapter } from '@tanstack/ai-client'

const InputSchema = z.object({
  topic: z.string(),
  depth: z.number().int(),
})

const OutputSchema = z.object({
  summary: z.string(),
  citations: z.array(z.string()),
})

const StateSchema = z.object({
  phase: z.enum(['drafting', 'done']),
  progress: z.number(),
})

function createWorkflowConnection(): WorkflowConnectionAdapter {
  return {
    connect: async function* (body) {
      expect(body).toMatchObject({
        input: { topic: 'workflow schema inference', depth: 2 },
      })

      yield {
        type: 'RUN_FINISHED',
        output: {
          summary: 'Schema inference works',
          citations: ['source-1'],
        },
      }
    },
  }
}

describe('workflow hook schema inference', () => {
  it('infers useWorkflow start input and output from zod schemas', async () => {
    const { result } = renderHook(() =>
      useWorkflow({
        input: InputSchema,
        output: OutputSchema,
        connection: createWorkflowConnection(),
      }),
    )

    expectTypeOf(result.current.start).parameters.toEqualTypeOf<
      [z.infer<typeof InputSchema>, ({ runId?: string } | undefined)?]
    >()
    expectTypeOf(result.current.output).toEqualTypeOf<z.infer<
      typeof OutputSchema
    > | null>()

    await act(async () => {
      await result.current.start({
        topic: 'workflow schema inference',
        depth: 2,
      })
    })

    expect(result.current.output).toEqual({
      summary: 'Schema inference works',
      citations: ['source-1'],
    })
  })

  it('infers useOrchestration start input and output from zod schemas', () => {
    const { result } = renderHook(() =>
      useOrchestration({
        input: InputSchema,
        output: OutputSchema,
        connection: createWorkflowConnection(),
      }),
    )

    expectTypeOf(result.current.start).parameters.toEqualTypeOf<
      [z.infer<typeof InputSchema>, ({ runId?: string } | undefined)?]
    >()
    expectTypeOf(result.current.output).toEqualTypeOf<z.infer<
      typeof OutputSchema
    > | null>()
  })

  it('infers workflow state from a zod schema when provided', () => {
    const { result } = renderHook(() =>
      useWorkflow({
        input: InputSchema,
        output: OutputSchema,
        state: StateSchema,
        connection: createWorkflowConnection(),
      }),
    )

    expectTypeOf(result.current.state).toEqualTypeOf<z.infer<
      typeof StateSchema
    > | null>()
  })

  it('preserves the legacy explicit generic workflow signature', () => {
    type Input = { topic: string }
    type Output = { summary: string }

    const { result } = renderHook(() =>
      useWorkflow<Input, Output>({
        connection: createWorkflowConnection(),
      }),
    )

    expectTypeOf(result.current.start).parameters.toEqualTypeOf<
      [Input, ({ runId?: string } | undefined)?]
    >()
    expectTypeOf(result.current.output).toEqualTypeOf<Output | null>()
  })
})
