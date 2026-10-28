import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  INTERRUPT_CONTINUATION_METADATA_KEY,
  genericInterruptContinuationFromDescriptor,
  readGenericInterruptContinuation,
  wrapGenericInterruptContinuation,
} from '../src/generic-interrupt-continuation'
import {
  INTERRUPT_PAYLOAD_METADATA_KEY,
  createInterruptBinding,
  defineInterrupt,
} from '../src/interrupt-definition'
import { INTERRUPT_BINDING_METADATA_KEY } from '../src/interrupt-resume'
import { INTERRUPT_BINDING_VERSION } from '../src/interrupts'

describe('generic interrupt continuation', () => {
  it('treats missing metadata as absent', () => {
    expect(readGenericInterruptContinuation(undefined)).toEqual({
      status: 'absent',
    })
    expect(readGenericInterruptContinuation({})).toEqual({ status: 'absent' })
  })

  it('rejects a present key with a bad shape', () => {
    expect(
      readGenericInterruptContinuation({
        [INTERRUPT_CONTINUATION_METADATA_KEY]: 'nope',
      }),
    ).toMatchObject({ status: 'invalid' })
    expect(
      readGenericInterruptContinuation({
        [INTERRUPT_CONTINUATION_METADATA_KEY]: { v: 2 },
      }),
    ).toMatchObject({ status: 'invalid' })
  })

  it('round-trips a first-party interrupt descriptor', () => {
    const review = defineInterrupt({
      id: 'review-plan',
      payloadSchema: z.object({ title: z.string() }),
      responseSchema: z.object({ approved: z.boolean() }),
    })
    const request = review.interrupt({
      key: 'turn-1',
      reason: 'review',
      message: 'Review the plan',
      payload: { title: 'Ship it' },
    })
    const emission = createInterruptBinding(request, { batchIndex: 0 })
    const interrupt = {
      id: 'generic-1',
      reason: request.reason,
      message: request.message,
      metadata: {
        [INTERRUPT_BINDING_METADATA_KEY]: {
          v: INTERRUPT_BINDING_VERSION,
          kind: 'generic',
          interruptId: 'generic-1',
          definitionId: emission.descriptor.definitionId,
          key: emission.descriptor.key,
          batchIndex: 0,
          responseSchemaHash: emission.descriptor.responseSchemaHash,
          payloadSchemaHash: emission.descriptor.payloadSchemaHash,
        },
        [INTERRUPT_PAYLOAD_METADATA_KEY]: { title: 'Ship it' },
      },
    }
    const continuation = genericInterruptContinuationFromDescriptor(interrupt)
    expect(continuation).toMatchObject({
      v: 1,
      definitionId: 'review-plan',
      key: 'turn-1',
      batchIndex: 0,
      reason: 'review',
      message: 'Review the plan',
      payload: { title: 'Ship it' },
    })
    if (!continuation) throw new Error('Expected continuation')
    expect(
      readGenericInterruptContinuation(
        wrapGenericInterruptContinuation(continuation),
      ),
    ).toEqual({ status: 'ok', value: continuation })
  })
})
