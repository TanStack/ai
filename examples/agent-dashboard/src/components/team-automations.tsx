import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TrashIcon } from '@/components/icons'
import type { MembershipRow } from '@/db/collections'

interface ToolInfo {
  name: string
  description: string
}

interface ScheduleRow {
  id: string
  threadId: string
  tool: string
  cron?: string
  everySeconds?: number
  enabled: boolean
  lastRunAt?: number
  upcoming: Array<number>
}

interface Delivery {
  id: string
  at: number
  payload: unknown
  status: string
  reason?: string
}

interface WebhookRow {
  token: string
  threadId: string
  mode: 'tool' | 'prompt'
  tool: string
  deliveries: Array<Delivery>
}

const date = (value?: number) =>
  value ? new Date(value).toLocaleString() : 'never'

export function TeamAutomations({
  channelId,
  members,
}: {
  channelId: string
  members: Array<MembershipRow>
}) {
  const agents = members.filter((member) => member.role === 'agent')
  const [threadId, setThreadId] = useState(agents[0]?.threadId ?? '')
  const member =
    agents.find((agent) => agent.threadId === threadId) ?? agents[0]
  const [tool, setTool] = useState('')
  const [cadence, setCadence] = useState<'interval' | 'cron'>('interval')
  const [everySeconds, setEverySeconds] = useState(60)
  const [cron, setCron] = useState('*/30 * * * *')
  const [mapping, setMapping] = useState('{}')
  const qc = useQueryClient()

  const tools = useQuery<{ tools: Array<ToolInfo> }>({
    queryKey: ['tools', member?.threadId, member?.harness],
    enabled: Boolean(member),
    queryFn: () =>
      fetch(
        `/api/tools?threadId=${member?.threadId}&harness=${encodeURIComponent(member?.harness ?? '')}`,
      ).then((response) => response.json()),
  })
  const toolNames = tools.data?.tools ?? []
  const selectedTool = tool || toolNames[0]?.name || ''
  const schedules = useQuery<{ schedules: Array<ScheduleRow> }>({
    queryKey: ['team-schedules', channelId],
    queryFn: () =>
      fetch(`/api/schedules?channelId=${channelId}`).then((response) =>
        response.json(),
      ),
    refetchInterval: 2000,
  })
  const webhooks = useQuery<{ webhooks: Array<WebhookRow> }>({
    queryKey: ['team-webhooks', channelId],
    queryFn: () =>
      fetch(`/api/webhooks?channelId=${channelId}`).then((response) =>
        response.json(),
      ),
    refetchInterval: 2000,
  })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['team-schedules', channelId] })
    void qc.invalidateQueries({ queryKey: ['team-webhooks', channelId] })
  }

  const addSchedule = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: member?.threadId,
          channelId,
          tool: selectedTool,
          ...(cadence === 'cron' ? { cron } : { everySeconds }),
        }),
      })
      if (!response.ok) throw new Error((await response.json()).error)
      return response.json()
    },
    onSuccess: refresh,
  })
  const changeSchedule = useMutation({
    mutationFn: (body: { id: string; enabled?: boolean; delete?: boolean }) =>
      fetch(`/api/schedules${body.delete ? `?id=${body.id}` : ''}`, {
        method: body.delete ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: body.delete ? undefined : JSON.stringify(body),
      }).then((response) => response.json()),
    onSuccess: refresh,
  })
  const addWebhook = useMutation({
    mutationFn: () =>
      fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: member?.threadId,
          channelId,
          harness: member?.harness,
          tool: selectedTool,
          argMapping: JSON.parse(mapping),
        }),
      }).then((response) => response.json()),
    onSuccess: refresh,
  })
  const deleteWebhook = useMutation({
    mutationFn: (token: string) =>
      fetch(`/api/webhooks?token=${token}`, { method: 'DELETE' }).then(
        (response) => response.json(),
      ),
    onSuccess: refresh,
  })

  if (!member) return null

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">
        Automations
      </h2>
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="automation agent"
            value={member.threadId}
            onChange={(event) => {
              setThreadId(event.target.value)
              setTool('')
            }}
            className="rounded border border-white/15 bg-neutral-900 px-2 py-1 text-xs"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.threadId}>
                {agent.displayName}
              </option>
            ))}
          </select>
          <select
            aria-label="automation tool"
            value={selectedTool}
            onChange={(event) => setTool(event.target.value)}
            className="rounded border border-white/15 bg-neutral-900 px-2 py-1 text-xs"
          >
            {toolNames.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 text-xs uppercase text-white/40">Schedules</div>
        <div className="mt-1 flex flex-wrap gap-2">
          <select
            aria-label="schedule cadence"
            value={cadence}
            onChange={(event) =>
              setCadence(event.target.value as 'interval' | 'cron')
            }
            className="rounded border border-white/15 bg-neutral-900 px-2 py-1 text-xs"
          >
            <option value="interval">interval</option>
            <option value="cron">cron</option>
          </select>
          {cadence === 'cron' ? (
            <input
              aria-label="cron expression"
              value={cron}
              onChange={(event) => setCron(event.target.value)}
              className="w-36 rounded border border-white/15 bg-transparent px-2 py-1 font-mono text-xs"
            />
          ) : (
            <input
              aria-label="schedule interval seconds"
              type="number"
              min={1}
              value={everySeconds}
              onChange={(event) =>
                setEverySeconds(Number(event.target.value) || 1)
              }
              className="w-20 rounded border border-white/15 bg-transparent px-2 py-1 text-xs"
            />
          )}
          <button
            disabled={!selectedTool}
            onClick={() => addSchedule.mutate()}
            className="rounded border border-white/15 px-2 py-1 text-xs disabled:opacity-40"
          >
            + Add schedule
          </button>
          {addSchedule.error && (
            <span className="text-xs text-rose-300">
              {addSchedule.error.message}
            </span>
          )}
        </div>
        <ul className="mt-2 space-y-1">
          {(schedules.data?.schedules ?? []).map((row) => (
            <li
              key={row.id}
              className="rounded border border-white/5 px-2 py-1 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-sky-300">{row.tool}</span>
                <span className="text-white/40">
                  {row.cron ?? `every ${row.everySeconds}s`}
                </span>
                <span className="text-white/30">
                  last: {date(row.lastRunAt)}
                </span>
                <button
                  onClick={() =>
                    changeSchedule.mutate({
                      id: row.id,
                      enabled: !row.enabled,
                    })
                  }
                  className="ml-auto"
                >
                  {row.enabled ? 'pause' : 'resume'}
                </button>
                <button
                  aria-label="Delete schedule"
                  onClick={() =>
                    changeSchedule.mutate({ id: row.id, delete: true })
                  }
                >
                  <TrashIcon />
                </button>
              </div>
              <div className="mt-1 text-white/30">
                upcoming: {row.upcoming.map(date).join(' | ') || 'paused'}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 text-xs uppercase text-white/40">Webhooks</div>
        <div className="mt-1 flex gap-2">
          <input
            aria-label="webhook argument mapping"
            value={mapping}
            onChange={(event) => setMapping(event.target.value)}
            className="w-52 rounded border border-white/15 bg-transparent px-2 py-1 font-mono text-xs"
          />
          <button
            disabled={!selectedTool}
            onClick={() => addWebhook.mutate()}
            className="rounded border border-white/15 px-2 py-1 text-xs disabled:opacity-40"
          >
            + Add webhook
          </button>
        </div>
        <ul className="mt-2 space-y-2">
          {(webhooks.data?.webhooks ?? []).map((row) => {
            const url = `${typeof window === 'undefined' ? '' : window.location.origin}/api/webhooks/${row.token}`
            return (
              <li
                key={row.token}
                className="rounded border border-white/5 p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sky-300">{row.tool}</span>
                  <code className="truncate text-white/40">{url}</code>
                  <button
                    className="ml-auto"
                    onClick={() => navigator.clipboard.writeText(url)}
                  >
                    copy
                  </button>
                  <button
                    aria-label="Delete webhook"
                    onClick={() => deleteWebhook.mutate(row.token)}
                  >
                    <TrashIcon />
                  </button>
                </div>
                <ul className="mt-1 space-y-1">
                  {(row.deliveries ?? []).map((delivery) => (
                    <li key={delivery.id} className="flex gap-2 text-white/40">
                      <span>{date(delivery.at)}</span>
                      <span>{delivery.status}</span>
                      {delivery.reason && (
                        <span className="text-rose-300">{delivery.reason}</span>
                      )}
                      <button
                        className="ml-auto text-white/70"
                        onClick={async () => {
                          await fetch(url, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify(delivery.payload),
                          })
                          refresh()
                        }}
                      >
                        retry
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
