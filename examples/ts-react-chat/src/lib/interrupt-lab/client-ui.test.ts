import { describe, expect, it } from 'vitest'
import { interruptLabScenarios } from './scenarios'
import {
  buildApprovalResolution,
  buildGenericResolution,
  createDurableDraftEnvelope,
  createInterruptLabDebugFetch,
  createIncompleteBulkResolver,
  describeInterruptErrors,
  durableCapabilityStatuses,
  durableOutcomeStatus,
  interruptLabPageConfig,
  interruptLabSearchFromSearch,
  interruptProgressLabel,
  interruptLabDebugFromSearch,
  invalidAggregateResolutionArguments,
  isNormalSendDisabled,
  restoreDurableDrafts,
  shouldShowOpenAiApiKeyGuidance,
  visibleDurableControls,
} from './client-ui'

describe('interrupt lab client interaction contract', () => {
  it('enables debug logging only for an explicit public query flag', () => {
    expect(interruptLabDebugFromSearch({})).toBe(false)
    expect(interruptLabDebugFromSearch({ debug: false })).toBe(false)
    expect(interruptLabDebugFromSearch({ debug: '0' })).toBe(false)
    expect(interruptLabDebugFromSearch({ debug: true })).toBe(true)
    expect(interruptLabDebugFromSearch({ debug: '1' })).toBe(true)
    expect(interruptLabDebugFromSearch({ debug: 'true' })).toBe(true)
  })

  it('keeps a valid scenario case with the debug flag and rejects unknown cases', () => {
    expect(
      interruptLabSearchFromSearch(
        { debug: '1', case: 'approval-edit-args' },
        'durable',
      ),
    ).toEqual({ debug: true, case: 'approval-edit-args' })
    expect(
      interruptLabSearchFromSearch(
        { debug: 'true', case: 'not-a-scenario' },
        'durable',
      ),
    ).toEqual({ debug: true })
  })

  it('logs structured client requests and responses only when debug is enabled', async () => {
    const entries: Array<unknown> = []
    const fetchClient: typeof fetch = () => Promise.resolve(new Response('ok'))
    const disabledFetch = createInterruptLabDebugFetch({
      enabled: false,
      fetchClient,
      log: (entry) => entries.push(entry),
    })
    await disabledFetch('http://localhost/api/interrupts', {
      method: 'POST',
      body: JSON.stringify({ runId: 'run-disabled' }),
    })
    expect(entries).toEqual([])

    const debugFetch = createInterruptLabDebugFetch({
      enabled: true,
      fetchClient,
      log: (entry) => entries.push(entry),
    })
    await debugFetch('http://localhost/api/interrupts', {
      method: 'POST',
      headers: { authorization: 'never-log-this-secret' },
      body: JSON.stringify({
        threadId: 'thread-1',
        runId: 'run-2',
        parentRunId: 'run-1',
        resume: [
          {
            interruptId: 'approval_fc_1',
            status: 'resolved',
            payload: { approved: true },
          },
        ],
      }),
    })

    expect(entries).toEqual([
      {
        event: 'request',
        url: 'http://localhost/api/interrupts',
        method: 'POST',
        body: {
          threadId: 'thread-1',
          runId: 'run-2',
          parentRunId: 'run-1',
          resume: [
            {
              interruptId: 'approval_fc_1',
              status: 'resolved',
              payload: { approved: true },
            },
          ],
        },
      },
      {
        event: 'response',
        url: 'http://localhost/api/interrupts',
        status: 200,
        ok: true,
      },
    ])
    expect(JSON.stringify(entries)).not.toContain('never-log-this-secret')
  })

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

  it('does not mislabel generic or interrupt failures as a missing API key', () => {
    expect(
      shouldShowOpenAiApiKeyGuidance({
        message: 'Interrupt lab run failed.',
      }),
    ).toBe(false)
    expect(
      shouldShowOpenAiApiKeyGuidance({
        code: 'unknown-interrupt',
        message: 'Resume entry references unknown interrupt approval_fc_123.',
      }),
    ).toBe(false)
    expect(
      shouldShowOpenAiApiKeyGuidance({
        message: 'The server returned an unexpected response.',
      }),
    ).toBe(false)
  })

  it('shows API-key guidance only for an explicit missing-key failure', () => {
    expect(
      shouldShowOpenAiApiKeyGuidance({
        message:
          'OPENAI_API_KEY is required for the interrupt lab. Set it and restart the dev server.',
      }),
    ).toBe(true)
    expect(
      shouldShowOpenAiApiKeyGuidance({
        code: 'openai-api-key-required',
        message: 'Server configuration is incomplete.',
      }),
    ).toBe(true)
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
