import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  hashSchemaInput,
  normalizeApprovalSchema,
  toolDefinition,
  validateInterruptResumeBatch,
} from '../src/index'
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
})
