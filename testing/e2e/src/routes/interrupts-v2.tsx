import { createFileRoute } from '@tanstack/react-router'
import { EventType } from '@tanstack/ai'
import {
  fetchServerSentEvents,
  localStoragePersistence,
} from '@tanstack/ai-client'
import { useChat } from '@tanstack/ai-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { interruptFixtureTools } from '../lib/interrupts-v2-fixture'
import type {
  Interrupt,
  InterruptRecoveryQuery,
  InterruptRecoveryStateV1,
  StreamChunk,
} from '@tanstack/ai'
import type {
  ChatResumeSnapshot,
  ConnectConnectionAdapter,
  RunAgentInputContext,
  SubscribeConnectionAdapter,
} from '@tanstack/ai-client'

interface FixtureStats {
  continuationCount: number
  decisions: Array<string>
  edits: Record<string, unknown>
  auditHistory: Array<string>
  resultEventNames: Array<string>
  storedHistory: Array<string>
}

interface LocalDrafts {
  action: string
  generic: string
  stagedFirst: string
  clientOutput: string
  addToolResultCount: number
}

const emptyStats: FixtureStats = {
  continuationCount: 0,
  decisions: [],
  edits: {},
  auditHistory: [],
  resultEventNames: [],
  storedHistory: [],
}

const emptyDrafts: LocalDrafts = {
  action: '',
  generic: '',
  stagedFirst: '',
  clientOutput: '',
  addToolResultCount: 0,
}

const sharedErrorResponseSchema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
} as const

function sharedErrorInterrupt(
  interruptedRunId: string,
  generation: number,
): Interrupt {
  return {
    id: 'shared-generic',
    reason: 'confirmation',
    message: 'Resolve the shared-stream fixture.',
    responseSchema: sharedErrorResponseSchema,
    metadata: {
      kind: 'generic',
      'tanstack:interruptBinding': {
        kind: 'generic',
        interruptId: 'shared-generic',
        interruptedRunId,
        generation,
        responseSchemaHash: 'fixture:shared-generic',
      },
    },
  }
}

function createSharedErrorFixture() {
  const chunks: Array<StreamChunk> = []
  let wake: (() => void) | undefined
  let activeResume: RunAgentInputContext | undefined

  const publish = (chunk: StreamChunk) => {
    chunks.push(chunk)
    const resolve = wake
    wake = undefined
    resolve?.()
  }

  const connection: SubscribeConnectionAdapter = {
    async *subscribe(abortSignal) {
      while (!abortSignal?.aborted) {
        const chunk = chunks.shift()
        if (chunk) {
          yield chunk
          continue
        }
        await new Promise<void>((resolve) => {
          wake = resolve
          abortSignal?.addEventListener('abort', () => resolve(), {
            once: true,
          })
        })
      }
    },
    send: (_messages, _data, _abortSignal, runContext) => {
      if (!runContext) {
        return Promise.reject(new Error('Missing shared fixture run context.'))
      }
      if (runContext.resume === undefined) {
        publish({
          type: EventType.RUN_STARTED,
          threadId: runContext.threadId,
          runId: runContext.runId,
          timestamp: Date.now(),
        })
        publish({
          type: EventType.RUN_FINISHED,
          threadId: runContext.threadId,
          runId: runContext.runId,
          outcome: {
            type: 'interrupt',
            interrupts: [sharedErrorInterrupt(runContext.runId, 1)],
          },
          timestamp: Date.now(),
        })
      } else {
        activeResume = runContext
      }
      return Promise.resolve()
    },
  }

  return {
    connection,
    publishForeignError() {
      publish({
        type: EventType.RUN_ERROR,
        threadId: 'foreign-thread',
        runId: 'foreign-child-run',
        timestamp: Date.now(),
        message: 'foreign run failed',
        'tanstack:interruptErrors': [
          {
            scope: 'item',
            interruptId: 'shared-generic',
            code: 'invalid-payload',
            message: 'foreign item error',
            source: 'server',
            retryable: false,
            threadId: 'foreign-thread',
            interruptedRunId: 'foreign-parent-run',
            generation: 7,
          },
          {
            scope: 'batch',
            code: 'item-validation-failed',
            message: 'foreign batch error',
            source: 'server',
            retryable: false,
            interruptIds: ['shared-generic'],
            threadId: 'foreign-thread',
            interruptedRunId: 'foreign-parent-run',
            generation: 7,
          },
        ],
      })
    },
    publishLocalError() {
      if (!activeResume?.parentRunId) return
      publish({
        type: EventType.RUN_ERROR,
        threadId: activeResume.threadId,
        runId: activeResume.runId,
        timestamp: Date.now(),
        message: 'local validation failed',
        'tanstack:interruptErrors': [
          {
            scope: 'item',
            interruptId: 'shared-generic',
            code: 'invalid-payload',
            message: 'local item error',
            source: 'server',
            retryable: false,
            threadId: activeResume.threadId,
            interruptedRunId: activeResume.parentRunId,
            generation: 1,
          },
          {
            scope: 'batch',
            code: 'item-validation-failed',
            message: 'local batch error',
            source: 'server',
            retryable: false,
            interruptIds: ['shared-generic'],
            threadId: activeResume.threadId,
            interruptedRunId: activeResume.parentRunId,
            generation: 1,
          },
        ],
      })
    },
  }
}

function createInterruptStateFetcher(
  url: () => string,
  authorization: string,
): NonNullable<ConnectConnectionAdapter['loadInterruptState']> {
  return async (
    query: InterruptRecoveryQuery,
    abortSignal?: AbortSignal,
  ): Promise<InterruptRecoveryStateV1> => {
    const recoveryUrl = new URL(url(), window.location.origin)
    recoveryUrl.searchParams.set('threadId', query.threadId)
    recoveryUrl.searchParams.set('interruptedRunId', query.interruptedRunId)
    recoveryUrl.searchParams.set(
      'knownGeneration',
      String(query.knownGeneration),
    )
    const response = await fetch(recoveryUrl, {
      method: 'POST',
      headers: { 'x-interrupt-fixture': authorization },
      ...(abortSignal === undefined ? {} : { signal: abortSignal }),
    })
    if (!response.ok) {
      throw new Error(`Interrupt recovery failed with ${response.status}.`)
    }
    return response.json()
  }
}

function readDrafts(key: string): LocalDrafts {
  if (typeof window === 'undefined') return emptyDrafts
  const value = window.localStorage.getItem(key)
  if (!value) return emptyDrafts
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return emptyDrafts
    }
    const record = Object.fromEntries(Object.entries(parsed))
    return {
      action: typeof record.action === 'string' ? record.action : '',
      generic: typeof record.generic === 'string' ? record.generic : '',
      stagedFirst:
        typeof record.stagedFirst === 'string' ? record.stagedFirst : '',
      clientOutput:
        typeof record.clientOutput === 'string' ? record.clientOutput : '',
      addToolResultCount:
        typeof record.addToolResultCount === 'number'
          ? record.addToolResultCount
          : 0,
    }
  } catch {
    return emptyDrafts
  }
}

function InterruptsV2Page() {
  const { testId, scenario } = Route.useSearch()
  const draftKey = `interrupts-v2:drafts:${testId}`
  const [drafts, setDrafts] = useState<LocalDrafts>(() => readDrafts(draftKey))
  const [stats, setStats] = useState<FixtureStats>(emptyStats)
  const [callbackReturns, setCallbackReturns] = useState('')
  const [retryVisible, setRetryVisible] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const sharedErrorFixture = useMemo(createSharedErrorFixture, [testId])

  const updateDrafts = useCallback(
    (update: Partial<LocalDrafts>) => {
      setDrafts((current) => {
        const next = { ...current, ...update }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(draftKey, JSON.stringify(next))
        }
        return next
      })
    },
    [draftKey],
  )

  const refreshStats = useCallback(async () => {
    if (typeof window === 'undefined') return
    const response = await fetch(
      new URL(
        `/api/interrupts-v2?testId=${encodeURIComponent(testId)}&stats=1`,
        window.location.origin,
      ),
    )
    if (response.ok) setStats(await response.json())
  }, [testId])

  const connection = useMemo(() => {
    if (scenario === 'shared-error-correlation') {
      return sharedErrorFixture.connection
    }
    const chatUrl = () =>
      `/api/interrupts-v2?testId=${encodeURIComponent(testId)}&scenario=${encodeURIComponent(scenario)}`
    const recoveryUrl = () =>
      `/api/interrupts-v2/recovery?testId=${encodeURIComponent(testId)}`
    return {
      ...fetchServerSentEvents(chatUrl),
      loadInterruptState: createInterruptStateFetcher(recoveryUrl, testId),
    }
  }, [scenario, sharedErrorFixture, testId])

  const resumePersistence = useMemo(
    () =>
      typeof window === 'undefined'
        ? undefined
        : localStoragePersistence<ChatResumeSnapshot>({
            keyPrefix: 'tanstack-ai:interrupts-v2:',
            serialize: (value) => JSON.stringify(value),
            deserialize: (value) => JSON.parse(value),
          }),
    [],
  )

  const {
    sendMessage,
    interrupts,
    interruptErrors,
    error,
    isLoading,
    resuming,
    resolveInterrupts,
    retryInterrupts,
  } = useChat({
    id: `interrupts-v2-${testId}`,
    threadId: `interrupts-v2-${testId}`,
    connection,
    tools: interruptFixtureTools,
    ...(resumePersistence === undefined
      ? {}
      : { persistence: { server: resumePersistence } }),
    onChunk: (chunk) => {
      if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
        void refreshStats()
      }
    },
    onError: () => {
      setRetryVisible(true)
      void refreshStats()
    },
  })

  useEffect(() => {
    void refreshStats()
  }, [isLoading, refreshStats, resuming, interrupts.length])

  useEffect(() => setHydrated(true), [])

  const first =
    interrupts.find((interrupt) => interrupt.interruptId === 'approval-1') ??
    interrupts.find(
      (interrupt) =>
        interrupt.kind === 'tool-approval' &&
        interrupt.toolName === 'editable_action',
    )
  const second = interrupts.find(
    (interrupt) => interrupt.interruptId === 'question-1',
  )
  // `browser_action` is a client tool with a `.client()` implementation, so it
  // executes automatically and never appears in the public `interrupts` array.
  // Its resolution is observed via `submitted-decisions` once the batch resumes.
  const invalidItemIds = interrupts
    .filter((interrupt) => interrupt.error !== undefined)
    .map((interrupt) => interrupt.interruptId)
  const validationAggregate =
    invalidItemIds.length === 0
      ? ''
      : `item-validation-failed:${invalidItemIds.join(',')}`

  const approveFirst = useCallback(() => {
    if (first?.kind !== 'tool-approval') return
    const editedArgs = drafts.action
      ? { editedArgs: { action: drafts.action } }
      : {}
    if (first.toolName === 'editable_action') {
      first.resolveInterrupt(true, { payload: {}, ...editedArgs })
      updateDrafts({
        stagedFirst: JSON.stringify({ approved: true, ...editedArgs }),
      })
    }
  }, [drafts.action, first, updateDrafts])

  const parseGenericDraft = useCallback((): unknown => {
    try {
      return JSON.parse(drafts.generic)
    } catch {
      return drafts.generic
    }
  }, [drafts.generic])

  return (
    <main>
      <h1>Interrupts v2 fixture</h1>
      <button
        data-testid="start-run"
        disabled={!hydrated || isLoading || interrupts.length > 0}
        onClick={() => void sendMessage('start fixture')}
      >
        Start run
      </button>

      <output data-testid="continuation-count">
        {stats.continuationCount}
      </output>
      <output data-testid="submitted-decisions">
        {stats.decisions.join(',')}
      </output>
      <output data-testid="submitted-edits">
        {JSON.stringify(stats.edits)}
      </output>
      <output data-testid="audit-history">
        {stats.auditHistory.join('|')}
      </output>
      <output data-testid="result-event-names">
        {stats.resultEventNames.join(',')}
      </output>
      <output data-testid="stored-history">
        {stats.storedHistory.join('|')}
      </output>
      <output data-testid="callback-return-values">{callbackReturns}</output>
      <output data-testid="staged-response-first">{drafts.stagedFirst}</output>
      <output data-testid="resume-status">
        {resuming ? 'resuming' : 'idle'}
      </output>
      <output data-testid="interrupt-errors-items">
        {interrupts
          .flatMap((interrupt) =>
            interrupt.errors.map(
              (interruptError) =>
                `${interruptError.code}:${interruptError.message}`,
            ),
          )
          .join('|')}
      </output>

      <output data-testid="interrupt-error-first">
        {first?.error ? `${first.error.code}:${first.error.message}` : ''}
      </output>
      <output data-testid="interrupt-error-second">
        {second?.error ? `${second.error.code}:${second.error.message}` : ''}
      </output>
      <output data-testid="interrupt-error-generic">
        {second?.error ? `${second.error.code}:${second.error.message}` : ''}
      </output>
      <output data-testid="interrupt-errors-root">
        {interruptErrors
          .map(
            (submissionError) =>
              `${submissionError.code}:${submissionError.interruptIds.join(',')}:${submissionError.message}`,
          )
          .join('|')}
        {interruptErrors.length > 0 && validationAggregate ? '|' : ''}
        {validationAggregate}
      </output>
      <output data-testid="chat-error">{error?.message ?? ''}</output>

      {retryVisible ? (
        <div data-testid="retry-banner">Retry available</div>
      ) : null}
      <button
        data-testid="retry-interrupts"
        disabled={resuming}
        onClick={() => {
          retryInterrupts()
          void refreshStats()
        }}
      >
        Retry interrupts
      </button>
      {scenario === 'shared-error-correlation' ? (
        <>
          <button
            data-testid="publish-foreign-error"
            onClick={sharedErrorFixture.publishForeignError}
          >
            Publish foreign error
          </button>
          <button
            data-testid="publish-local-error"
            onClick={sharedErrorFixture.publishLocalError}
          >
            Publish local error
          </button>
        </>
      ) : null}

      {interrupts.map((interrupt) => (
        <section data-testid="interrupt-card" key={interrupt.id}>
          <strong>{interrupt.interruptId}</strong>
          <span data-testid={`interrupt-kind-${interrupt.kind}`}>
            {interrupt.kind}
          </span>
          {interrupt.kind === 'tool-approval' ? (
            <>
              {interrupt.toolName === 'editable_action' ? (
                <>
                  <input
                    data-testid="edited-action"
                    value={drafts.action}
                    onChange={(event) =>
                      updateDrafts({ action: event.currentTarget.value })
                    }
                  />
                  <button onClick={approveFirst}>
                    {drafts.action ? 'Approve edited' : 'Approve'}
                  </button>
                  <button
                    onClick={() =>
                      interrupt.resolveInterrupt(false, { payload: {} })
                    }
                  >
                    Deny
                  </button>
                </>
              ) : interrupt.toolName === 'branch_action' ? (
                <>
                  <button
                    onClick={() =>
                      interrupt.resolveInterrupt(true, {
                        payload: { note: 'approved' },
                      })
                    }
                  >
                    Approve
                  </button>
                  <button
                    onClick={() =>
                      interrupt.resolveInterrupt(false, {
                        payload: { reason: 'denied' },
                      })
                    }
                  >
                    Deny
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => interrupt.resolveInterrupt(true)}>
                    Approve
                  </button>
                  <button onClick={() => interrupt.resolveInterrupt(false)}>
                    Deny
                  </button>
                </>
              )}
              <button onClick={() => interrupt.cancel()}>Cancel</button>
            </>
          ) : null}
          {interrupt.kind === 'generic' ? (
            <>
              <textarea
                data-testid="generic-draft"
                value={drafts.generic}
                onChange={(event) =>
                  updateDrafts({ generic: event.currentTarget.value })
                }
              />
              <button
                data-testid="resolve-generic"
                onClick={() => interrupt.resolveInterrupt(parseGenericDraft())}
              >
                Resolve generic
              </button>
            </>
          ) : null}
        </section>
      ))}

      <button data-testid="approve-first" onClick={approveFirst}>
        Resolve first
      </button>
      <button
        data-testid="deny-second"
        onClick={() => {
          const interrupt = interrupts.find(
            (candidate) => candidate.interruptId === 'approval-2',
          )
          if (
            interrupt?.kind === 'tool-approval' &&
            interrupt.toolName === 'branch_action'
          ) {
            interrupt.resolveInterrupt(false, {
              payload: { reason: 'denied' },
            })
          }
        }}
      >
        Deny second
      </button>
      <button
        data-testid="cancel-third"
        onClick={() =>
          interrupts
            .find((interrupt) => interrupt.interruptId === 'approval-3')
            ?.cancel()
        }
      >
        Cancel third
      </button>
      <button
        data-testid="resolve-callback"
        onClick={() => {
          const returns: Array<string> = []
          resolveInterrupts((interrupt) => {
            let result: undefined
            if (
              interrupt.kind === 'tool-approval' &&
              interrupt.toolName === 'editable_action'
            ) {
              interrupt.resolveInterrupt(true, { payload: {} })
            } else if (
              interrupt.kind === 'tool-approval' &&
              interrupt.toolName === 'branch_action'
            ) {
              interrupt.resolveInterrupt(false, {
                payload: { reason: 'callback' },
              })
            } else if (interrupt.kind === 'generic') {
              interrupt.resolveInterrupt({ answer: 'callback' })
            }
            returns.push(String(result))
            return undefined
          })
          setCallbackReturns(returns.join(','))
        }}
      >
        Resolve callback
      </button>

      <button
        data-testid="invalid-first"
        onClick={() => {
          if (
            first?.kind === 'tool-approval' &&
            first.toolName === 'editable_action'
          ) {
            first.resolveInterrupt(true, {
              payload: {},
              editedArgs: { action: '' },
            })
          }
        }}
      >
        Invalid first
      </button>
      <button
        data-testid="invalid-second"
        onClick={() =>
          second?.kind === 'generic' && second.resolveInterrupt({ answer: 1 })
        }
      >
        Invalid second
      </button>
      <button
        data-testid="correct-first"
        onClick={() => {
          if (
            first?.kind === 'tool-approval' &&
            first.toolName === 'editable_action'
          ) {
            first.resolveInterrupt(true, {
              payload: {},
              editedArgs: { action: 'correct' },
            })
          }
        }}
      >
        Correct first
      </button>
      <button
        data-testid="correct-second"
        onClick={() =>
          second?.kind === 'generic' &&
          second.resolveInterrupt({ answer: 'correct' })
        }
      >
        Correct second
      </button>

      <button data-testid="approve-server-tool" onClick={approveFirst}>
        Resolve server tool
      </button>
    </main>
  )
}

export const Route = createFileRoute('/interrupts-v2')({
  validateSearch: (search) => ({
    testId: typeof search.testId === 'string' ? search.testId : 'default',
    scenario:
      typeof search.scenario === 'string'
        ? search.scenario
        : 'singleton-approval',
  }),
  component: InterruptsV2Page,
})
