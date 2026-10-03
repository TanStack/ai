/**
 * The channel's automations: the tool registry (public tools only, with run-now),
 * the schedule table (the dashboard's clock), and a webhook tester. All three
 * produce the same thing — an injected tool call whose structured result streams
 * into the channel via the feed tail.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { runInjection } from '@/lib/session-controller'
import type { MembershipRow } from '@/db/collections'

interface ToolInfo {
  name: string
  description: string
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
    void qc.invalidateQueries({ queryKey: ['offline'] })
  }

  const tools = useQuery<{ tools: Array<ToolInfo> }>({
    // Pass the harness so the registry is resolved directly — otherwise the
    // thread may not yet be noted with its harness and we'd get triage's tools.
    queryKey: ['tools', primary.threadId, primary.harness],
    queryFn: () =>
      fetch(
        `/api/tools?threadId=${primary.threadId}&harness=${encodeURIComponent(primary.harness)}`,
      ).then((r) => r.json()),
  })
  const offline = useQuery<{ offline: boolean; queued: number }>({
    queryKey: ['offline'],
    queryFn: () => fetch('/api/dev/offline').then((r) => r.json()),
    refetchInterval: 1500,
  })

  const toolNames = tools.data?.tools ?? []
  const selectedTool = toolNames[0]?.name || ''

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
  // The PR-watcher demo: a prompt-mode webhook drives the watcher's full run
  // (check_pr → channel_create → message_post). Each send is the next seeded PR.
  const sendPrWebhook = useMutation({
    mutationFn: async () => {
      const created = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: primary.threadId,
          channelId,
          harness: primary.harness,
          mode: 'prompt',
          message:
            'A PR webhook arrived. Check for a new PR and open a review channel.',
        }),
      }).then((r) => r.json())
      const token = created.webhook.token as string
      return fetch(`/api/webhooks/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event: 'pull_request' }),
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
              onClick={() =>
                runInjection(primary, t.name, { queue: 'run-now' })
              }
              className="rounded-md border border-white/15 px-2 py-1 font-mono text-xs text-white/70 hover:bg-white/[0.05]"
              title={t.description}
            >
              ▶ run {t.name}
            </button>
          ))}
        </div>
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
        {primary.harness === 'ops/pr-watcher' && (
          <button
            onClick={() => sendPrWebhook.mutate()}
            className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/[0.08]"
          >
            Send PR webhook
          </button>
        )}
        <button
          onClick={() => setOffline.mutate(!offline.data?.offline)}
          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/[0.05]"
        >
          {offline.data?.offline
            ? 'Bring host online'
            : 'Simulate host offline'}
        </button>
      </div>
    </div>
  )
}
