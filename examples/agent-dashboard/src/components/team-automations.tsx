import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  CopyIcon,
  TimerIcon,
  TrashIcon,
  WebhooksLogoIcon,
} from '@phosphor-icons/react'
import { clock } from '@/components/ui'
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
    <section className="space-y-4">
      <h2 className="label">Automations</h2>
      <div className="grid grid-cols-2 gap-1.5">
        <select
          aria-label="automation agent"
          value={member.threadId}
          onChange={(event) => {
            setThreadId(event.target.value)
            setTool('')
          }}
          className="input min-w-0 py-1 text-xs"
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
          className="input min-w-0 py-1 font-mono text-xs"
        >
          {toolNames.map((item) => (
            <option key={item.name}>{item.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[13px] font-normal text-ink-2">
          <TimerIcon size={14} className="text-ink-3" />
          Timers
        </div>
        <div className="flex gap-1.5">
          <select
            aria-label="schedule cadence"
            value={cadence}
            onChange={(event) =>
              setCadence(event.target.value as 'interval' | 'cron')
            }
            className="input py-1 text-xs"
          >
            <option value="interval">interval</option>
            <option value="cron">cron</option>
          </select>
          {cadence === 'cron' ? (
            <input
              aria-label="cron expression"
              value={cron}
              onChange={(event) => setCron(event.target.value)}
              className="input min-w-0 flex-1 py-1 font-mono text-xs"
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
              className="input min-w-0 flex-1 py-1 text-xs"
            />
          )}
          <button
            disabled={!selectedTool}
            onClick={() => addSchedule.mutate()}
            className="btn btn-sm btn-outline"
          >
            + Add schedule
          </button>
        </div>
        {addSchedule.error && (
          <p className="text-xs text-err">{addSchedule.error.message}</p>
        )}
        <ul className="divide-y divide-line">
          {(schedules.data?.schedules ?? []).map((row) => (
            <li key={row.id} className="space-y-1 py-2 text-xs">
              <div className="flex items-center gap-2">
                <button
                  aria-pressed={row.enabled}
                  aria-label={row.enabled ? 'pause' : 'resume'}
                  onClick={() =>
                    changeSchedule.mutate({
                      id: row.id,
                      enabled: !row.enabled,
                    })
                  }
                  className={`relative h-4 w-7 shrink-0 rounded-full transition-colors duration-150 ${row.enabled ? 'bg-ink' : 'bg-line-strong'}`}
                >
                  <span
                    className={`absolute top-0.5 size-3 rounded-full bg-surface transition-[left] duration-150 ${row.enabled ? 'left-3.5' : 'left-0.5'}`}
                  />
                </button>
                <span className="truncate font-mono text-ink">{row.tool}</span>
                <span
                  className="ml-auto shrink-0 font-normal text-ink-2"
                  title={row.cron}
                >
                  {row.cron ?? `every ${row.everySeconds}s`}
                </span>
                <button
                  aria-label="Delete schedule"
                  onClick={() =>
                    changeSchedule.mutate({ id: row.id, delete: true })
                  }
                  className="icon-btn"
                >
                  <TrashIcon size={13} />
                </button>
              </div>
              <div className="font-normal text-ink-3">
                last: {date(row.lastRunAt)}
              </div>
              <div className="font-mono text-[11px] text-ink-3">
                upcoming: {row.upcoming.map(date).join(' | ') || 'paused'}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-[13px] font-normal text-ink-2">
          <WebhooksLogoIcon size={14} className="text-ink-3" />
          Webhooks
        </div>
        <div className="flex gap-1.5">
          <input
            aria-label="webhook argument mapping"
            value={mapping}
            onChange={(event) => setMapping(event.target.value)}
            className="input min-w-0 flex-1 py-1 font-mono text-xs"
          />
          <button
            disabled={!selectedTool}
            onClick={() => addWebhook.mutate()}
            className="btn btn-sm btn-outline"
          >
            + Add webhook
          </button>
        </div>
        <ul className="space-y-2">
          {(webhooks.data?.webhooks ?? []).map((row) => {
            const url = `${typeof window === 'undefined' ? '' : window.location.origin}/api/webhooks/${row.token}`
            return (
              <li
                key={row.token}
                className="space-y-2 rounded-md bg-surface-raised p-2.5 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-ink">
                    {row.tool}
                  </span>
                  <span className="pill ml-auto bg-ok-soft text-ok">
                    listening
                  </span>
                  <button
                    aria-label="Delete webhook"
                    onClick={() => deleteWebhook.mutate(row.token)}
                    className="icon-btn"
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
                <div className="flex items-center gap-1 rounded-sm bg-surface-sunken py-1 pr-1 pl-2">
                  <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">
                    {url}
                  </code>
                  <button
                    aria-label="copy"
                    title="Copy"
                    onClick={() => navigator.clipboard.writeText(url)}
                    className="icon-btn"
                  >
                    <CopyIcon size={13} />
                  </button>
                </div>
                <ul className="space-y-1">
                  {(row.deliveries ?? []).map((delivery) => (
                    <li
                      key={delivery.id}
                      className="flex items-center gap-2 font-normal"
                    >
                      <span
                        className={`font-mono ${delivery.reason ? 'text-err' : 'text-ok'}`}
                      >
                        {delivery.status}
                      </span>
                      {delivery.reason && (
                        <span className="truncate text-err">
                          {delivery.reason}
                        </span>
                      )}
                      <span className="ml-auto font-mono text-[11px] text-ink-3">
                        {clock(delivery.at)}
                      </span>
                      <button
                        className="btn btn-sm btn-ghost px-1.5 py-0.5"
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
