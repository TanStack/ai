/**
 * The stream component system: everything in a channel or session is a message,
 * a tool call, or a card that blocks a run (approval, question), in one
 * bottom-anchored timeline. `team` turns on attribution (avatars + author
 * headers); without it the stream reads like a plain single-agent chat.
 */
import { useState } from 'react'
import {
  ArrowUpIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  HandPalmIcon,
  HandTapIcon,
  ArrowsInIcon,
  ArrowClockwiseIcon,
  HashIcon,
  KeyIcon,
  PencilSimpleIcon,
  WarningIcon,
  PlugIcon,
  QuestionIcon,
  StopIcon,
  TimerIcon,
  UserPlusIcon,
  WebhooksLogoIcon,
} from '@phosphor-icons/react'
import { controlInput, resolveApproval } from '@/lib/session-controller'
import { questions } from '@/db/collections'
import { JsonTree, tryParse } from '@/components/json-tree'
import { Markdown } from '@/components/markdown'
import { Avatar, clock } from '@/components/ui'
import type {
  ApprovalRow,
  MessageRow,
  QuestionRow,
  SessionRow,
  ToolCallRow,
} from '@/db/collections'

export type Entry =
  | { kind: 'message'; at: number; m: MessageRow }
  | { kind: 'tool'; at: number; t: ToolCallRow }
  | { kind: 'approval'; at: number; a: ApprovalRow; t?: ToolCallRow }
  | { kind: 'question'; at: number; q: QuestionRow }

/** Merge the live rows into one time-ordered stream. Only pending cards show. */
export function buildTimeline({
  msgs = [],
  tools = [],
  approvals = [],
  questions: questionRows = [],
}: {
  msgs?: Array<MessageRow>
  tools?: Array<ToolCallRow>
  approvals?: Array<ApprovalRow>
  questions?: Array<QuestionRow>
}): Array<Entry> {
  return [
    ...msgs.map((m) => ({ kind: 'message' as const, at: m.createdAt, m })),
    ...tools.map((t) => ({ kind: 'tool' as const, at: t.createdAt, t })),
    ...approvals
      .filter((a) => a.status === 'pending')
      .map((a) => ({
        kind: 'approval' as const,
        at: a.createdAt,
        a,
        t: tools.find((t) => t.id === a.toolCallId),
      })),
    ...questionRows
      .filter((q) => q.status === 'pending')
      .map((q) => ({ kind: 'question' as const, at: q.createdAt, q })),
  ].sort((a, b) => a.at - b.at)
}

function authorOf(entry: Entry): string | undefined {
  switch (entry.kind) {
    case 'message':
      if (entry.m.role === 'system') return undefined
      return entry.m.role === 'user' ? 'you' : (entry.m.agentId ?? 'agent')
    case 'tool':
      return entry.t.agentId
    case 'approval':
      return entry.a.agentId
    case 'question':
      return entry.q.agentId
  }
}

export function Stream({
  entries,
  team = false,
  nameByAgent,
}: {
  entries: Array<Entry>
  team?: boolean
  nameByAgent?: Map<string, string>
}) {
  let prev: string | undefined
  return (
    <>
      {entries.map((entry) => {
        const who = authorOf(entry)
        const showHeader = team && who !== prev
        prev = who
        const name = who ? (nameByAgent?.get(who) ?? who) : undefined
        const inset = team ? 'ml-10' : ''
        switch (entry.kind) {
          case 'message':
            return entry.m.role === 'system' ? (
              <SystemCard key={entry.m.id} message={entry.m} />
            ) : (
              <Message
                key={entry.m.id}
                message={entry.m}
                author={entry.m.role === 'user' ? 'You' : (name ?? 'Agent')}
                team={team}
                showHeader={showHeader}
              />
            )
          case 'tool':
            return (
              <div key={entry.t.id} className={inset}>
                <ToolCard
                  tool={entry.t}
                  author={showHeader ? name : undefined}
                  quiet={!team}
                />
              </div>
            )
          case 'approval':
            return (
              <div key={entry.a.id} className={inset}>
                <ApprovalCard approval={entry.a} tool={entry.t} />
              </div>
            )
          case 'question':
            return (
              <div key={entry.q.id} className={inset}>
                <QuestionCard question={entry.q} />
              </div>
            )
        }
      })}
    </>
  )
}

function Message({
  message,
  author,
  team,
  showHeader,
}: {
  message: MessageRow
  author: string
  team: boolean
  showHeader: boolean
}) {
  const isUser = message.role === 'user'
  const [expanded, setExpanded] = useState(false)
  // Strip the internal `[channel:<id>]` routing tag the injector prefixes onto a
  // subscription prompt — it's plumbing, not something a human should read.
  const text = message.text.replace(/^\[channel:[^\]]+\]\s*/, '')
  // Injected trigger prompts (a subscription's "New … batch" context) arrive as
  // long user messages. Collapse them to a few lines so they don't drown the
  // channel; a human's own message is short and never trips this.
  const long = isUser && text.length > 280

  const body = !text ? (
    <span className="text-ink-3">…</span>
  ) : isUser ? (
    <>
      <div
        className={`whitespace-pre-wrap ${long && !expanded ? 'line-clamp-3' : ''}`}
      >
        {text}
      </div>
      {long && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] font-normal text-ink-3 hover:text-ink"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  ) : (
    <Markdown>{text}</Markdown>
  )
  const subagent = message.subagentRunId && (
    <span className="pill border border-line-strong font-normal text-ink-2">
      subagent
    </span>
  )

  if (!team) {
    return isUser ? (
      <div className="flex justify-end">
        <div className="max-w-[520px] rounded-[14px_14px_4px_14px] bg-ui px-4 py-2.5 text-[15px] leading-[1.55]">
          {body}
        </div>
      </div>
    ) : (
      <div className="text-[15px] leading-[1.65]">
        {subagent}
        {body}
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      {showHeader ? (
        <Avatar name={author} human={isUser} />
      ) : (
        <span className="w-7 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="mb-1 flex items-baseline gap-2">
            <span className="text-[13px] font-medium">{author}</span>
            <span className="text-[11px] font-normal text-ink-3">
              {isUser ? 'operator' : 'agent'} · {clock(message.createdAt)}
            </span>
            {subagent}
          </div>
        )}
        {isUser ? (
          <div className="inline-block max-w-[620px] rounded-[4px_10px_10px_10px] bg-ui px-3 py-2">
            {body}
          </div>
        ) : (
          <div className="max-w-[680px]">{body}</div>
        )}
      </div>
    </div>
  )
}

const TRIGGER_ICON = {
  timer: TimerIcon,
  manual: HandTapIcon,
  webhook: WebhooksLogoIcon,
  mcp: PlugIcon,
}

/** One line that carries the meaning, without echoing long result strings. */
function summarize(tool: ToolCallRow): string {
  if (tool.status === 'running') return 'Running…'
  if (!tool.result) return 'Done'
  const parsed = tryParse(tool.result)
  if (parsed === undefined) return tool.result
  if (Array.isArray(parsed))
    return `${parsed.length} item${parsed.length === 1 ? '' : 's'}`
  const parts = Object.entries(parsed as Record<string, unknown>).flatMap(
    ([k, v]) =>
      typeof v === 'number' || typeof v === 'boolean'
        ? [`${k} ${v}`]
        : Array.isArray(v)
          ? [`${v.length} ${k}`]
          : [],
  )
  return parts.length ? parts.slice(0, 4).join(' · ') : 'Done'
}

function Payload({ label, value }: { label: string; value: string }) {
  const parsed = tryParse(value)
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {parsed !== undefined ? (
        <JsonTree value={parsed} />
      ) : (
        <div className="break-all whitespace-pre-wrap text-ink">{value}</div>
      )}
    </div>
  )
}

/**
 * A collapsed tool-result row that opens to its JSON. Native <details>, so the
 * payload stays in the DOM (searchable) while collapsed.
 */
export function ToolCard({
  tool,
  author,
  quiet,
}: {
  tool: ToolCallRow
  author?: string
  quiet?: boolean
}) {
  const running = tool.status === 'running'
  const TriggerIcon = tool.trigger ? TRIGGER_ICON[tool.trigger] : undefined
  return (
    <details
      className={`group max-w-[680px] rounded-md ${quiet ? '' : 'bg-surface-raised'}`}
    >
      <summary
        className={`flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden ${
          quiet ? 'py-1 text-ink-3' : 'px-3 py-2'
        }`}
      >
        {running ? (
          <CircleNotchIcon
            size={16}
            className="shrink-0 animate-spin text-ink-2"
          />
        ) : quiet ? (
          <CheckIcon size={14} className="shrink-0" />
        ) : (
          <CheckCircleIcon size={16} className="shrink-0 text-ok" />
        )}
        {author && (
          <span className="text-[13px] font-medium text-ink">{author}</span>
        )}
        {TriggerIcon && (
          <span className="pill border border-line-strong font-normal text-ink-2">
            <TriggerIcon size={12} />
            {tool.trigger} trigger
          </span>
        )}
        <span
          className={`shrink-0 font-mono text-xs ${quiet ? '' : 'text-ink-2'}`}
        >
          {tool.name}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${
            quiet ? '' : running ? 'text-ink-2' : 'text-ink'
          }`}
        >
          {summarize(tool)}
        </span>
        {tool.truncated && (
          <span className="font-mono text-[11px] text-ink-3">truncated</span>
        )}
        <CaretRightIcon
          size={12}
          className="shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-90"
        />
      </summary>
      <div
        className={`space-y-3 bg-surface-sunken px-3.5 py-3 font-mono text-xs leading-[1.6] text-ink-2 ${
          quiet ? 'mt-1 rounded-md' : 'rounded-b-md border-t border-line'
        }`}
      >
        {tool.args && <Payload label="args" value={tool.args} />}
        {tool.result && <Payload label="result" value={tool.result} />}
      </div>
    </details>
  )
}

const SYSTEM_ICON = {
  channel_created: HashIcon,
  member_joined: UserPlusIcon,
  compaction: ArrowsInIcon,
  sign_in: KeyIcon,
  retry: ArrowClockwiseIcon,
  error: WarningIcon,
}

export function SystemCard({ message }: { message: MessageRow }) {
  const kind = message.system?.kind ?? 'member_joined'
  const Icon = SYSTEM_ICON[kind]
  return (
    <div
      className={`flex items-center gap-3 text-xs font-normal ${kind === 'error' ? 'text-err' : 'text-ink-3'}`}
    >
      <span className="h-px flex-1 bg-line" />
      <Icon size={14} />
      <span>{message.text}</span>
      {message.system?.url && (
        <a
          href={message.system.url}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Sign in
        </a>
      )}
      {message.system?.topic && <span>· {message.system.topic}</span>}
      <span>· {clock(message.createdAt)}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

function ArgsGrid({ args }: { args: string }) {
  const parsed = tryParse(args)
  if (parsed === undefined || Array.isArray(parsed)) {
    return (
      <pre className="overflow-x-auto rounded-sm bg-surface-sunken p-3 font-mono text-xs text-ink-2">
        {args}
      </pre>
    )
  }
  return (
    <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1 text-[13px]">
      {Object.entries(parsed as Record<string, unknown>).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="truncate font-normal text-ink-3">{k}</dt>
          <dd className="line-clamp-4 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-ink">
            {typeof v === 'string' ? v : JSON.stringify(v)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A tool call waiting for approval. The only raised card: it blocks a run. */
export function ApprovalCard({
  approval,
  tool,
}: {
  approval: ApprovalRow
  tool?: ToolCallRow
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tool?.args ?? '{}')
  const [busy, setBusy] = useState(false)

  const act = async (decision: 'approve' | 'deny', edited?: boolean) => {
    setBusy(true)
    let editedArgs: Record<string, unknown> | undefined
    if (edited) {
      try {
        editedArgs = JSON.parse(draft)
      } catch {
        setBusy(false)
        return
      }
    }
    await resolveApproval(approval.threadId, approval.id, decision, editedArgs)
    setBusy(false)
  }

  return (
    <div className="max-w-[680px] rounded-md bg-ui shadow-1">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <HandPalmIcon size={16} className="text-warn" />
        <span className="font-mono text-xs text-ink-2">
          {tool?.name ?? 'tool call'}
        </span>
        <span className="pill ml-auto bg-warn-soft text-warn">
          Approval required
        </span>
      </div>
      <div className="space-y-2 px-3 pb-3">
        {approval.message && (
          <p className="text-[13px] text-ink-2">{approval.message}</p>
        )}
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            spellCheck={false}
            className="input w-full bg-surface-sunken font-mono text-xs"
          />
        ) : (
          tool?.args && <ArgsGrid args={tool.args} />
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-line px-3 py-2.5">
        <button
          disabled={busy}
          onClick={() => act('approve', editing)}
          className="btn btn-accent"
        >
          <CheckIcon size={14} />
          {editing ? 'Approve edited' : 'Approve'}
        </button>
        <button
          disabled={busy}
          onClick={() => setEditing((v) => !v)}
          className="btn btn-outline"
        >
          <PencilSimpleIcon size={14} />
          {editing ? 'Cancel edit' : 'Edit call'}
        </button>
        <button
          disabled={busy}
          onClick={() => act('deny')}
          className="btn btn-ghost"
        >
          Deny
        </button>
        <span className="ml-auto text-[11px] font-normal text-ink-3">
          a harness `resolve` input
        </span>
      </div>
    </div>
  )
}

export function QuestionCard({ question }: { question: QuestionRow }) {
  const [answer, setAnswer] = useState('')
  const rawId = question.id.split(':').slice(1).join(':')
  // A `permissions()` question: `{ answer: 'once' | 'always' | 'reject' }`.
  const properties = question.schema?.properties as
    | { answer?: { enum?: Array<string> } }
    | undefined
  const choices = properties?.answer?.enum
  const submit = async (value: unknown) => {
    questions.update(question.id, (draft) => {
      draft.status = 'answered'
    })
    await controlInput(question.threadId, {
      op: 'answer',
      questionId: rawId,
      value,
    })
  }

  return (
    <div className="max-w-[680px] rounded-md bg-ui shadow-1">
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <QuestionIcon size={16} className="text-warn" />
        <span className="text-[13px] font-medium">Agent question</span>
        <span className="pill ml-auto bg-warn-soft text-warn">
          Waiting for you
        </span>
      </div>
      <p className="px-3 pb-3">{question.message}</p>
      {choices ? (
        <div className="flex gap-2 border-t border-line px-3 py-2.5">
          {choices.map((choice, index) => (
            <button
              key={choice}
              onClick={() => submit({ answer: choice })}
              className={`btn ${index === 0 ? 'btn-accent' : 'btn-outline'}`}
            >
              {choice}
            </button>
          ))}
        </div>
      ) : question.schema?.type === 'boolean' ? (
        <div className="flex gap-2 border-t border-line px-3 py-2.5">
          <button onClick={() => submit(true)} className="btn btn-accent">
            Yes
          </button>
          <button onClick={() => submit(false)} className="btn btn-outline">
            No
          </button>
        </div>
      ) : (
        <form
          className="flex gap-2 border-t border-line px-3 py-2.5"
          onSubmit={(event) => {
            event.preventDefault()
            void submit(answer)
          }}
        >
          <input
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="input flex-1"
            placeholder="Your answer"
          />
          <button className="btn btn-accent">Answer</button>
        </form>
      )}
    </div>
  )
}

const STATUS_STYLE: Record<SessionRow['status'], string> = {
  running: 'bg-ui text-ink-2',
  requires_action: 'bg-warn-soft text-warn',
  idle: 'bg-ui text-ink-3',
}

export function StatusPill({ status }: { status: SessionRow['status'] }) {
  return (
    <span className={`pill ${STATUS_STYLE[status]}`}>
      {status === 'running' && (
        <CircleNotchIcon size={11} className="animate-spin" />
      )}
      {status.replace('_', ' ')}
    </span>
  )
}

/** The message box. Enter sends; while a run is live, Enter steers it. */
export function Composer({
  value,
  onChange,
  onSend,
  running,
  onStop,
  placeholder = 'Send a message…',
  solo,
  children,
}: {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  running?: boolean
  onStop?: () => void
  placeholder?: string
  solo?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-line bg-ui px-3.5 py-3 focus-within:border-line-strong">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSend()}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm outline-none"
      />
      <div className="mt-2.5 flex items-center gap-2">
        {children}
        <span className="ml-auto text-[11px] font-normal text-ink-3">
          {running ? 'Enter to steer' : 'Enter to send'}
        </span>
        {running && onStop && (
          <button onClick={onStop} className="btn btn-sm btn-ghost">
            <StopIcon size={12} />
            Stop
          </button>
        )}
        <button
          onClick={onSend}
          aria-label={running ? 'Steer' : 'Send'}
          title={running ? 'Steer the running agent' : 'Send'}
          className={`btn btn-accent p-0 ${solo ? 'size-[34px] rounded-full' : 'size-8'}`}
        >
          <ArrowUpIcon size={16} weight="bold" />
        </button>
      </div>
    </div>
  )
}
