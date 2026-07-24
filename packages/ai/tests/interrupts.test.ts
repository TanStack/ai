import { describe, expect, expectTypeOf, it } from 'vitest'
import { EventType } from '@ag-ui/core'
import {
  hashSchemaInput,
  normalizeApprovalSchema,
} from '../src/activities/chat/tools/approval-schema'
import {
  canonicalInterruptJson,
  cloneAndDeepFreezeJson,
  digestInterruptJson,
} from '../src/interrupt-serialization'
import {
  INTERRUPT_BINDING_VERSION,
  canonicalizeInterruptResolutions,
} from '../src/interrupts'
import {
  INTERRUPT_BINDING_METADATA_KEY,
  readInterruptBinding,
  readUnopenedInterruptBinding,
  withInterruptBinding,
} from '../src/interrupt-resume'
import type { InterruptSubmissionError } from '../src/interrupts'
import type {
  Interrupt,
  RunAgentResumeItem,
  RunFinishedEvent,
  RunFinishedOutcome,
  TextOptions,
} from '../src/types'

describe('AG-UI interrupt protocol types', () => {
  it('allows RUN_FINISHED success, interrupt, and legacy outcomes', () => {
    const success = {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
      timestamp: 1,
      outcome: { type: 'success' },
    } satisfies RunFinishedEvent

    const interrupt = {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
      timestamp: 1,
      outcome: {
        type: 'interrupt',
        interrupts: [
          {
            id: 'interrupt-1',
            reason: 'tool_call',
            message: 'Approve the tool call?',
            toolCallId: 'tool-call-1',
            responseSchema: {
              type: 'object',
              properties: { approved: { type: 'boolean' } },
              required: ['approved'],
            },
            expiresAt: '2026-04-20T17:00:00Z',
            metadata: { surface: 'test' },
          },
        ],
      },
    } satisfies RunFinishedEvent

    const legacy: RunFinishedEvent = {
      type: EventType.RUN_FINISHED,
      threadId: 'thread-1',
      runId: 'run-1',
      timestamp: 1,
    }

    expect(success.outcome).toEqual({ type: 'success' })
    expect(interrupt.outcome.interrupts[0]?.id).toBe('interrupt-1')
    expect(legacy.outcome).toBeUndefined()
  })

  it('exposes resume items on TextOptions', () => {
    const resume = [
      {
        interruptId: 'interrupt-1',
        status: 'resolved',
        payload: { approved: true },
      },
      {
        interruptId: 'interrupt-2',
        status: 'cancelled',
      },
    ] satisfies Array<RunAgentResumeItem>

    const options = {
      model: 'test-model',
      messages: [],
      logger: undefined as never,
      resume,
    } satisfies TextOptions

    expect(options.resume).toBe(resume)
    expectTypeOf<RunFinishedOutcome>().toMatchTypeOf<
      { type: 'success' } | { type: 'interrupt'; interrupts: Array<Interrupt> }
    >()
  })
})

describe('approval schema normalization and interrupt serialization', () => {
  it('builds branch-aware approval envelopes and rejects malformed maps', () => {
    const normalized = normalizeApprovalSchema({
      approve: { type: 'object', required: ['note'] },
    })
    expect(normalized.responseSchema).toMatchObject({
      oneOf: expect.any(Array),
    })
    expect(normalized.branches.reject).toBeNull()
    expect(() => normalizeApprovalSchema({})).toThrow(/approve or reject/)
    expect(() =>
      normalizeApprovalSchema({
        approve: { unsupported: Symbol('bad') },
      }),
    ).toThrow(/SchemaInput/)
  })

  it('normalizes shared and omitted payload branches with stable hashes', () => {
    const shared = { type: 'string', minLength: 1 }
    const left = normalizeApprovalSchema(shared, {
      type: 'object',
      properties: { value: { type: 'number' } },
    })
    const right = normalizeApprovalSchema(
      { minLength: 1, type: 'string' },
      {
        properties: { value: { type: 'number' } },
        type: 'object',
      },
    )
    const omitted = normalizeApprovalSchema(undefined)

    expect(left.branches.approve?.jsonSchema).toBe(shared)
    expect(left.branches.reject?.jsonSchema).toBe(shared)
    expect(left.responseSchemaHash).toBe(right.responseSchemaHash)
    expect(left.approvalSchemaHash).toBe(right.approvalSchemaHash)
    expect(omitted.branches).toEqual({ approve: null, reject: null })
    expect(hashSchemaInput(undefined)).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('canonicalizes JSON without hashing functions and deeply freezes clones', () => {
    const canonical = canonicalInterruptJson({ z: 1, a: { value: true } })
    expect(canonical).toBe('{"a":{"value":true},"z":1}')
    expect(digestInterruptJson(canonical)).toMatch(/^sha256:[0-9a-f]{64}$/)

    const frozen = cloneAndDeepFreezeJson({ nested: { ok: true } })
    expect(Object.isFrozen(frozen)).toBe(true)
    expect(Object.isFrozen(frozen.nested)).toBe(true)
    expect(() => canonicalInterruptJson({ handler: () => undefined })).toThrow(
      /JSON-compatible/,
    )

    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    expect(() => canonicalInterruptJson(cyclic)).toThrow(/cycle/)
  })
})

describe('core interrupt correlation', () => {
  it('correlates interrupt errors to the interrupted run', () => {
    const error: InterruptSubmissionError = {
      scope: 'batch',
      code: 'conflict',
      message: 'Another response batch won.',
      source: 'server',
      retryable: false,
      interruptIds: ['interrupt-1'],
      threadId: 'thread-1',
      interruptedRunId: 'run-old',
      generation: 2,
    }

    expect(error.interruptedRunId).toBe('run-old')
  })

  it('canonicalizes and deeply freezes response batches in core', () => {
    const left = canonicalizeInterruptResolutions([
      { interruptId: 'b', status: 'cancelled' },
      {
        interruptId: 'a',
        status: 'resolved',
        payload: { z: 1, a: 2 },
      },
    ])
    const right = canonicalizeInterruptResolutions([
      {
        interruptId: 'a',
        status: 'resolved',
        payload: { a: 2, z: 1 },
      },
      { interruptId: 'b', status: 'cancelled' },
    ])

    expect(left.canonicalResolutions).toBe(right.canonicalResolutions)
    expect(left.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(left.fingerprint).toBe(right.fingerprint)
    expect(Object.isFrozen(left.resolutions)).toBe(true)
    expect(Object.isFrozen(left.resolutions[0])).toBe(true)
  })
})

describe('interrupt binding seam', () => {
  const openedBinding = {
    v: INTERRUPT_BINDING_VERSION,
    kind: 'generic',
    interruptId: 'pause-1',
    interruptedRunId: 'run-1',
    generation: 0,
    responseSchemaHash: 'none',
  } as const

  it('attaches a binding under the namespaced key without disturbing the envelope', () => {
    const descriptor: Interrupt = {
      id: 'pause-1',
      reason: 'confirmation',
      message: 'Pick a shipping speed',
      metadata: { surface: 'checkout' },
    }

    const bound = withInterruptBinding(descriptor, openedBinding)

    // The AG-UI envelope is untouched; only the namespaced key is added.
    expect(bound.id).toBe(descriptor.id)
    expect(bound.reason).toBe(descriptor.reason)
    expect(bound.message).toBe(descriptor.message)
    expect(bound.metadata?.['surface']).toBe('checkout')
    expect(bound.metadata?.[INTERRUPT_BINDING_METADATA_KEY]).toMatchObject({
      v: INTERRUPT_BINDING_VERSION,
      interruptId: 'pause-1',
    })
    expect(readInterruptBinding(bound)).toEqual(openedBinding)
  })

  it('reads no binding off an interrupt this package did not produce', () => {
    const foreign: Interrupt = {
      id: 'workflow-approval-1',
      reason: 'approval_requested',
      metadata: { 'acme:workflowApproval': { stepId: 'deploy' } },
    }

    expect(readUnopenedInterruptBinding(foreign)).toBeUndefined()
    expect(readInterruptBinding(foreign)).toBeUndefined()
  })

  it('rejects a binding stamped with a version it does not understand', () => {
    const future: Interrupt = {
      id: 'pause-1',
      reason: 'confirmation',
      metadata: {
        [INTERRUPT_BINDING_METADATA_KEY]: {
          ...openedBinding,
          v: INTERRUPT_BINDING_VERSION + 1,
        },
      },
    }

    expect(readUnopenedInterruptBinding(future)).toBeUndefined()
    expect(readInterruptBinding(future)).toBeUndefined()
  })

  it('still reads a binding written before the version field existed', () => {
    const { v: _omitted, ...unversioned } = openedBinding
    const legacy: Interrupt = {
      id: 'pause-1',
      reason: 'confirmation',
      metadata: { [INTERRUPT_BINDING_METADATA_KEY]: unversioned },
    }

    expect(readInterruptBinding(legacy)).toEqual(openedBinding)
  })
})
