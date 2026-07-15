import { describe, expect, it } from 'vitest'
import { interruptLabScenarios } from './scenarios'
import {
  buildApprovalResolution,
  buildGenericResolution,
  createDurableDraftEnvelope,
  createIncompleteBulkResolver,
  describeInterruptErrors,
  durableCapabilityStatuses,
  durableOutcomeStatus,
  interruptLabPageConfig,
  interruptProgressLabel,
  invalidAggregateResolutionArguments,
  isNormalSendDisabled,
  restoreDurableDrafts,
  visibleDurableControls,
} from './client-ui'

describe('interrupt lab client interaction contract', () => {
  it('maps each mode to its own endpoint and stable thread namespace', () => {
    expect(interruptLabPageConfig('ephemeral')).toMatchObject({
      endpoint: '/api/interrupts',
      threadPrefix: 'interrupt-lab-ephemeral',
      durable: false,
    })
    expect(interruptLabPageConfig('durable')).toMatchObject({
      endpoint: '/api/durable-interrupts',
      threadPrefix: 'interrupt-lab-durable',
      durable: true,
    })
  })

  it('dispatches the registry prompt unchanged', () => {
    const scenario = interruptLabScenarios['approval-edit-args']
    expect(interruptLabPageConfig('ephemeral').promptFor(scenario.id)).toBe(
      scenario.prompt,
    )
  })

  it('distinguishes a staged item from the final auto-submitting item', () => {
    expect(interruptProgressLabel(3, 1, false)).toContain('1 of 3 staged')
    expect(interruptProgressLabel(3, 2, false)).toContain('final decision')
    expect(interruptProgressLabel(3, 3, true)).toContain('Submitting')
  })

  it('keeps edited arguments and approval data under payload', () => {
    expect(
      buildApprovalResolution(true, '{"quantity":2}', '{"note":"ok"}'),
    ).toEqual({
      approved: true,
      options: {
        editedArgs: { quantity: 2 },
        payload: { note: 'ok' },
      },
    })
    expect(buildGenericResolution('{"answer":"yes"}')).toEqual({
      answer: 'yes',
    })
  })

  it('provides a deliberately incomplete callback for rollback demos', () => {
    expect(
      createIncompleteBulkResolver()({ id: 'interrupt-1' }),
    ).toBeUndefined()
  })

  it('disables normal sends while any interrupt is pending', () => {
    expect(isNormalSendDisabled('note', false, false, 1)).toBe(true)
    expect(isNormalSendDisabled('note', false, false, 0)).toBe(false)
    expect(isNormalSendDisabled('', false, false, 0)).toBe(true)
  })

  it('only exposes recovery controls in durable mode', () => {
    expect(visibleDurableControls('ephemeral')).toEqual([])
    expect(visibleDurableControls('durable')).toEqual([
      'saved-drafts',
      'reload-recovery',
      'retry-join-replay',
      'cas-conflict',
      'expiry',
    ])
  })

  it('projects item and batch errors for the visible inspector', () => {
    expect(
      describeInterruptErrors(
        [{ code: 'invalid-payload', message: 'note is required' }],
        [{ code: 'incomplete-batch', message: 'resolve every item' }],
      ),
    ).toEqual([
      'Item · invalid-payload · note is required',
      'Batch · incomplete-batch · resolve every item',
    ])
  })

  it('creates unsafe-runtime aggregate inputs for every interrupt kind', () => {
    expect(invalidAggregateResolutionArguments('tool-approval')).toEqual([
      true,
      { editedArgs: {}, payload: {} },
    ])
    expect(invalidAggregateResolutionArguments('generic')).toEqual([{}])
    expect(
      invalidAggregateResolutionArguments('client-tool-execution'),
    ).toEqual([{}])
  })

  it('round-trips only active durable editor drafts', () => {
    const draft = {
      editedArgs: '{"quantity":2}',
      includeEditedArgs: true,
      approvePayload: '{"note":"ok"}',
      rejectPayload: '{"reason":"no"}',
      output: '{"browserValue":"42"}',
    }
    const envelope = createDurableDraftEnvelope({
      mode: 'durable',
      threadId: 'thread-1',
      interruptedRunId: 'run-1',
      drafts: { one: draft, stale: { ...draft, output: 'stale' } },
    })

    expect(
      restoreDurableDrafts({
        mode: 'durable',
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        activeInterruptIds: ['one'],
        serialized: JSON.stringify(envelope),
      }),
    ).toEqual({ one: draft })
    expect(
      restoreDurableDrafts({
        mode: 'ephemeral',
        threadId: 'thread-1',
        interruptedRunId: 'run-1',
        activeInterruptIds: ['one'],
        serialized: JSON.stringify(envelope),
      }),
    ).toEqual({})
  })

  it('maps durable public outcomes and capabilities precisely', () => {
    expect(
      durableOutcomeStatus([{ code: 'conflict', retryable: false }]),
    ).toMatchObject({ kind: 'conflict', label: 'CAS conflict' })
    expect(
      durableOutcomeStatus([{ code: 'stale', retryable: false }]),
    ).toMatchObject({ kind: 'stale', label: 'Stale generation' })
    expect(
      durableOutcomeStatus([{ code: 'expired', retryable: false }]),
    ).toMatchObject({ kind: 'expired', label: 'Expired' })
    expect(
      durableOutcomeStatus([{ code: 'transport', retryable: true }]),
    ).toMatchObject({ kind: 'retryable', label: 'Retry available' })

    expect(
      durableCapabilityStatuses('durable', {
        retryable: true,
        hasExpiresAt: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'retry', availability: 'available' }),
        expect.objectContaining({
          id: 'join-replay',
          availability: 'unavailable',
        }),
        expect.objectContaining({
          id: 'expiry',
          availability: 'observable-only',
        }),
      ]),
    )
  })

  it('prioritizes item-scoped expiry and stale errors with duplicate root errors', () => {
    expect(
      durableOutcomeStatus(
        [{ code: 'stale', retryable: false, scope: 'item' }],
        [
          { code: 'conflict', retryable: false, scope: 'batch' },
          { code: 'conflict', retryable: false, scope: 'batch' },
        ],
      ),
    ).toMatchObject({ kind: 'conflict', label: 'CAS conflict' })

    expect(
      durableOutcomeStatus(
        [{ code: 'expired', retryable: false, scope: 'item' }],
        [{ code: 'stale', retryable: false, scope: 'batch' }],
      ),
    ).toMatchObject({ kind: 'expired', label: 'Expired' })
  })
})
