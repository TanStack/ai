import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import {
  createInterruptStateFetcher,
  localStoragePersistence,
} from '@tanstack/ai-client'
import {
  AlertTriangle,
  Check,
  Database,
  ExternalLink,
  Leaf,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  buildGenericResolution,
  createDurableDraftEnvelope,
  createInterruptLabDebugFetch,
  createIncompleteBulkResolver,
  describeInterruptErrors,
  durableCapabilityStatuses,
  durableDraftStorageKey,
  durableOutcomeStatus,
  interruptLabPageConfig,
  interruptProgressLabel,
  invalidAggregateResolutionArguments,
  isNormalSendDisabled,
  logInterruptLabClientDebug,
  restoreDurableDrafts,
  shouldShowOpenAiApiKeyGuidance,
} from './client-ui'
import {
  approvalBasicTool,
  approvalBranchPayloadTool,
  approvalClientTool,
  approvalEditArgsTool,
  approvalSharedPayloadTool,
  batchSecondTool,
  batchThirdTool,
  clientOutputTool,
  interruptLabScenarios,
} from './scenarios'
import type {
  ChatInterrupt,
  ChatResumeSnapshot,
  UIMessage,
} from '@tanstack/ai-client'
import type { InterruptEditorDraft } from './client-ui'
import type {
  InterruptLabMode,
  InterruptLabScenarioCategory,
  InterruptLabScenarioId,
} from './scenarios'

const clientTools = [
  approvalBasicTool.client(),
  approvalEditArgsTool.client(),
  approvalSharedPayloadTool.client(),
  approvalBranchPayloadTool.client(),
  batchSecondTool.client(),
  batchThirdTool.client(),
  clientOutputTool.client(),
  approvalClientTool.client(),
] as const

type LabInterrupt = ChatInterrupt<typeof clientTools>

type InspectorEvent = { at: string; type: string; detail: string }

const categoryMeta: Record<
  InterruptLabScenarioCategory,
  { habitat: string; accent: string }
> = {
  approval: { habitat: 'Canopy permits', accent: 'text-amber-900' },
  'client-tool': { habitat: 'Field instruments', accent: 'text-sky-900' },
  generic: { habitat: 'Open-range signals', accent: 'text-violet-900' },
  batching: { habitat: 'Migration groups', accent: 'text-emerald-900' },
  validation: { habitat: 'Triage enclosure', accent: 'text-rose-900' },
}

const scenarioCategories = [
  'approval',
  'client-tool',
  'generic',
  'batching',
  'validation',
] as const satisfies ReadonlyArray<InterruptLabScenarioCategory>

const durableResumePersistence = localStoragePersistence<ChatResumeSnapshot>({
  keyPrefix: 'tanstack-ai:interrupt-lab:resume:',
  serialize(value) {
    return JSON.stringify(value)
  },
  deserialize: JSON.parse,
})

function createThreadId(
  mode: InterruptLabMode,
  scenarioId: InterruptLabScenarioId,
): string {
  const { threadPrefix } = interruptLabPageConfig(mode)
  const storageKey = `tanstack-ai:${threadPrefix}:${scenarioId}:thread`
  if (mode === 'durable') {
    const stored = window.localStorage.getItem(storageKey)
    if (stored) return stored
  }
  const suffix = crypto.randomUUID()
  const threadId = `${threadPrefix}:${scenarioId}:${suffix}`
  if (mode === 'durable') window.localStorage.setItem(storageKey, threadId)
  return threadId
}

function emptyDraft(interrupt: LabInterrupt): InterruptEditorDraft {
  const originalArgs =
    interrupt.kind === 'tool-approval'
      ? JSON.stringify(interrupt.originalArgs, null, 2)
      : ''
  const toolName = interrupt.kind === 'generic' ? '' : interrupt.toolName
  return {
    editedArgs: originalArgs,
    includeEditedArgs: false,
    approvePayload:
      toolName === 'interrupt_lab_shared_payload' ||
      toolName === 'interrupt_lab_approval_client'
        ? '{\n  "note": "Reviewed in the field journal"\n}'
        : toolName === 'interrupt_lab_branch_payload'
          ? '{\n  "note": "Approved after habitat review"\n}'
          : '',
    rejectPayload:
      toolName === 'interrupt_lab_shared_payload' ||
      toolName === 'interrupt_lab_approval_client'
        ? '{\n  "note": "Rejected after field review"\n}'
        : toolName === 'interrupt_lab_branch_payload'
          ? '{\n  "reason": "Unsafe conditions"\n}'
          : '',
    output:
      interrupt.kind === 'generic'
        ? '{\n  "answer": "Field response recorded"\n}'
        : '{\n  "browserValue": "sensor-reading-42"\n}',
  }
}

function hasDecisionPayload(interrupt: LabInterrupt): boolean {
  return (
    interrupt.kind === 'tool-approval' &&
    (interrupt.toolName === 'interrupt_lab_shared_payload' ||
      interrupt.toolName === 'interrupt_lab_branch_payload' ||
      interrupt.toolName === 'interrupt_lab_approval_client')
  )
}

function canBooleanBulk(interrupts: ReadonlyArray<LabInterrupt>): boolean {
  return (
    interrupts.length > 0 &&
    interrupts.every(
      (interrupt) =>
        interrupt.kind === 'tool-approval' && !hasDecisionPayload(interrupt),
    )
  )
}

function messageText(message: UIMessage<typeof clientTools>): string {
  return message.parts
    .map((part) => {
      if (part.type === 'text' || part.type === 'thinking') return part.content
      if (part.type === 'tool-call')
        return `[tool · ${part.name} · ${part.state}]`
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

export function InterruptLabPage({
  mode,
  debug = false,
  scenarioId,
  onScenarioChange,
}: {
  mode: InterruptLabMode
  debug?: boolean
  scenarioId: InterruptLabScenarioId
  onScenarioChange: (scenarioId: InterruptLabScenarioId) => void
}) {
  const [thread, setThread] = useState<{
    key: string
    threadId: string
  }>()
  const [caseBusy, setCaseBusy] = useState(false)
  const threadKey = `${mode}:${scenarioId}`

  useEffect(() => {
    setThread({ key: threadKey, threadId: createThreadId(mode, scenarioId) })
  }, [mode, scenarioId, threadKey])

  const threadId = thread?.key === threadKey ? thread.threadId : undefined

  return (
    <main className="min-h-[calc(100vh-72px)] bg-[#e8e0cc] text-[#17251d] [background-image:radial-gradient(circle_at_15%_10%,rgba(255,255,255,.75),transparent_30%),linear-gradient(115deg,rgba(73,95,65,.08)_1px,transparent_1px)] [background-size:auto,28px_28px]">
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        <header className="relative overflow-hidden border border-[#283c2e] bg-[#23412f] px-6 py-7 text-[#f3eddc] shadow-[8px_8px_0_#9c8d65] sm:px-9">
          <div className="absolute -right-10 -top-14 h-52 w-52 rounded-full border-[28px] border-[#8ba56e]/25" />
          <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.28em] text-[#cbd9aa]">
                <Leaf size={15} aria-hidden="true" /> Station 07 · Manual lab
              </p>
              <h1 className="mt-3 max-w-4xl [font-family:Georgia,serif] text-4xl font-bold leading-none sm:text-6xl">
                Wildlife Interrupt Response Center
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-[#e0e5d3] sm:text-base">
                A real-model field journal for approvals, edited tool inputs,
                browser results, generic AG-UI responses, and atomic batches.
              </p>
            </div>
            <div className="border border-[#d8dfbd]/40 bg-[#152c20]/70 p-4 font-mono text-xs">
              <div className="flex items-center gap-2">
                {mode === 'durable' ? (
                  <Database size={17} />
                ) : (
                  <Radio size={17} />
                )}
                <strong className="uppercase tracking-widest">
                  {mode === 'durable' ? 'Durable SQLite' : 'Ephemeral'}
                </strong>
                {debug && (
                  <span className="border border-[#cbd9aa]/60 px-2 py-0.5 text-[10px] uppercase tracking-widest text-[#dce7c1]">
                    Debug on
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-xs text-[#cbd9c2]">
                {mode === 'durable'
                  ? 'Atomic server state + browser resume drafts.'
                  : 'No persistence. Full-history continuation only.'}
              </p>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-7 xl:grid-cols-[340px_minmax(0,1fr)]">
          <ScenarioIndex
            mode={mode}
            selected={scenarioId}
            disabled={caseBusy}
            onSelect={onScenarioChange}
          />
          {threadId ? (
            <InterruptRunner
              key={`${mode}:${scenarioId}:${threadId}`}
              mode={mode}
              debug={debug}
              scenarioId={scenarioId}
              threadId={threadId}
              onBusyChange={setCaseBusy}
            />
          ) : (
            <div className="border border-[#b9ad8f] bg-[#f8f3e5] p-10">
              Preparing a field journal…
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function ScenarioIndex({
  mode,
  selected,
  disabled,
  onSelect,
}: {
  mode: InterruptLabMode
  selected: InterruptLabScenarioId
  disabled: boolean
  onSelect: (id: InterruptLabScenarioId) => void
}) {
  return (
    <aside className="self-start border border-[#867b5e] bg-[#f6efd9] p-4 shadow-[5px_5px_0_#b9ad8f] xl:sticky xl:top-4">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-[#5b674d]">
        Habitat index
      </p>
      <div className="mt-4 space-y-5">
        {scenarioCategories.map((category) => {
          const scenarios = Object.values(interruptLabScenarios).filter(
            (scenario) =>
              scenario.category === category && scenario.modes.includes(mode),
          )
          return (
            <section key={category}>
              <h2
                className={`mb-2 [font-family:Georgia,serif] text-lg font-bold ${categoryMeta[category].accent}`}
              >
                {categoryMeta[category].habitat}
              </h2>
              <div className="space-y-2">
                {scenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(scenario.id)}
                    aria-pressed={selected === scenario.id}
                    className="w-full border border-[#c9bea1] bg-[#fffaf0] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#526a4b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1e5a3a] disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-[#294934] aria-pressed:bg-[#dfe8cc] motion-reduce:transform-none motion-reduce:transition-none"
                  >
                    <span className="block text-sm font-bold">
                      {scenario.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[#5b6257]">
                      {scenario.description}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </aside>
  )
}

function InterruptRunner({
  mode,
  debug,
  scenarioId,
  threadId,
  onBusyChange,
}: {
  mode: InterruptLabMode
  debug: boolean
  scenarioId: InterruptLabScenarioId
  threadId: string
  onBusyChange: (busy: boolean) => void
}) {
  const config = interruptLabPageConfig(mode)
  const scenario = interruptLabScenarios[scenarioId]
  const debugFetch = useMemo(
    () => createInterruptLabDebugFetch({ enabled: debug }),
    [debug],
  )
  const connection = useMemo(
    () =>
      fetchServerSentEvents(config.endpoint, {
        fetchClient: debugFetch,
        ...(mode === 'durable'
          ? {
              interruptStateFetcher: createInterruptStateFetcher(
                config.endpoint,
                { fetchClient: debugFetch },
              ),
            }
          : {}),
      }),
    [config.endpoint, debugFetch, mode],
  )
  const [drafts, setDrafts] = useState<Record<string, InterruptEditorDraft>>({})
  const [note, setNote] = useState('')
  const [events, setEvents] = useState<Array<InspectorEvent>>([])
  const [localNotice, setLocalNotice] = useState<string>()
  const [failNextResume, setFailNextResume] = useState(false)
  const durableDraftKeyRef = useRef<string | undefined>(undefined)

  const chat = useChat({
    id: threadId,
    threadId,
    connection,
    forwardedProps: {
      interruptScenario: scenarioId,
      ...(debug ? { interruptLabDebug: true } : {}),
      ...(mode === 'durable' && failNextResume
        ? { interruptLabFailResumeOnce: true }
        : {}),
    },
    tools: clientTools,
    ...(mode === 'durable'
      ? { persistence: { server: durableResumePersistence } }
      : {}),
    onChunk(chunk) {
      logInterruptLabClientDebug(debug, { event: 'chunk', chunk })
      const detail =
        chunk.type === 'RUN_ERROR'
          ? chunk.message
          : chunk.type === 'RUN_FINISHED'
            ? (chunk.outcome?.type ?? 'finished')
            : 'stream event'
      setEvents((current) =>
        [
          ...current,
          { at: new Date().toLocaleTimeString(), type: chunk.type, detail },
        ].slice(-80),
      )
    },
  })

  const staged = chat.interrupts.filter(
    (interrupt) => interrupt.status === 'staged',
  ).length
  const pending = chat.interrupts.length > 0
  const allItemErrors = chat.interrupts.flatMap((interrupt) => interrupt.errors)
  const visibleErrors = describeInterruptErrors(
    allItemErrors,
    chat.interruptErrors,
  )
  const hasRetryableError = chat.interruptErrors.some(
    (interruptError) => interruptError.retryable,
  )
  const interruptedRunId = chat.resumeState?.runId
  const durabilityOutcome = durableOutcomeStatus(
    allItemErrors,
    chat.interruptErrors,
  )
  const capabilityStatuses = durableCapabilityStatuses(mode, {
    retryable: hasRetryableError,
    hasExpiresAt: chat.interrupts.some(
      (interrupt) => interrupt.expiresAt !== undefined,
    ),
  })

  useEffect(() => {
    logInterruptLabClientDebug(debug, {
      event: 'interrupt-state',
      resumeState: chat.resumeState,
      resuming: chat.resuming,
      interrupts: chat.interrupts.map((interrupt) => ({
        id: interrupt.id,
        kind: interrupt.kind,
        status: interrupt.status,
        canResolve: interrupt.canResolve,
        binding: interrupt.binding,
        errors: interrupt.errors,
      })),
      interruptErrors: chat.interruptErrors,
    })
  }, [
    chat.interruptErrors,
    chat.interrupts,
    chat.resumeState,
    chat.resuming,
    debug,
  ])

  useEffect(() => {
    onBusyChange(pending || chat.isLoading || chat.resuming)
    return () => onBusyChange(false)
  }, [chat.isLoading, chat.resuming, onBusyChange, pending])

  useEffect(() => {
    if (mode !== 'durable') return
    const previousKey = durableDraftKeyRef.current

    if (interruptedRunId === undefined || chat.interrupts.length === 0) {
      if (previousKey !== undefined) window.localStorage.removeItem(previousKey)
      durableDraftKeyRef.current = undefined
      return
    }
    const activeKey = durableDraftStorageKey(threadId, interruptedRunId)
    if (previousKey !== undefined && previousKey !== activeKey) {
      window.localStorage.removeItem(previousKey)
    }
    if (previousKey !== activeKey) {
      durableDraftKeyRef.current = activeKey
      const restored = restoreDurableDrafts({
        mode,
        threadId,
        interruptedRunId,
        activeInterruptIds: chat.interrupts.map((interrupt) => interrupt.id),
        serialized: window.localStorage.getItem(activeKey),
      })
      setDrafts(restored)
      return
    }

    const activeDrafts = Object.fromEntries(
      chat.interrupts.map((interrupt) => [
        interrupt.id,
        drafts[interrupt.id] ?? emptyDraft(interrupt),
      ]),
    )
    const envelope = createDurableDraftEnvelope({
      mode,
      threadId,
      interruptedRunId,
      drafts: activeDrafts,
    })
    if (envelope !== undefined) {
      window.localStorage.setItem(activeKey, JSON.stringify(envelope))
    }
  }, [chat.interrupts, drafts, interruptedRunId, mode, threadId])

  useEffect(() => {
    if (failNextResume && (chat.error !== undefined || hasRetryableError)) {
      setFailNextResume(false)
    }
  }, [chat.error, failNextResume, hasRetryableError])

  function getDraft(interrupt: LabInterrupt): InterruptEditorDraft {
    return drafts[interrupt.id] ?? emptyDraft(interrupt)
  }

  function patchDraft(
    interrupt: LabInterrupt,
    patch: Partial<InterruptEditorDraft>,
  ) {
    setDrafts((current) => ({
      ...current,
      [interrupt.id]: {
        ...(current[interrupt.id] ?? emptyDraft(interrupt)),
        ...patch,
      },
    }))
  }

  function parsedEdit<T>(
    interrupt: LabInterrupt,
    parse: (value: unknown) => T,
  ): T | undefined {
    const draft = getDraft(interrupt)
    return draft.includeEditedArgs
      ? parse(buildGenericResolution(draft.editedArgs))
      : undefined
  }

  function resolveApproval(
    interrupt: Extract<LabInterrupt, { kind: 'tool-approval' }>,
    approved: boolean,
  ) {
    const draft = getDraft(interrupt)
    switch (interrupt.toolName) {
      case 'interrupt_lab_approval_basic': {
        if (!approved) return interrupt.resolveInterrupt(false)
        const editedArgs = parsedEdit(
          interrupt,
          approvalBasicTool.inputSchema.parse,
        )
        return editedArgs
          ? interrupt.resolveInterrupt(true, { editedArgs })
          : interrupt.resolveInterrupt(true)
      }
      case 'interrupt_lab_edit_order': {
        if (!approved) return interrupt.resolveInterrupt(false)
        const editedArgs = parsedEdit(
          interrupt,
          approvalEditArgsTool.inputSchema.parse,
        )
        return editedArgs
          ? interrupt.resolveInterrupt(true, { editedArgs })
          : interrupt.resolveInterrupt(true)
      }
      case 'interrupt_lab_batch_second': {
        if (!approved) return interrupt.resolveInterrupt(false)
        const editedArgs = parsedEdit(
          interrupt,
          batchSecondTool.inputSchema.parse,
        )
        return editedArgs
          ? interrupt.resolveInterrupt(true, { editedArgs })
          : interrupt.resolveInterrupt(true)
      }
      case 'interrupt_lab_batch_third': {
        if (!approved) return interrupt.resolveInterrupt(false)
        const editedArgs = parsedEdit(
          interrupt,
          batchThirdTool.inputSchema.parse,
        )
        return editedArgs
          ? interrupt.resolveInterrupt(true, { editedArgs })
          : interrupt.resolveInterrupt(true)
      }
      case 'interrupt_lab_shared_payload': {
        const source = approved ? draft.approvePayload : draft.rejectPayload
        const payload = approvalSharedPayloadTool.approvalSchema.parse(
          buildGenericResolution(source),
        )
        if (!approved) return interrupt.resolveInterrupt(false, { payload })
        const editedArgs = parsedEdit(
          interrupt,
          approvalSharedPayloadTool.inputSchema.parse,
        )
        return interrupt.resolveInterrupt(true, {
          ...(editedArgs ? { editedArgs } : {}),
          payload,
        })
      }
      case 'interrupt_lab_branch_payload': {
        if (!approved) {
          const payload = approvalBranchPayloadTool.approvalSchema.reject.parse(
            buildGenericResolution(draft.rejectPayload),
          )
          return interrupt.resolveInterrupt(false, { payload })
        }
        const payload = approvalBranchPayloadTool.approvalSchema.approve.parse(
          buildGenericResolution(draft.approvePayload),
        )
        const editedArgs = parsedEdit(
          interrupt,
          approvalBranchPayloadTool.inputSchema.parse,
        )
        return interrupt.resolveInterrupt(true, {
          ...(editedArgs ? { editedArgs } : {}),
          payload,
        })
      }
      case 'interrupt_lab_approval_client': {
        const source = approved ? draft.approvePayload : draft.rejectPayload
        const payload = approvalClientTool.approvalSchema.parse(
          buildGenericResolution(source),
        )
        if (!approved) return interrupt.resolveInterrupt(false, { payload })
        const editedArgs = parsedEdit(
          interrupt,
          approvalClientTool.inputSchema.parse,
        )
        return interrupt.resolveInterrupt(true, {
          ...(editedArgs ? { editedArgs } : {}),
          payload,
        })
      }
    }
  }

  function resolveOne(interrupt: LabInterrupt, approved = true) {
    setLocalNotice(undefined)
    if (interrupt.kind === 'tool-approval') {
      resolveApproval(interrupt, approved)
      return
    }
    const output = buildGenericResolution(getDraft(interrupt).output)
    if (interrupt.kind === 'generic') {
      interrupt.resolveInterrupt(output)
      return
    }
    switch (interrupt.toolName) {
      case 'interrupt_lab_client_output':
        interrupt.resolveInterrupt(clientOutputTool.outputSchema.parse(output))
        return
      case 'interrupt_lab_approval_client':
        interrupt.resolveInterrupt(
          approvalClientTool.outputSchema.parse(output),
        )
        return
    }
  }

  function safely(action: () => void) {
    try {
      action()
    } catch (error) {
      setLocalNotice(error instanceof Error ? error.message : String(error))
    }
  }

  function deliberatelyInvalid(interrupt: LabInterrupt) {
    const invalidPayload = invalidAggregateResolutionArguments(interrupt.kind)
    Reflect.apply(interrupt.resolveInterrupt, undefined, invalidPayload)
  }

  function createAggregateValidationErrors() {
    for (const interrupt of chat.interrupts) deliberatelyInvalid(interrupt)
    chat.resolveInterrupts(createIncompleteBulkResolver())
    setLocalNotice(
      'Deliberate invalid runtime data produced correlated item errors plus an incomplete-batch root error. Clear each resolution, fix the JSON, and resolve again.',
    )
  }

  async function runScenario() {
    setLocalNotice(undefined)
    setEvents([])
    if (chat.messages.length > 0) chat.clear()
    try {
      await chat.sendMessage(config.promptFor(scenarioId))
    } catch (error) {
      setLocalNotice(error instanceof Error ? error.message : String(error))
    }
  }

  async function sendNote(event: React.FormEvent) {
    event.preventDefault()
    if (
      isNormalSendDisabled(
        note,
        chat.isLoading,
        chat.resuming,
        chat.interrupts.length,
      )
    ) {
      return
    }
    const value = note.trim()
    setNote('')
    try {
      await chat.sendMessage(value)
    } catch (error) {
      setLocalNotice(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="space-y-7">
      <section className="border border-[#867b5e] bg-[#fffaf0] p-5 shadow-[5px_5px_0_#c8bc9e] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#657157]">
              Active case · {scenario.category}
            </p>
            <h2 className="mt-2 [font-family:Georgia,serif] text-3xl font-bold">
              {scenario.label}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#596157]">
              {scenario.description}
            </p>
            {scenario.category === 'generic' && (
              <p className="mt-3 inline-block border border-[#71558a] bg-[#eee3f2] px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-[#503963]">
                Controlled external-style AG-UI boundary · appended after the
                real model run
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={chat.isLoading || chat.resuming || pending}
            onClick={() => void runScenario()}
            className="inline-flex items-center gap-2 border border-[#173d28] bg-[#2d5b3c] px-5 py-3 text-sm font-bold text-white shadow-[3px_3px_0_#9b8c66] transition hover:bg-[#244a32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173d28] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none"
          >
            <Radio size={17} /> Run exact scenario prompt
          </button>
        </div>

        <div className="mt-5 border-l-4 border-[#6e7b4e] bg-[#ece8d6] px-4 py-3 font-mono text-xs leading-5 text-[#394338]">
          {scenario.prompt}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-[#596157]">
          <span>endpoint · {config.endpoint}</span>
          <span>thread · {threadId.slice(0, 34)}…</span>
          <span>model · server-configured gpt-5.5</span>
        </div>

        <form
          onSubmit={(event) => void sendNote(event)}
          className="mt-5 flex gap-2"
        >
          <label className="sr-only" htmlFor="interrupt-lab-note">
            Send a normal field note
          </label>
          <input
            id="interrupt-lab-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending || chat.isLoading || chat.resuming}
            placeholder={
              pending
                ? 'Resolve the active interrupts first'
                : 'Optional normal field note'
            }
            className="min-w-0 flex-1 border border-[#a99d7e] bg-white px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2d5b3c] disabled:bg-[#e1dccd]"
          />
          <button
            type="submit"
            disabled={isNormalSendDisabled(
              note,
              chat.isLoading,
              chat.resuming,
              chat.interrupts.length,
            )}
            className="border border-[#2d5b3c] px-4 text-[#23412f] disabled:opacity-40"
            aria-label="Send normal field note"
          >
            <Send size={18} />
          </button>
        </form>

        {chat.error && (
          <div
            role="alert"
            className="mt-4 border border-[#a44a39] bg-[#f7ddd4] p-4 text-sm text-[#6d281d]"
          >
            <strong>Server request failed.</strong> {chat.error.message}
            {shouldShowOpenAiApiKeyGuidance(chat.error) && (
              <span className="mt-1 block">
                This lab requires <code>OPENAI_API_KEY</code> on the server.
              </span>
            )}
          </div>
        )}
        {localNotice && (
          <div
            role="alert"
            className="mt-4 border border-[#a96e2d] bg-[#f5e5c8] p-4 text-sm text-[#684416]"
          >
            <strong>Field lab notice.</strong> {localNotice}
          </div>
        )}
      </section>

      {pending && (
        <section aria-labelledby="interrupt-heading" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#5b674d]">
                Live response queue
              </p>
              <h2
                id="interrupt-heading"
                className="mt-1 [font-family:Georgia,serif] text-3xl font-bold"
              >
                {chat.interrupts.length} active interrupt
                {chat.interrupts.length === 1 ? '' : 's'}
              </h2>
              <p className="mt-1 text-sm text-[#596157]">
                {interruptProgressLabel(
                  chat.interrupts.length,
                  staged,
                  chat.resuming,
                )}
              </p>
            </div>
            <span className="border border-[#69765a] bg-[#edf0df] px-3 py-2 font-mono text-xs uppercase tracking-wider">
              {chat.resuming ? 'Submitting' : 'Awaiting decisions'}
            </span>
          </div>

          <RootControls
            interrupts={chat.interrupts}
            canBooleanBulk={canBooleanBulk(chat.interrupts)}
            disabled={chat.resuming}
            retryable={hasRetryableError}
            onApproveAll={() => chat.resolveInterrupts(true)}
            onRejectAll={() => chat.resolveInterrupts(false)}
            onCancelAll={chat.cancelInterrupts}
            onValidCallback={() =>
              chat.resolveInterrupts((interrupt) => {
                resolveOne(interrupt, true)
                return undefined
              })
            }
            onInvalidPayload={createAggregateValidationErrors}
            onInvalidReturn={() =>
              Reflect.apply(chat.resolveInterrupts, undefined, [
                () => 'invalid',
              ])
            }
            onThrow={() =>
              chat.resolveInterrupts(() => {
                throw new Error('Deliberate field callback failure.')
              })
            }
            onIncomplete={() =>
              chat.resolveInterrupts(createIncompleteBulkResolver())
            }
            onRetry={chat.retryInterrupts}
          />

          <div className="grid gap-4 2xl:grid-cols-2">
            {chat.interrupts.map((interrupt, index) => (
              <InterruptCard
                key={interrupt.id}
                interrupt={interrupt}
                index={index}
                draft={getDraft(interrupt)}
                disabled={chat.resuming}
                onDraft={(patch) => patchDraft(interrupt, patch)}
                onApprove={() => safely(() => resolveOne(interrupt, true))}
                onReject={() => safely(() => resolveOne(interrupt, false))}
                onResolve={() => safely(() => resolveOne(interrupt))}
                onInvalidEdit={() => {
                  patchDraft(interrupt, {
                    editedArgs: '{\n  "destination": "",\n  "quantity": 0\n}',
                    includeEditedArgs: true,
                  })
                  Reflect.apply(interrupt.resolveInterrupt, undefined, [
                    true,
                    { editedArgs: { destination: '', quantity: 0 } },
                  ])
                }}
              />
            ))}
          </div>
        </section>
      )}

      {mode === 'durable' && (
        <DurabilityPanel
          resumeState={chat.resumeState}
          interrupts={chat.interrupts}
          retryable={hasRetryableError}
          onRetry={chat.retryInterrupts}
          outcome={durabilityOutcome}
          capabilities={capabilityStatuses}
          failNextResume={failNextResume}
          onFailNextResume={setFailNextResume}
        />
      )}

      <Inspector
        messages={chat.messages}
        events={events}
        errors={visibleErrors}
        isLoading={chat.isLoading}
      />
    </div>
  )
}

function RootControls({
  canBooleanBulk: showBooleanBulk,
  disabled,
  retryable,
  onApproveAll,
  onRejectAll,
  onCancelAll,
  onValidCallback,
  onInvalidPayload,
  onInvalidReturn,
  onThrow,
  onIncomplete,
  onRetry,
}: {
  interrupts: ReadonlyArray<LabInterrupt>
  canBooleanBulk: boolean
  disabled: boolean
  retryable: boolean
  onApproveAll: () => void
  onRejectAll: () => void
  onCancelAll: () => void
  onValidCallback: () => void
  onInvalidPayload: () => void
  onInvalidReturn: () => void
  onThrow: () => void
  onIncomplete: () => void
  onRetry: () => void
}) {
  const buttonClass =
    'border border-[#6f745f] bg-[#f8f3e5] px-3 py-2 text-xs font-bold transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d5b3c] disabled:opacity-40'
  return (
    <div className="border border-[#8f866d] bg-[#dcd6c4] p-3">
      <div className="flex flex-wrap gap-2">
        {showBooleanBulk && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={onApproveAll}
              className={buttonClass}
            >
              Approve all
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onRejectAll}
              className={buttonClass}
            >
              Reject all
            </button>
          </>
        )}
        <button
          type="button"
          disabled={disabled}
          onClick={onCancelAll}
          className={buttonClass}
        >
          Cancel all
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onValidCallback}
          className={buttonClass}
        >
          Resolve via callback
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onInvalidPayload}
          className={buttonClass}
        >
          Create item + batch validation errors
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onInvalidReturn}
          className={buttonClass}
        >
          Invalid return rollback
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onThrow}
          className={buttonClass}
        >
          Thrown callback rollback
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onIncomplete}
          className={buttonClass}
        >
          Incomplete callback rollback
        </button>
        <button
          type="button"
          disabled={disabled || !retryable}
          onClick={onRetry}
          className={buttonClass}
        >
          Retry submission
        </button>
      </div>
    </div>
  )
}

function InterruptCard({
  interrupt,
  index,
  draft,
  disabled,
  onDraft,
  onApprove,
  onReject,
  onResolve,
  onInvalidEdit,
}: {
  interrupt: LabInterrupt
  index: number
  draft: InterruptEditorDraft
  disabled: boolean
  onDraft: (patch: Partial<InterruptEditorDraft>) => void
  onApprove: () => void
  onReject: () => void
  onResolve: () => void
  onInvalidEdit: () => void
}) {
  const showPayload = hasDecisionPayload(interrupt)
  const textareaClass =
    'mt-1 min-h-24 w-full border border-[#aaa083] bg-[#fffdf7] p-3 font-mono text-xs leading-5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#2d5b3c] disabled:bg-[#e4dfd1]'
  return (
    <article className="border border-[#5e6e55] bg-[#f8f2df] p-5 shadow-[4px_4px_0_#a9a185]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6c745f]">
            Case {String(index + 1).padStart(2, '0')} · {interrupt.kind}
          </p>
          <h3 className="mt-2 [font-family:Georgia,serif] text-xl font-bold">
            {interrupt.kind === 'generic'
              ? interrupt.reason
              : interrupt.toolName}
          </h3>
          <p className="mt-1 text-sm text-[#596157]">{interrupt.message}</p>
        </div>
        <span className="border border-[#7c846c] px-2 py-1 font-mono text-[10px] uppercase">
          {interrupt.status}
        </span>
      </div>

      <details className="mt-4 border-y border-[#c9bea1] py-2 text-xs">
        <summary className="cursor-pointer font-bold">
          Binding & response schema
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono leading-5">
          {JSON.stringify(
            {
              binding: interrupt.binding,
              responseSchema: interrupt.responseSchema,
            },
            null,
            2,
          )}
        </pre>
      </details>

      {interrupt.kind === 'tool-approval' ? (
        <>
          <label className="mt-4 flex items-center gap-2 text-xs font-bold">
            <input
              type="checkbox"
              checked={draft.includeEditedArgs}
              disabled={disabled}
              onChange={(event) =>
                onDraft({ includeEditedArgs: event.target.checked })
              }
            />
            Submit optional full-replacement editedArgs
          </label>
          <label className="mt-3 block text-xs font-bold">
            Edited arguments · JSON
            <textarea
              aria-label={`Edited arguments for ${interrupt.id}`}
              disabled={disabled || !draft.includeEditedArgs}
              value={draft.editedArgs}
              onChange={(event) => onDraft({ editedArgs: event.target.value })}
              className={textareaClass}
            />
          </label>
          {showPayload && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold">
                Approve payload · JSON
                <textarea
                  aria-label={`Approve payload for ${interrupt.id}`}
                  disabled={disabled}
                  value={draft.approvePayload}
                  onChange={(event) =>
                    onDraft({ approvePayload: event.target.value })
                  }
                  className={textareaClass}
                />
              </label>
              <label className="block text-xs font-bold">
                Reject payload · JSON
                <textarea
                  aria-label={`Reject payload for ${interrupt.id}`}
                  disabled={disabled}
                  value={draft.rejectPayload}
                  onChange={(event) =>
                    onDraft({ rejectPayload: event.target.value })
                  }
                  className={textareaClass}
                />
              </label>
            </div>
          )}
        </>
      ) : (
        <label className="mt-4 block text-xs font-bold">
          {interrupt.kind === 'generic'
            ? 'Generic response payload'
            : 'Typed client tool output'}{' '}
          · JSON
          <textarea
            aria-label={`Response for ${interrupt.id}`}
            disabled={disabled}
            value={draft.output}
            onChange={(event) => onDraft({ output: event.target.value })}
            className={textareaClass}
          />
        </label>
      )}

      {interrupt.errors.length > 0 && (
        <ul
          role="alert"
          className="mt-4 space-y-1 border border-[#b9503d] bg-[#f6dcd2] p-3 text-xs text-[#722c20]"
        >
          {interrupt.errors.map((error, errorIndex) => (
            <li key={`${error.code}:${errorIndex}`}>
              {error.code} · {error.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {interrupt.kind === 'tool-approval' ? (
          <>
            <ActionButton
              disabled={disabled || !interrupt.canResolve}
              onClick={onApprove}
              tone="approve"
            >
              <Check size={15} /> Approve
            </ActionButton>
            <ActionButton
              disabled={disabled || !interrupt.canResolve}
              onClick={onReject}
              tone="reject"
            >
              <X size={15} /> Reject
            </ActionButton>
            {interrupt.toolName === 'interrupt_lab_edit_order' && (
              <ActionButton disabled={disabled} onClick={onInvalidEdit}>
                Invalid edit
              </ActionButton>
            )}
          </>
        ) : (
          <ActionButton
            disabled={disabled || !interrupt.canResolve}
            onClick={onResolve}
            tone="approve"
          >
            <Check size={15} /> Resolve{' '}
            {interrupt.kind === 'generic'
              ? 'generic response'
              : 'client output'}
          </ActionButton>
        )}
        <ActionButton
          disabled={disabled}
          onClick={interrupt.cancel}
          tone="reject"
        >
          Cancel{interrupt.kind === 'generic' ? ' generic interrupt' : ''}
        </ActionButton>
        <ActionButton
          disabled={disabled || interrupt.status === 'pending'}
          onClick={interrupt.clearResolution}
        >
          <RotateCcw size={14} />{' '}
          {interrupt.kind === 'generic'
            ? 'Clear generic response'
            : 'Clear resolution'}
        </ActionButton>
      </div>
    </article>
  )
}

function ActionButton({
  children,
  tone,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'approve' | 'reject'
}) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center gap-1.5 border px-3 py-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40 ${tone === 'approve' ? 'border-[#2d5b3c] bg-[#dce8d2] text-[#173d28]' : tone === 'reject' ? 'border-[#8e493b] bg-[#f1d8cf] text-[#712f24]' : 'border-[#77715f] bg-[#eee8d8]'}`}
    >
      {children}
    </button>
  )
}

function DurabilityPanel({
  resumeState,
  interrupts,
  retryable,
  onRetry,
  outcome,
  capabilities,
  failNextResume,
  onFailNextResume,
}: {
  resumeState: { threadId: string; runId: string } | null
  interrupts: ReadonlyArray<LabInterrupt>
  retryable: boolean
  onRetry: () => void
  outcome: ReturnType<typeof durableOutcomeStatus>
  capabilities: ReturnType<typeof durableCapabilityStatuses>
  failNextResume: boolean
  onFailNextResume: (enabled: boolean) => void
}) {
  const expiresAt = interrupts
    .map((interrupt) => interrupt.expiresAt)
    .find(Boolean)
  return (
    <section className="border border-[#315446] bg-[#dce8dc] p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} />
        <h2 className="[font-family:Georgia,serif] text-2xl font-bold">
          Durability station
        </h2>
      </div>
      <p className="mt-2 text-sm text-[#43564b]">
        SQLite owns atomic batches. Browser storage owns the public resume
        snapshot and staged drafts.
      </p>
      <div
        className={`mt-4 border p-3 ${outcome.kind === 'conflict' || outcome.kind === 'stale' || outcome.kind === 'expired' ? 'border-[#9c4b3d] bg-[#f2d9d0]' : outcome.kind === 'retryable' ? 'border-[#a36c24] bg-[#f4e5c8]' : 'border-[#55745e] bg-[#edf3e5]'}`}
      >
        <strong className="font-mono text-xs uppercase tracking-wider">
          {outcome.label}
        </strong>
        <p className="mt-1 text-xs leading-5">{outcome.detail}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {capabilities.map((capability) => (
          <Capability
            key={capability.id}
            label={capability.id.replaceAll('-', ' ')}
            value={capability.detail}
            availability={capability.availability}
          />
        ))}
      </div>
      {resumeState && (
        <p className="mt-3 font-mono text-xs">
          Saved draft namespace · run {resumeState.runId.slice(0, 16)}…
        </p>
      )}
      {expiresAt && (
        <p className="mt-2 font-mono text-xs">
          Advertised expiresAt · {expiresAt}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 border border-[#315446] bg-white px-3 py-2 text-xs font-bold"
        >
          <RefreshCw size={14} /> Reload & recover draft
        </button>
        <button
          type="button"
          onClick={() =>
            window.open(window.location.href, '_blank', 'noopener')
          }
          className="inline-flex items-center gap-2 border border-[#315446] bg-white px-3 py-2 text-xs font-bold"
        >
          <ExternalLink size={14} /> Open second tab
        </button>
        <button
          type="button"
          disabled={!retryable}
          onClick={onRetry}
          className="border border-[#315446] bg-white px-3 py-2 text-xs font-bold disabled:opacity-40"
        >
          Replay failed submission with retryInterrupts()
        </button>
        <label className="flex items-center gap-2 border border-[#315446] bg-[#f5ead0] px-3 py-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={failNextResume}
            disabled={retryable}
            onChange={(event) => onFailNextResume(event.target.checked)}
          />
          Arm one safe 503 on the next resume
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#4e5c53]">
        Retry replays the captured failed submission. It does not join or replay
        a committed continuation run.
      </p>
    </section>
  )
}

function Capability({
  label,
  value,
  availability,
}: {
  label: string
  value: string
  availability?: 'available' | 'unavailable' | 'observable-only'
}) {
  return (
    <div className="border border-[#779081] bg-[#f5f8ee] p-3">
      <div className="flex items-start justify-between gap-2">
        <strong className="block font-mono text-[11px] uppercase tracking-wider">
          {label}
        </strong>
        {availability && (
          <span className="border border-[#98a790] px-1.5 py-0.5 font-mono text-[9px] uppercase">
            {availability}
          </span>
        )}
      </div>
      <span className="mt-1 block text-xs leading-5 text-[#4e5c53]">
        {value}
      </span>
    </div>
  )
}

function Inspector({
  messages,
  events,
  errors,
  isLoading,
}: {
  messages: Array<UIMessage<typeof clientTools>>
  events: Array<InspectorEvent>
  errors: Array<string>
  isLoading: boolean
}) {
  return (
    <section className="border border-[#283c2e] bg-[#17251d] p-5 text-[#e8eedf]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="[font-family:Georgia,serif] text-2xl font-bold">
          Live event & result inspector
        </h2>
        <span className="flex items-center gap-2 font-mono text-xs">
          <span
            className={`h-2.5 w-2.5 rounded-full motion-reduce:animate-none ${isLoading ? 'animate-pulse bg-[#d7d570]' : 'bg-[#7ca173]'}`}
          />
          {isLoading ? 'streaming' : 'quiet'}
        </span>
      </div>
      {errors.length > 0 && (
        <div
          role="alert"
          className="mt-4 border border-[#d87761] bg-[#4b251f] p-3"
        >
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle size={17} /> Correlated errors
          </p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {errors.map((error, index) => (
              <li key={`${error}:${index}`}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="font-mono text-xs uppercase tracking-widest text-[#aabf9f]">
            Messages & results
          </h3>
          <div className="mt-2 max-h-80 space-y-2 overflow-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-[#94a18f]">No observations yet.</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className="border border-[#3e5545] bg-[#213329] p-3"
                >
                  <strong className="font-mono text-[11px] uppercase text-[#b7cdaa]">
                    {message.role}
                  </strong>
                  <pre className="mt-1 whitespace-pre-wrap text-xs leading-5">
                    {messageText(message)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <h3 className="font-mono text-xs uppercase tracking-widest text-[#aabf9f]">
            AG-UI event trail
          </h3>
          <div className="mt-2 max-h-80 overflow-auto border border-[#3e5545]">
            {events.length === 0 ? (
              <p className="p-3 text-sm text-[#94a18f]">
                Run a case to begin the trail.
              </p>
            ) : (
              events.map((event, index) => (
                <div
                  key={`${event.at}:${event.type}:${index}`}
                  className="grid grid-cols-[70px_1fr] gap-2 border-b border-[#33483a] p-2 font-mono text-[11px]"
                >
                  <span className="text-[#91a58b]">{event.at}</span>
                  <span>
                    <b>{event.type}</b> · {event.detail}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
