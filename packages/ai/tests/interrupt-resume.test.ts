import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineInterrupt,
  hashSchemaInput,
  normalizeApprovalSchema,
  toolDefinition,
  validateInterruptResumeBatch,
} from '../src/index'
import { INTERRUPT_BINDING_VERSION } from '../src/interrupts'
import type { InterruptBinding } from '../src/interrupts'

const transferDef = toolDefinition({
  name: 'transfer',
  description: 'Transfer funds',
  needsApproval: true,
  inputSchema: z.object({ cents: z.number() }),
  outputSchema: z.object({ receipt: z.string() }),
  approvalSchema: {
    approve: z.object({ note: z.string() }),
    reject: z.object({ reason: z.string() }),
  },
})

const transfer = transferDef.server(async () => ({ receipt: 'ok' }))

function approvalFixture(
  overrides: Partial<Extract<InterruptBinding, { kind: 'tool-approval' }>> = {},
) {
  const approval = normalizeApprovalSchema(
    transferDef.approvalSchema,
    transferDef.inputSchema,
  )
  const binding: Extract<InterruptBinding, { kind: 'tool-approval' }> = {
    v: INTERRUPT_BINDING_VERSION,
    kind: 'tool-approval',
    interruptId: 'approval_call-1',
    interruptedRunId: 'run-1',
    generation: 0,
    toolName: 'transfer',
    toolCallId: 'call-1',
    originalArgs: { cents: 100 },
    inputSchemaHash: hashSchemaInput(transferDef.inputSchema),
    approvalSchemaHash: approval.approvalSchemaHash,
    responseSchemaHash: approval.responseSchemaHash,
    ...overrides,
  }
  const descriptor = {
    id: binding.interruptId,
    reason: 'tool_call',
    toolCallId: binding.toolCallId,
    responseSchema: approval.responseSchema,
    metadata: { 'tanstack:interruptBinding': binding },
  }
  return { binding, descriptor, approval }
}

function baseInput(
  pending: Array<{
    interruptId: string
    payload: unknown
    binding: InterruptBinding
  }>,
  resume: Array<{
    interruptId: string
    status: 'resolved' | 'cancelled'
    payload?: unknown
  }>,
  now?: number,
) {
  return {
    threadId: 'thread-1',
    interruptedRunId: 'run-1',
    generation: 0,
    pending,
    resume,
    tools: [transfer],
    ...(now !== undefined ? { now } : {}),
  }
}

function pendingOf(fixture: ReturnType<typeof approvalFixture>) {
  return [
    {
      interruptId: fixture.binding.interruptId,
      payload: fixture.descriptor,
      binding: fixture.binding,
    },
  ]
}

describe('validateInterruptResumeBatch', () => {
  it('accepts a complete payload-bearing approval batch', async () => {
    const fixture = approvalFixture()
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), [
        {
          interruptId: fixture.binding.interruptId,
          status: 'resolved',
          payload: { approved: true, payload: { note: 'ok' } },
        },
      ]),
    )
    expect(result.errors).toEqual([])
    const approvals = result.resumeToolState?.approvals
    expect(approvals?.get('call-1')).toMatchObject({
      approved: true,
      payload: { note: 'ok' },
    })
  })

  it('rejects expired bindings', async () => {
    const fixture = approvalFixture({
      expiresAt: '2020-01-01T00:00:00.000Z',
    })
    const result = await validateInterruptResumeBatch(
      baseInput(
        pendingOf(fixture),
        [
          {
            interruptId: fixture.binding.interruptId,
            status: 'resolved',
            payload: { approved: true, payload: { note: 'ok' } },
          },
        ],
        Date.parse('2024-01-01T00:00:00.000Z'),
      ),
    )
    expect(result.errors.some((error) => error.code === 'expired')).toBe(true)
  })

  it('rejects an unparseable expiresAt', async () => {
    const fixture = approvalFixture({
      expiresAt: 'not-a-date',
    })
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), [
        {
          interruptId: fixture.binding.interruptId,
          status: 'resolved',
          payload: { approved: true, payload: { note: 'ok' } },
        },
      ]),
    )
    expect(
      result.errors.some((error) => error.code === 'invalid-payload'),
    ).toBe(true)
  })

  it('rejects stale correlation metadata', async () => {
    const fixture = approvalFixture({ interruptedRunId: 'other-run' })
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), [
        {
          interruptId: fixture.binding.interruptId,
          status: 'resolved',
          payload: { approved: true, payload: { note: 'ok' } },
        },
      ]),
    )
    expect(result.errors.some((error) => error.code === 'stale')).toBe(true)
  })

  it('rejects schema drift on input hash', async () => {
    const fixture = approvalFixture({
      inputSchemaHash: 'sha256:drifted-input',
    })
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), [
        {
          interruptId: fixture.binding.interruptId,
          status: 'resolved',
          payload: { approved: true, payload: { note: 'ok' } },
        },
      ]),
    )
    expect(result.errors.some((error) => error.code === 'stale')).toBe(true)
  })

  it('rejects duplicate resume entries for one interrupt', async () => {
    const fixture = approvalFixture()
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), [
        {
          interruptId: fixture.binding.interruptId,
          status: 'resolved',
          payload: { approved: true, payload: { note: 'a' } },
        },
        {
          interruptId: fixture.binding.interruptId,
          status: 'resolved',
          payload: { approved: true, payload: { note: 'b' } },
        },
      ]),
    )
    expect(result.errors.some((error) => error.code === 'conflict')).toBe(true)
  })

  it('rejects unknown resume ids not in pending', async () => {
    const fixture = approvalFixture()
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), [
        {
          interruptId: fixture.binding.interruptId,
          status: 'resolved',
          payload: { approved: true, payload: { note: 'ok' } },
        },
        {
          interruptId: 'unknown-id',
          status: 'resolved',
          payload: { approved: true },
        },
      ]),
    )
    expect(
      result.errors.some(
        (error) =>
          error.code === 'unknown-interrupt' ||
          error.code === 'incomplete-batch',
      ),
    ).toBe(true)
  })

  it('rejects cancelled resumes that include a payload', async () => {
    const fixture = approvalFixture()
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), [
        {
          interruptId: fixture.binding.interruptId,
          status: 'cancelled',
          payload: { reason: 'nope' },
        },
      ]),
    )
    expect(
      result.errors.some((error) => error.code === 'invalid-payload'),
    ).toBe(true)
  })

  it('rejects invalid status values', async () => {
    const fixture = approvalFixture()
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), [
        {
          interruptId: fixture.binding.interruptId,
          // @ts-expect-error intentional invalid wire status
          status: 'pending',
        },
      ]),
    )
    expect(
      result.errors.some((error) => error.code === 'invalid-payload'),
    ).toBe(true)
  })

  it('rejects payloadless approve when approve branch requires payload', async () => {
    const fixture = approvalFixture()
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), [
        {
          interruptId: fixture.binding.interruptId,
          status: 'resolved',
          payload: true,
        },
      ]),
    )
    expect(
      result.errors.some(
        (error) =>
          error.code === 'invalid-payload' ||
          error.code === 'item-validation-failed',
      ),
    ).toBe(true)
  })

  it('rejects incomplete batches when a pending entry is missing', async () => {
    const fixture = approvalFixture()
    const result = await validateInterruptResumeBatch(
      baseInput(pendingOf(fixture), []),
    )
    expect(
      result.errors.some(
        (error) =>
          error.code === 'incomplete-batch' ||
          error.code === 'unknown-interrupt',
      ),
    ).toBe(true)
  })

  it('allows a missing client-tool resume when every generic in the batch is answered', async () => {
    const review = defineInterrupt({
      id: 'review-plan',
      payloadSchema: z.object({ title: z.string() }),
      responseSchema: z.object({
        approved: z.boolean(),
        note: z.string(),
      }),
    })
    const request = review.interrupt({
      key: 'one',
      reason: 'review',
      message: 'Review',
      payload: { title: 'Plan' },
    })
    const renderDef = toolDefinition({
      name: 'render_review',
      description: 'Render a review',
      inputSchema: z.object({ reviewId: z.string() }),
      outputSchema: z.object({ rendered: z.boolean() }),
    })
    const genericBinding: Extract<InterruptBinding, { kind: 'generic' }> = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'generic',
      interruptId: 'generic-1',
      interruptedRunId: 'run-1',
      generation: 0,
      definitionId: 'review-plan',
      key: 'one',
      batchIndex: 0,
    }
    const clientBinding: Extract<
      InterruptBinding,
      { kind: 'client-tool-execution' }
    > = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'client-tool-execution',
      interruptId: 'client_tool_call-2',
      interruptedRunId: 'run-1',
      generation: 0,
      toolName: 'render_review',
      toolCallId: 'call-2',
      outputSchemaHash: hashSchemaInput(renderDef.outputSchema),
      responseSchemaHash: 'sha256:client-tool',
    }
    const result = await validateInterruptResumeBatch({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 0,
      pending: [
        {
          interruptId: genericBinding.interruptId,
          payload: request,
          binding: genericBinding,
          genericRequest: request,
        },
        {
          interruptId: clientBinding.interruptId,
          payload: {},
          binding: clientBinding,
        },
      ],
      resume: [
        {
          interruptId: genericBinding.interruptId,
          status: 'resolved',
          payload: { approved: true, note: 'ok' },
        },
      ],
      tools: [transfer, renderDef.client(async () => ({ rendered: true }))],
    })
    expect(result.errors).toEqual([])
    expect(result.resumeToolState).toBeDefined()
    expect(result.resumeToolState?.genericInterrupts?.get('generic-1')).toEqual(
      {
        interruptId: 'generic-1',
        status: 'resolved',
        payload: { approved: true, note: 'ok' },
      },
    )
    expect(result.resumeToolState?.clientToolResults?.size).toBe(0)
  })

  it('rejects an invalid first-party generic answer', async () => {
    const review = defineInterrupt({
      id: 'review-plan',
      responseSchema: z.object({
        approved: z.boolean(),
        note: z.string(),
      }),
    })
    const request = review.interrupt({
      key: 'one',
      reason: 'review',
      message: 'Review',
    })
    const binding: Extract<InterruptBinding, { kind: 'generic' }> = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'generic',
      interruptId: 'generic-1',
      interruptedRunId: 'run-1',
      generation: 0,
      definitionId: 'review-plan',
      key: 'one',
      batchIndex: 0,
    }
    const result = await validateInterruptResumeBatch({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 0,
      pending: [
        {
          interruptId: binding.interruptId,
          payload: request,
          binding,
          genericRequest: request,
        },
      ],
      resume: [
        {
          interruptId: binding.interruptId,
          status: 'resolved',
          payload: { approved: 'yes' },
        },
      ],
      tools: [transfer],
    })
    expect(
      result.errors.some((error) => error.code === 'invalid-payload'),
    ).toBe(true)
    expect(result.resumeToolState).toBeUndefined()
  })

  it('still requires a client-tool resume when the batch has no generic interrupt', async () => {
    const renderDef = toolDefinition({
      name: 'render_review',
      description: 'Render a review',
      inputSchema: z.object({ reviewId: z.string() }),
      outputSchema: z.object({ rendered: z.boolean() }),
    })
    const clientBinding: Extract<
      InterruptBinding,
      { kind: 'client-tool-execution' }
    > = {
      v: INTERRUPT_BINDING_VERSION,
      kind: 'client-tool-execution',
      interruptId: 'client_tool_call-2',
      interruptedRunId: 'run-1',
      generation: 0,
      toolName: 'render_review',
      toolCallId: 'call-2',
      outputSchemaHash: hashSchemaInput(renderDef.outputSchema),
      responseSchemaHash: 'sha256:client-tool',
    }
    const result = await validateInterruptResumeBatch({
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      generation: 0,
      pending: [
        {
          interruptId: clientBinding.interruptId,
          payload: {},
          binding: clientBinding,
        },
      ],
      resume: [],
      tools: [renderDef.client(async () => ({ rendered: true }))],
    })
    expect(
      result.errors.some(
        (error) =>
          error.code === 'incomplete-batch' ||
          error.code === 'unknown-interrupt',
      ),
    ).toBe(true)
  })
})
