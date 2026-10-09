/**
 * The session toolbar: rename, fork, and reset the thread, pick its model,
 * and see the inputs that wait for the running turn and the child sessions.
 * Everything goes through the harness protocol (`/api/harness/*`).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowCounterClockwiseIcon,
  GitForkIcon,
  PencilSimpleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { controlInput, harnessGet, sessionOp } from '@/lib/session-controller'

interface WaitingInput {
  inputId: string
  delivery: 'steer' | 'queue'
  message: unknown
}

function textOf(message: unknown): string {
  if (typeof message === 'string') return message
  return JSON.stringify(message)
}

export function SessionTools({ threadId }: { threadId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const describe = useQuery<{
    models: Array<string>
    settings: { model?: string }
  }>({
    queryKey: ['describe', threadId],
    queryFn: () => harnessGet('describe', threadId),
  })
  const snapshot = useQuery<{ waitingInputs: Array<WaitingInput> }>({
    queryKey: ['snapshot', threadId],
    queryFn: () => harnessGet('snapshot', threadId),
    refetchInterval: 1500,
  })
  const children = useQuery<{
    entries: Array<{ threadId: string; title?: string }>
  }>({
    queryKey: ['children', threadId],
    queryFn: () =>
      harnessGet(
        'sessions',
        threadId,
        `&parentThreadId=${encodeURIComponent(threadId)}`,
      ),
    refetchInterval: 5000,
  })

  const rename = async () => {
    const title = window.prompt('Session title')
    if (title) await sessionOp(threadId, { op: 'rename', title })
  }
  const fork = async () => {
    const transcript: Array<{ id?: string }> = await harnessGet(
      'transcript',
      threadId,
    )
    const last = [...transcript].reverse().find((message) => message.id)?.id
    if (!last) return
    const entry = await sessionOp(threadId, { op: 'fork', through: last })
    if (entry?.threadId) {
      await navigate({
        to: '/sessions/$threadId',
        params: { threadId: entry.threadId },
      })
    }
  }
  const pickModel = async (model: string) => {
    await controlInput(threadId, {
      op: 'configure',
      settings: { model: model || null },
    })
    await queryClient.invalidateQueries({ queryKey: ['describe', threadId] })
  }

  const models = describe.data?.models ?? []
  const waiting = snapshot.data?.waitingInputs ?? []
  const kids = children.data?.entries ?? []

  return (
    <div className="flex flex-col gap-2 px-6 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={rename} className="btn btn-sm btn-ghost">
          <PencilSimpleIcon size={12} />
          Rename
        </button>
        <button onClick={fork} className="btn btn-sm btn-ghost">
          <GitForkIcon size={12} />
          Fork
        </button>
        <button
          onClick={() => controlInput(threadId, { op: 'reset' })}
          className="btn btn-sm btn-ghost"
        >
          <ArrowCounterClockwiseIcon size={12} />
          Reset context
        </button>
        {models.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-xs text-ink-3">
            model
            <select
              aria-label="model"
              value={describe.data?.settings.model ?? ''}
              onChange={(event) => pickModel(event.target.value)}
              className="select select-sm"
            >
              <option value="">default</option>
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {waiting.length > 0 && (
        <ul className="space-y-1 text-xs text-ink-2">
          {waiting.map((input) => (
            <li key={input.inputId} className="flex items-center gap-2">
              <span className="pill bg-ui text-ink-3">{input.delivery}</span>
              <span className="truncate">{textOf(input.message)}</span>
              <button
                aria-label="Cancel input"
                onClick={() =>
                  controlInput(threadId, {
                    op: 'cancelInput',
                    inputId: input.inputId,
                  })
                }
                className="btn btn-xs btn-ghost"
              >
                <XIcon size={10} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {kids.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-ink-3">
          child sessions:
          {kids.map((kid) => (
            <a
              key={kid.threadId}
              href={`/sessions/${encodeURIComponent(kid.threadId)}`}
              className="font-mono underline"
            >
              {kid.title ?? kid.threadId}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
