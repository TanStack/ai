import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import {
  Check,
  Leaf,
  PawPrint,
  RadioTower,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  admitRescue,
  assignEnclosure,
  finalizeAdoption,
  logFieldSighting,
  printCertificate,
  printIntakeTag,
  scenarios,
  scheduleVetCheck,
  shareAdoptionStory,
} from '@/lib/interrupt-tools'
import type { Scenario, ScenarioGroup } from '@/lib/interrupt-tools'
import type { ChatInterrupt } from '@tanstack/ai-client'

export const Route = createFileRoute('/interrupts')({
  component: SanctuaryPage,
})

// Client tools: server tools get an argless `.client()` so the browser knows
// their schemas to render approvals; the four client tools get a real browser
// implementation that runs after approval.
const clientTools = [
  admitRescue.client(),
  scheduleVetCheck.client(),
  finalizeAdoption.client(),
  assignEnclosure.client(),
  printIntakeTag.client(async ({ animal }) => ({ tag: `TAG-${animal}` })),
  logFieldSighting.client(async ({ species, location }) => ({
    sightingId: `${species}-${location}`.toLowerCase().replace(/\s+/g, '-'),
  })),
  shareAdoptionStory.client(async ({ animal }) => ({
    url: `https://willowbrook.example/stories/${animal.toLowerCase()}`,
  })),
  printCertificate.client(async ({ animal, adopter }) => ({
    certificate: `${adopter} adopted ${animal}`,
  })),
] as const

type Interrupt = ChatInterrupt<typeof clientTools>
type ResolveMode = 'each' | 'all'

const connection = fetchServerSentEvents('/api/interrupts')

const groupMeta: Record<ScenarioGroup, { label: string; icon: typeof Leaf }> = {
  server: { label: 'Server actions', icon: Leaf },
  client: { label: 'On this device', icon: RadioTower },
  generic: { label: 'Ask the keeper', icon: Sparkles },
  batch: { label: 'Whole intake', icon: PawPrint },
}

function SanctuaryPage() {
  const [threadId] = useState(() => crypto.randomUUID())
  const [active, setActive] = useState<Scenario | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [resolveMode, setResolveMode] = useState<ResolveMode>('each')
  // What you submitted for each decision, so payloads/edits are visible even
  // when the tool never receives them (an approve payload is decision metadata,
  // not tool input).
  const [decisions, setDecisions] = useState<Array<string>>([])
  const record = (message: string) =>
    setDecisions((prev) => [message, ...prev].slice(0, 8))

  const chat = useChat({
    id: threadId,
    threadId,
    connection,
    tools: clientTools,
    forwardedProps: {
      ...(active?.forceTool ? { forceTool: active.forceTool } : {}),
      ...(active?.generic ? { generic: true } : {}),
    },
  })

  // Send after the forwardedProps effect has pushed the active scenario to the
  // client, so each button carries its own forceTool / generic flag.
  useEffect(() => {
    if (pending === null) return
    void chat.sendMessage(pending)
    setPending(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  const runScenario = (scenario: Scenario) => {
    if (chat.messages.length > 0) chat.clear()
    setActive(scenario)
    setPending(scenario.message)
  }

  const interrupts = chat.interrupts
  const grouped = (['server', 'client', 'generic', 'batch'] as const).map(
    (group) => ({
      group,
      items: scenarios.filter((scenario) => scenario.group === group),
    }),
  )

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f3ead0] via-[#efe7d2] to-[#e7ddbf] text-[#1c2a20]">
      <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <header className="overflow-hidden rounded-2xl border border-[#d8cba2] bg-gradient-to-br from-[#2d5b3c] to-[#3f7a4f] p-5 text-[#f4ecd4] shadow-[0_10px_30px_-12px_rgba(45,91,60,0.7)]">
            <div className="mb-2 text-3xl" aria-hidden>
              🦊 🦉 🦔
            </div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-[#cfe6cf]">
              Willowbrook Wildlife Sanctuary
            </p>
            <h1 className="font-serif text-3xl leading-tight">
              Intake &amp; Adoption Desk
            </h1>
            <p className="mt-2 text-sm text-[#dcebdc]">
              Pick an action below. Each one gently pauses for your sign-off,
              then carries on where it left off.
            </p>
          </header>

          {grouped.map(({ group, items }) => {
            const Icon = groupMeta[group].icon
            return (
              <section key={group} className="space-y-2">
                <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[#6f6338]">
                  <Icon size={14} /> {groupMeta[group].label}
                </h2>
                <div className="space-y-2">
                  {items.map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => runScenario(scenario)}
                      disabled={chat.isLoading || chat.resuming}
                      className="w-full rounded-xl border border-[#c9bd97] bg-[#f7f1de] p-3 text-left shadow-[3px_3px_0_#cabd94] transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-[4px_5px_0_#b6a874] disabled:opacity-50"
                    >
                      <div className="font-semibold">{scenario.title}</div>
                      <div className="text-xs text-[#5c6a58]">
                        {scenario.blurb}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </aside>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#c9bd97] bg-[#f7f1de] p-3">
            <div className="text-sm text-[#4b5a48]">
              Resolve pending decisions:
            </div>
            <div className="flex overflow-hidden rounded-lg border border-[#c9bd97]">
              {(['each', 'all'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setResolveMode(mode)}
                  className={`px-3 py-1 text-sm ${
                    resolveMode === mode
                      ? 'bg-[#2d5b3c] text-[#f7f1de]'
                      : 'bg-transparent text-[#3a4a38]'
                  }`}
                >
                  {mode === 'each' ? 'Resolve each' : 'Resolve all'}
                </button>
              ))}
            </div>
          </div>

          <Transcript chat={chat} />

          {chat.interruptErrors.length > 0 ? (
            <div className="rounded-xl border border-[#c07a5b] bg-[#f6ddce] p-3 text-sm text-[#7a3520]">
              {chat.interruptErrors.map((error) => (
                <div key={error.code}>{error.message}</div>
              ))}
              <button
                onClick={() => chat.retryInterrupts()}
                className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#7a3520] px-2 py-1 text-[#f6ddce]"
              >
                <RotateCcw size={13} /> Retry
              </button>
            </div>
          ) : null}

          {interrupts.length > 0 ? (
            <div className="space-y-3">
              {resolveMode === 'all' ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#c9bd97] bg-[#f7f1de] p-3">
                  <span className="text-sm text-[#4b5a48]">
                    {interrupts.length} pending. Resolve the whole batch:
                  </span>
                  <button
                    onClick={() => chat.resolveInterrupts(true)}
                    disabled={chat.resuming}
                    className="rounded-md bg-[#2d5b3c] px-3 py-1 text-sm text-[#f7f1de] disabled:opacity-50"
                  >
                    Approve all
                  </button>
                  <button
                    onClick={() => chat.cancelInterrupts()}
                    disabled={chat.resuming}
                    className="rounded-md border border-[#8a5b3c] px-3 py-1 text-sm text-[#7a3520] disabled:opacity-50"
                  >
                    Cancel all
                  </button>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                {interrupts.map((interrupt) => (
                  <InterruptCard
                    key={interrupt.id}
                    interrupt={interrupt}
                    disabled={resolveMode === 'all' || chat.resuming}
                    record={record}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {decisions.length > 0 ? (
            <div className="rounded-xl border border-[#c9bd97] bg-[#f7f1de] p-3">
              <h2 className="mb-1 font-mono text-xs uppercase tracking-widest text-[#6f6338]">
                Your decisions
              </h2>
              <ul className="space-y-1 font-mono text-[11px] text-[#4b5a48]">
                {decisions.map((decision, i) => (
                  <li key={i}>{decision}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function Transcript({
  chat,
}: {
  chat: ReturnType<typeof useChat<typeof clientTools>>
}) {
  if (chat.messages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#c9bd97] p-6 text-center text-sm text-[#6f6338]">
        Pick an action on the left to start.
      </div>
    )
  }
  return (
    <div className="space-y-2 rounded-xl border border-[#c9bd97] bg-[#f7f1de] p-4">
      {chat.messages.map((message) => (
        <div key={message.id} className="text-sm">
          <span className="font-mono text-xs uppercase text-[#6f6338]">
            {message.role}:{' '}
          </span>
          {message.parts.map((part, i) => {
            if (part.type === 'text') return <span key={i}>{part.content}</span>
            if (part.type === 'tool-call') {
              return (
                <div
                  key={i}
                  className="mt-1 rounded-md bg-[#efe6c8] px-2 py-1 font-mono text-[11px] text-[#4b5a48]"
                >
                  🔧 {part.name}(
                  {JSON.stringify(part.input ?? part.arguments)})
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
                  key={i}
                  className="mt-1 rounded-md bg-[#e6efdd] px-2 py-1 font-mono text-[11px] text-[#3a4a38]"
                >
                  ↳ {part.error ?? body}
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

function InterruptCard({
  interrupt,
  disabled,
  record,
}: {
  interrupt: Interrupt
  disabled: boolean
  record: (message: string) => void
}) {
  if (interrupt.kind === 'generic') {
    return (
      <GenericCard interrupt={interrupt} disabled={disabled} record={record} />
    )
  }
  return (
    <ApprovalCard interrupt={interrupt} disabled={disabled} record={record} />
  )
}

// Pick an animal from whatever the tool call is about, for a photo + an emoji
// fallback if the photo can't load.
const ANIMALS: Array<[test: RegExp, keyword: string, emoji: string]> = [
  [/fox/, 'red-fox', '🦊'],
  [/owl/, 'barn-owl', '🦉'],
  [/hedgehog/, 'hedgehog', '🦔'],
  [/deer|fawn/, 'deer', '🦌'],
  [/rabbit|bunny|hare/, 'rabbit', '🐰'],
  [/badger/, 'badger', '🦡'],
  [/turtle|tortoise/, 'turtle', '🐢'],
  [/otter/, 'otter', '🦦'],
  [/bird|sparrow|robin/, 'bird', '🐦'],
]

function animalOf(interrupt: Interrupt): { keyword: string; emoji: string } {
  if (interrupt.kind === 'generic') return { keyword: 'wildlife', emoji: '🍽️' }
  const hay = JSON.stringify(interrupt.originalArgs).toLowerCase()
  for (const [test, keyword, emoji] of ANIMALS) {
    if (test.test(hay)) return { keyword, emoji }
  }
  return { keyword: 'wildlife-rescue', emoji: '🐾' }
}

// A real photo of the animal (loremflickr, keyed by species), with the emoji as
// an offline/failure fallback so the card always shows something.
function AnimalAvatar({ interrupt }: { interrupt: Interrupt }) {
  const { keyword, emoji } = animalOf(interrupt)
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span
        aria-hidden
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#eadfba] text-2xl shadow-inner ring-1 ring-[#d8cba2]"
      >
        {emoji}
      </span>
    )
  }
  return (
    <img
      src={`https://loremflickr.com/96/96/${keyword}?lock=7`}
      alt={keyword.replace(/-/g, ' ')}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 rounded-full object-cover ring-2 ring-[#d8cba2]"
    />
  )
}

function Shell({
  title,
  subtitle,
  children,
  interrupt,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  interrupt: Interrupt
}) {
  return (
    <article className="space-y-3 rounded-2xl border border-[#d8cba2] bg-gradient-to-b from-[#fbf6e6] to-[#f4ecd4] p-4 shadow-[0_6px_20px_-8px_rgba(94,79,45,0.5)]">
      <div className="flex items-start gap-3">
        <AnimalAvatar interrupt={interrupt} />
        <div className="min-w-0">
          <h3 className="font-serif text-lg leading-tight">{title}</h3>
          {subtitle ? (
            <p className="break-words text-xs text-[#5c6a58]">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
      {interrupt.errors.map((error) => (
        <p
          key={`${error.code}:${error.path?.join('.') ?? ''}`}
          className="text-xs text-[#a23b1e]"
        >
          {error.message}
        </p>
      ))}
    </article>
  )
}

function ApproveRejectRow({
  onApprove,
  onReject,
  onCancel,
  disabled,
  approveLabel = 'Approve',
}: {
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
  disabled: boolean
  approveLabel?: string
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={onApprove}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-md bg-[#2d5b3c] px-3 py-1 text-sm text-[#f7f1de] disabled:opacity-50"
      >
        <Check size={14} /> {approveLabel}
      </button>
      <button
        onClick={onReject}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-md border border-[#8a5b3c] px-3 py-1 text-sm text-[#7a3520] disabled:opacity-50"
      >
        <X size={14} /> Reject
      </button>
      <button
        onClick={onCancel}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm text-[#6f6338] disabled:opacity-50"
      >
        <Trash2 size={14} /> Cancel
      </button>
    </div>
  )
}

const textInput =
  'w-full rounded-md border border-[#c9bd97] bg-[#fbf7ea] px-2 py-1 text-sm'

function ApprovalCard({
  interrupt,
  disabled,
  record,
}: {
  interrupt: Extract<Interrupt, { kind: 'tool-approval' }>
  disabled: boolean
  record: (message: string) => void
}) {
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('Not this time')
  const [adopterName, setAdopterName] = useState('')
  const [homeCheck, setHomeCheck] = useState(true)
  const [channel, setChannel] = useState<'instagram' | 'newsletter'>('instagram')
  const [enclosure, setEnclosure] = useState('')
  const [sizeSqm, setSizeSqm] = useState('')
  const [adopter, setAdopter] = useState('')
  const [certDate, setCertDate] = useState('')

  const args = JSON.stringify(interrupt.originalArgs)
  // Log exactly what was submitted, so payloads/edits are visible (an approve
  // payload never reaches the tool, so this is the only place it shows).
  const decided = (verb: string, detail?: unknown) =>
    record(
      `${verb} ${interrupt.toolName}${
        detail === undefined ? '' : ` · ${JSON.stringify(detail)}`
      }`,
    )
  const cancel = () => {
    decided('✋ cancelled')
    interrupt.cancel()
  }

  // Note: each tool gets its own `case` (no shared fall-through). Sharing a
  // block would leave `interrupt` a union of tools, and calling its overloaded
  // `resolveInterrupt` on that union collapses the parameter to `never`.
  switch (interrupt.toolName) {
    case 'admitRescue':
      return (
        <Shell title={interrupt.toolName} subtitle={args} interrupt={interrupt}>
          <ApproveRejectRow
            disabled={disabled}
            onApprove={() => {
              decided('✅ approved')
              interrupt.resolveInterrupt(true)
            }}
            onReject={() => {
              decided('❌ rejected')
              interrupt.resolveInterrupt(false)
            }}
            onCancel={cancel}
          />
        </Shell>
      )

    case 'printIntakeTag':
      return (
        <Shell title={interrupt.toolName} subtitle={args} interrupt={interrupt}>
          <ApproveRejectRow
            disabled={disabled}
            onApprove={() => {
              decided('✅ approved')
              interrupt.resolveInterrupt(true)
            }}
            onReject={() => {
              decided('❌ rejected')
              interrupt.resolveInterrupt(false)
            }}
            onCancel={cancel}
          />
        </Shell>
      )

    case 'scheduleVetCheck':
      return (
        <Shell title={interrupt.toolName} subtitle={args} interrupt={interrupt}>
          <input
            className={textInput}
            placeholder="Note (required)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <ApproveRejectRow
            disabled={disabled}
            onApprove={() => {
              decided('✅ approved', { note })
              interrupt.resolveInterrupt(true, { payload: { note } })
            }}
            onReject={() => {
              decided('❌ rejected', { note })
              interrupt.resolveInterrupt(false, { payload: { note } })
            }}
            onCancel={cancel}
          />
        </Shell>
      )

    case 'logFieldSighting':
      return (
        <Shell title={interrupt.toolName} subtitle={args} interrupt={interrupt}>
          <input
            className={textInput}
            placeholder="Note (required)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <ApproveRejectRow
            disabled={disabled}
            onApprove={() => {
              decided('✅ approved', { note })
              interrupt.resolveInterrupt(true, { payload: { note } })
            }}
            onReject={() => {
              decided('❌ rejected', { note })
              interrupt.resolveInterrupt(false, { payload: { note } })
            }}
            onCancel={cancel}
          />
        </Shell>
      )

    case 'finalizeAdoption':
      return (
        <Shell title="finalizeAdoption" subtitle={args} interrupt={interrupt}>
          <input
            className={textInput}
            placeholder="Adopter name"
            value={adopterName}
            onChange={(event) => setAdopterName(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={homeCheck}
              onChange={(event) => setHomeCheck(event.target.checked)}
            />
            Home check passed
          </label>
          <input
            className={textInput}
            placeholder="Rejection reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <ApproveRejectRow
            disabled={disabled}
            onApprove={() => {
              decided('✅ approved', { adopterName, homeCheckPassed: homeCheck })
              interrupt.resolveInterrupt(true, {
                payload: { adopterName, homeCheckPassed: homeCheck },
              })
            }}
            onReject={() => {
              decided('❌ rejected', { reason })
              interrupt.resolveInterrupt(false, { payload: { reason } })
            }}
            onCancel={cancel}
          />
        </Shell>
      )

    case 'shareAdoptionStory':
      return (
        <Shell title="shareAdoptionStory" subtitle={args} interrupt={interrupt}>
          <select
            className={textInput}
            value={channel}
            onChange={(event) =>
              setChannel(
                event.target.value === 'newsletter' ? 'newsletter' : 'instagram',
              )
            }
          >
            <option value="instagram">Instagram</option>
            <option value="newsletter">Newsletter</option>
          </select>
          <input
            className={textInput}
            placeholder="Rejection reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <ApproveRejectRow
            disabled={disabled}
            onApprove={() => {
              decided('✅ approved', { channel })
              interrupt.resolveInterrupt(true, { payload: { channel } })
            }}
            onReject={() => {
              decided('❌ rejected', { reason })
              interrupt.resolveInterrupt(false, { payload: { reason } })
            }}
            onCancel={cancel}
          />
        </Shell>
      )

    case 'assignEnclosure':
      return (
        <Shell
          title="assignEnclosure"
          subtitle="Edit the plan, then approve."
          interrupt={interrupt}
        >
          <input
            className={textInput}
            placeholder={`enclosure (${interrupt.originalArgs.enclosure})`}
            value={enclosure}
            onChange={(event) => setEnclosure(event.target.value)}
          />
          <input
            className={textInput}
            type="number"
            placeholder={`size m² (${interrupt.originalArgs.sizeSqm})`}
            value={sizeSqm}
            onChange={(event) => setSizeSqm(event.target.value)}
          />
          <ApproveRejectRow
            disabled={disabled}
            approveLabel="Approve edited"
            onApprove={() => {
              const editedArgs = {
                animal: interrupt.originalArgs.animal,
                enclosure: enclosure || interrupt.originalArgs.enclosure,
                sizeSqm: sizeSqm
                  ? Number(sizeSqm)
                  : interrupt.originalArgs.sizeSqm,
              }
              decided('✅ approved (edited)', editedArgs)
              interrupt.resolveInterrupt(true, { editedArgs })
            }}
            onReject={() => {
              decided('❌ rejected')
              interrupt.resolveInterrupt(false)
            }}
            onCancel={cancel}
          />
        </Shell>
      )

    case 'printCertificate':
      return (
        <Shell
          title="printCertificate"
          subtitle="Edit the details, then approve."
          interrupt={interrupt}
        >
          <input
            className={textInput}
            placeholder={`adopter (${interrupt.originalArgs.adopter})`}
            value={adopter}
            onChange={(event) => setAdopter(event.target.value)}
          />
          <input
            className={textInput}
            placeholder={`date (${interrupt.originalArgs.date})`}
            value={certDate}
            onChange={(event) => setCertDate(event.target.value)}
          />
          <ApproveRejectRow
            disabled={disabled}
            approveLabel="Approve edited"
            onApprove={() => {
              const editedArgs = {
                animal: interrupt.originalArgs.animal,
                adopter: adopter || interrupt.originalArgs.adopter,
                date: certDate || interrupt.originalArgs.date,
              }
              decided('✅ approved (edited)', editedArgs)
              interrupt.resolveInterrupt(true, { editedArgs })
            }}
            onReject={() => {
              decided('❌ rejected')
              interrupt.resolveInterrupt(false)
            }}
            onCancel={cancel}
          />
        </Shell>
      )

    default:
      return null
  }
}

function GenericCard({
  interrupt,
  disabled,
  record,
}: {
  interrupt: Extract<Interrupt, { kind: 'generic' }>
  disabled: boolean
  record: (message: string) => void
}) {
  const [meals, setMeals] = useState('2')
  const [diet, setDiet] = useState('')

  return (
    <Shell
      title="Feeding schedule"
      subtitle={interrupt.message ?? interrupt.reason}
      interrupt={interrupt}
    >
      <input
        className={textInput}
        type="number"
        placeholder="Meals per day (1-6)"
        value={meals}
        onChange={(event) => setMeals(event.target.value)}
      />
      <input
        className={textInput}
        placeholder="Diet"
        value={diet}
        onChange={(event) => setDiet(event.target.value)}
      />
      <div className="flex gap-2">
        <button
          onClick={() => {
            const value = { mealsPerDay: Number(meals), diet }
            record(`🍽️ feeding schedule · ${JSON.stringify(value)}`)
            interrupt.resolveInterrupt(value)
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md bg-[#2d5b3c] px-3 py-1 text-sm text-[#f7f1de] disabled:opacity-50"
        >
          <Check size={14} /> Submit
        </button>
        <button
          onClick={() => {
            record('✋ feeding schedule cancelled')
            interrupt.cancel()
          }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm text-[#6f6338] disabled:opacity-50"
        >
          <Trash2 size={14} /> Cancel
        </button>
      </div>
    </Shell>
  )
}
