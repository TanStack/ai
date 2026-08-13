import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { INTERRUPT_TOOL_RESUMES } from '@tanstack/ai'
import {
  fetchServerSentEvents,
  useChat,
  type GenericInterrupt,
  type UseChatReturn,
} from '@tanstack/ai-react'
import { Check, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import {
  AUDIENCE_OPTIONS,
  chooseAudience,
  inspectPlan,
  playgroundInterrupts,
  playgroundScenarios,
  reviewPlan,
} from '@/lib/generic-interrupt-playground'
import type { InterruptToolResume } from '@tanstack/ai'
import type { PlaygroundScenario } from '@/lib/generic-interrupt-playground'

export const Route = createFileRoute('/generic-interrupts')({
  component: GenericInterruptPlayground,
})

const clientTools = [inspectPlan.client()] as const
const connection = fetchServerSentEvents('/api/generic-interrupts')

type PlaygroundChat = UseChatReturn<
  typeof clientTools,
  undefined,
  typeof playgroundInterrupts
>

const POLICY_HELP: Record<InterruptToolResume, string> = {
  continue: 'The run continues after you resolve the review.',
  cancel: 'Pending tools are cancelled. Then the run continues.',
  stop: 'The run ends after you resolve the review.',
}

function GenericInterruptPlayground() {
  const [threadId, setThreadId] = useState(() => crypto.randomUUID())
  const [active, setActive] = useState<PlaygroundScenario | null>(null)
  const [policy, setPolicy] = useState<InterruptToolResume>('continue')
  const [pending, setPending] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Array<string>>([])
  const record = (message: string) =>
    setDecisions((prev) => [message, ...prev].slice(0, 8))

  const chat = useChat({
    threadId,
    connection,
    tools: clientTools,
    interrupts: playgroundInterrupts,
    forwardedProps: {
      boundary: active?.boundary ?? 'beforeModel',
      policy,
    },
  })

  useEffect(() => {
    if (pending === null) return
    void chat.sendMessage(pending)
    setPending(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  const runScenario = (scenario: PlaygroundScenario) => {
    setDecisions([])
    setActive(scenario)
    setThreadId(crypto.randomUUID())
    setPending(scenario.message)
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white">
      <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <header className="overflow-hidden rounded-2xl border border-gray-700 bg-gray-800 p-5">
            <p className="text-xs uppercase tracking-wider text-cyan-400">
              First-party generic interrupts
            </p>
            <h1 className="text-3xl font-bold leading-tight">
              Lifecycle playground
            </h1>
            <p className="mt-2 text-sm text-gray-400">
              Pick a boundary. The run pauses with two typed cards: review the
              plan, then pick an audience. Resolve both, then the selected
              policy runs.
            </p>
          </header>

          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500">
              <Sparkles size={14} /> Resume policy
            </h2>
            <div
              className="flex overflow-hidden rounded-lg border border-gray-700"
              role="radiogroup"
              aria-label="Resume policy"
            >
              {INTERRUPT_TOOL_RESUMES.map((nextPolicy) => (
                <button
                  key={nextPolicy}
                  type="button"
                  role="radio"
                  aria-checked={policy === nextPolicy}
                  onClick={() => setPolicy(nextPolicy)}
                  className={`flex-1 px-3 py-1 text-sm transition-colors ${policy === nextPolicy
                    ? 'bg-cyan-600 text-white'
                    : 'bg-transparent text-gray-400 hover:text-gray-200'
                    }`}
                >
                  {nextPolicy}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500">{POLICY_HELP[policy]}</p>
            <p className="text-xs text-gray-500">
              If you reject the review, the run stops even when the policy is
              continue.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-wider text-gray-500">
              Boundaries
            </h2>
            <div className="space-y-2">
              {playgroundScenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => runScenario(scenario)}
                  disabled={chat.isLoading || chat.resuming}
                  aria-pressed={active?.id === scenario.id}
                  className={`w-full rounded-lg border p-3 text-left transition-colors enabled:hover:border-cyan-500/50 enabled:hover:bg-gray-800/60 disabled:opacity-50 ${active?.id === scenario.id
                    ? 'border-cyan-500/60 bg-gray-800'
                    : 'border-gray-700 bg-gray-800'
                    }`}
                >
                  <div className="font-semibold">{scenario.title}</div>
                  <div className="text-xs text-gray-400">{scenario.blurb}</div>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <section className="space-y-4">
          <div className="rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-gray-400">
            {chat.isLoading || chat.resuming
              ? `Running ${active?.boundary ?? 'scenario'} with policy ${policy}...`
              : active
                ? `Active boundary: ${active.boundary}. Policy: ${policy}.`
                : 'Pick a boundary on the left to start.'}
          </div>

          <Transcript chat={chat} />

          {chat.interruptErrors.length > 0 ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {chat.interruptErrors.map((error) => (
                <div key={error.code}>{error.message}</div>
              ))}
              <button
                type="button"
                onClick={() => chat.retryInterrupts()}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-white transition-colors hover:bg-red-700"
              >
                <RotateCcw size={13} /> Retry
              </button>
            </div>
          ) : null}

          {chat.interrupts.filter(isReviewPlan).map((interrupt) => (
            <ReviewCard
              key={interrupt.id}
              interrupt={interrupt}
              disabled={chat.resuming}
              record={record}
            />
          ))}

          {chat.interrupts.filter(isChooseAudience).map((interrupt) => (
            <AudienceCard
              key={interrupt.id}
              interrupt={interrupt}
              disabled={chat.resuming}
              record={record}
            />
          ))}

          {decisions.length > 0 ? (
            <div className="rounded-lg border border-gray-700 bg-gray-800/60 p-3">
              <h2 className="mb-1 text-xs uppercase tracking-wider text-gray-500">
                Your decisions
              </h2>
              <ul className="space-y-1 font-mono text-[11px] text-gray-400">
                {decisions.map((decision, index) => (
                  <li key={index}>{decision}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function isReviewPlan(
  interrupt: PlaygroundChat['interrupts'][number],
): interrupt is GenericInterrupt<typeof reviewPlan> {
  return (
    interrupt.kind === 'generic' &&
    'definitionId' in interrupt &&
    interrupt.definitionId === reviewPlan.id
  )
}

function isChooseAudience(
  interrupt: PlaygroundChat['interrupts'][number],
): interrupt is GenericInterrupt<typeof chooseAudience> {
  return (
    interrupt.kind === 'generic' &&
    'definitionId' in interrupt &&
    interrupt.definitionId === chooseAudience.id
  )
}

function Transcript({ chat }: { chat: PlaygroundChat }) {
  if (chat.messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-700 p-6 text-center text-sm text-gray-500">
        Pick a boundary on the left to start.
      </div>
    )
  }
  return (
    <div className="space-y-2 rounded-lg border border-gray-700 bg-gray-800/60 p-4">
      {chat.messages.map((message) => (
        <div key={message.id} className="text-sm">
          <span className="font-mono text-xs uppercase text-gray-500">
            {message.role}:{' '}
          </span>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return <span key={index}>{part.content}</span>
            }
            if (part.type === 'tool-call') {
              return (
                <div
                  key={index}
                  className="mt-1 rounded-md bg-gray-800 px-2 py-1 font-mono text-[11px] text-gray-300"
                >
                  {part.name}({JSON.stringify(part.input ?? part.arguments)})
                  {part.output !== undefined
                    ? ` → ${JSON.stringify(part.output)}`
                    : ` · ${part.state}`}
                </div>
              )
            }
            if (part.type === 'tool-result') {
              const body =
                typeof part.content === 'string'
                  ? part.content
                  : JSON.stringify(part.content)
              return (
                <div
                  key={index}
                  className="mt-1 rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-[11px] text-emerald-300"
                >
                  {part.error ?? body}
                </div>
              )
            }
            return null
          })}
        </div>
      ))}
    </div>
  )
}

function ReviewCard({
  interrupt,
  disabled,
  record,
}: {
  interrupt: GenericInterrupt<typeof reviewPlan>
  disabled: boolean
  record: (message: string) => void
}) {
  const [note, setNote] = useState('Looks good')
  const payload = interrupt.payload
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  return (
    <article
      ref={cardRef}
      className="space-y-3 rounded-2xl border border-cyan-500/30 bg-gray-800 p-4"
    >
      <div>
        <p className="text-xs uppercase tracking-wider text-cyan-400">
          {payload?.boundary ?? interrupt.reason}
        </p>
        <h3 className="text-lg font-semibold leading-tight">
          {payload?.title ?? 'Review plan'}
        </h3>
        <p className="text-sm text-gray-400">
          {interrupt.message ?? 'Review this step, then continue.'}
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          Note (required)
        </span>
        <input
          className="w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-white placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none"
          placeholder="Looks good"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            record(`approved · ${note}`)
            interrupt.resolveInterrupt({ approved: true, note })
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1 text-sm text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          <Check size={14} /> Approve
        </button>
        <button
          type="button"
          onClick={() => {
            record(`rejected · ${note}`)
            interrupt.resolveInterrupt({ approved: false, note })
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => {
            record('cancelled')
            interrupt.cancel()
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
        >
          <Trash2 size={14} /> Cancel
        </button>
      </div>
      {interrupt.errors.map((error) => (
        <p
          key={`${error.code}:${error.path?.join('.') ?? ''}`}
          className="text-xs text-red-400"
        >
          {error.message}
        </p>
      ))}
    </article>
  )
}

function AudienceCard({
  interrupt,
  disabled,
  record,
}: {
  interrupt: GenericInterrupt<typeof chooseAudience>
  disabled: boolean
  record: (message: string) => void
}) {
  const payload = interrupt.payload
  const options = payload?.options ?? AUDIENCE_OPTIONS
  const cardRef = useRef<HTMLElement>(null)

  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])

  return (
    <article
      ref={cardRef}
      className="space-y-3 rounded-2xl border border-amber-500/30 bg-gray-800 p-4"
    >
      <div>
        <p className="text-xs uppercase tracking-wider text-amber-400">
          choose-audience
        </p>
        <h3 className="text-lg font-semibold leading-tight">
          {payload?.question ?? 'Pick an audience'}
        </h3>
        <p className="text-sm text-gray-400">
          {interrupt.message ?? 'This card uses a different response type.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((audience) => (
          <button
            key={audience}
            type="button"
            onClick={() => {
              record(`audience · ${audience}`)
              interrupt.resolveInterrupt({ audience })
            }}
            disabled={disabled}
            className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1 text-sm text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {audience}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            record('audience cancelled')
            interrupt.cancel()
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
        >
          <Trash2 size={14} /> Cancel
        </button>
      </div>
      {interrupt.errors.map((error) => (
        <p
          key={`${error.code}:${error.path?.join('.') ?? ''}`}
          className="text-xs text-red-400"
        >
          {error.message}
        </p>
      ))}
    </article>
  )
}
