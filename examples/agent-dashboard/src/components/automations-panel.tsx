/**
 * The channel's automations: the tool registry (public tools only, with run-now),
 * the schedule table (the dashboard's clock), and a webhook tester. All three
 * produce the same thing — an injected tool call whose structured result streams
 * into the channel via the feed tail.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { runInjection } from '@/lib/session-controller'
import type { MembershipRow } from '@/db/collections'

interface ToolInfo {
  name: string
  description: string
}
interface ScheduleRow {
  id: string
  tool: string
  everySeconds?: number
  cron?: string
  enabled: boolean
  nextFire?: number
}

export function AutomationsPanel({
  channelId,
  primary,
}: {
  channelId: string
  primary: MembershipRow
}) {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['schedules', channelId] })
    void qc.invalidateQueries({ queryKey: ['offline'] })
  }

  const tools = useQuery<{ tools: Array<ToolInfo> }>({
    queryKey: ['tools', primary.threadId],
    queryFn: () =>
      fetch(`/api/tools?threadId=${primary.threadId}`).then((r) => r.json()),
  })
  const schedules = useQuery<{ schedules: Array<ScheduleRow> }>({
    queryKey: ['schedules', channelId],
    queryFn: () =>
      fetch(`/api/schedules?channelId=${channelId}`).then((r) => r.json()),
    refetchInterval: 2000,
  })
  const offline = useQuery<{ offline: boolean; queued: number }>({
    queryKey: ['offline'],
    queryFn: () => fetch('/api/dev/offline').then((r) => r.json()),
    refetchInterval: 1500,
  })

  const [everySeconds, setEverySeconds] = useState(10)
  const [tool, setTool] = useState('')
  const toolNames = tools.data?.tools ?? []
  const selectedTool = tool || toolNames[0]?.name || ''

  const addSchedule = useMutation({
    mutationFn: () =>
      fetch('/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: primary.threadId,
          channelId,
          tool: selectedTool,
          everySeconds,
        }),
      }).then((r) => r.json()),
    onSuccess: invalidate,
  })
  const toggleSchedule = useMutation({
    mutationFn: (row: ScheduleRow) =>
      fetch('/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id, enabled: !row.enabled }),
      }).then((r) => r.json()),
    onSuccess: invalidate,
  })
  const deleteSchedule = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/schedules?id=${id}`, { method: 'DELETE' }).then((r) =>
        r.json(),
      ),
    onSuccess: invalidate,
  })
  const setOffline = useMutation({
    mutationFn: (value: boolean) =>
      fetch('/api/dev/offline', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ offline: value }),
      }).then((r) => r.json()),
    onSuccess: invalidate,
  })
  const sendWebhook = useMutation({
    mutationFn: async () => {
      const created = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: primary.threadId,
          channelId,
          tool: selectedTool,
          argMapping: { queue: 'queue' },
        }),
      }).then((r) => r.json())
      const token = created.webhook.token as string
      return fetch(`/api/webhooks/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ queue: 'from-webhook' }),
      }).then((r) => r.json())
    },
  })

  return (
    <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-white/80">Automations</h2>
        <span className="text-xs text-white/40">
          deterministic tool runs — no tokens
        </span>
        {offline.data?.offline && (
          <span className="ml-auto rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">
            host offline — {offline.data.queued} queued
          </span>
        )}
      </div>

      {/* Tool registry + run-now (public tools only) */}
      <div>
        <div className="text-xs uppercase tracking-wide text-white/40">
          Public tools
        </div>
        <div className="mt-1 flex flex-wrap gap-2">
          {toolNames.length === 0 && (
            <span className="text-xs text-white/40">none</span>
          )}
          {toolNames.map((t) => (
            <button
              key={t.name}
              onClick={() => runInjection(primary, t.name, { queue: 'run-now' })}
              className="rounded-md border border-white/15 px-2 py-1 font-mono text-xs text-white/70 hover:bg-white/[0.05]"
              title={t.description}
            >
              ▶ run {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* Schedule table */}
      <div>
        <div className="text-xs uppercase tracking-wide text-white/40">
          Schedules
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <select
            aria-label="schedule tool"
            value={selectedTool}
            onChange={(e) => setTool(e.target.value)}
            className="rounded border border-white/15 bg-transparent px-2 py-1 text-xs"
          >
            {toolNames.map((t) => (
              <option key={t.name} value={t.name} className="bg-neutral-900">
                {t.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-white/50">
            every
            <input
              type="number"
              min={1}
              aria-label="schedule interval seconds"
              value={everySeconds}
              onChange={(e) => setEverySeconds(Number(e.target.value) || 1)}
              className="w-16 rounded border border-white/15 bg-transparent px-2 py-1 text-xs"
            />
            s
          </label>
          <button
            onClick={() => addSchedule.mutate()}
            disabled={!selectedTool}
            className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-40"
          >
            + Add schedule
          </button>
        </div>
        <ul className="mt-2 space-y-1">
          {(schedules.data?.schedules ?? []).map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 rounded border border-white/5 px-2 py-1 text-xs"
            >
              <span className="font-mono text-sky-300">{row.tool}</span>
              <span className="text-white/40">
                {row.everySeconds
                  ? `every ${row.everySeconds}s`
                  : (row.cron ?? '')}
              </span>
              <button
                onClick={() => toggleSchedule.mutate(row)}
                className="ml-auto rounded border border-white/15 px-1.5 py-0.5 text-white/60 hover:bg-white/[0.05]"
              >
                {row.enabled ? 'pause' : 'resume'}
              </button>
              <button
                onClick={() => deleteSchedule.mutate(row.id)}
                className="rounded border border-white/15 px-1.5 py-0.5 text-white/60 hover:bg-white/[0.05]"
              >
                delete
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Webhook + offline simulation */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => sendWebhook.mutate()}
          disabled={!selectedTool}
          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-40"
        >
          Send test webhook
        </button>
        <button
          onClick={() => setOffline.mutate(!offline.data?.offline)}
          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/[0.05]"
        >
          {offline.data?.offline ? 'Bring host online' : 'Simulate host offline'}
        </button>
      </div>
    </div>
  )
}
