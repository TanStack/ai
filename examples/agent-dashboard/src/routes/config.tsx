import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export const Route = createFileRoute('/config')({
  component: Config,
})

type ConfigOption =
  | { type: 'select'; options: Array<string>; default: string; description?: string }
  | { type: 'boolean'; default: boolean; description?: string }
  | { type: 'text'; default: string; description?: string }
  | { type: 'number'; default: number; min?: number; max?: number; description?: string }

interface ConfigEntry {
  key: string
  option: ConfigOption
  value: unknown
  owner: string
}

const THREAD = 'settings'

function Config() {
  const qc = useQueryClient()
  const config = useQuery<{
    protocolVersion: number
    options: Array<ConfigEntry>
  }>({
    queryKey: ['config', THREAD],
    queryFn: () => fetch(`/api/config?threadId=${THREAD}`).then((r) => r.json()),
  })

  const setValue = useMutation({
    mutationFn: (vars: { key: string; value: unknown }) =>
      fetch('/api/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId: THREAD, ...vars }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config', THREAD] }),
  })

  const entries = config.data?.options ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Agent config</h1>
        <span className="ml-auto text-xs text-white/40">
          support/triage · protocol v{config.data?.protocolVersion ?? '…'}
        </span>
      </div>
      <p className="text-sm text-white/50">
        Generated from the agent's typed <code>ConfigOption</code> schemas.
        Changes write through the harness protocol.
      </p>

      <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.02] p-5">
        {entries.length === 0 && (
          <p className="text-sm text-white/40">Loading config…</p>
        )}
        {entries.map((entry) => (
          <Field
            key={entry.key}
            entry={entry}
            onChange={(value) => setValue.mutate({ key: entry.key, value })}
          />
        ))}
      </div>
    </div>
  )
}

function Field({
  entry,
  onChange,
}: {
  entry: ConfigEntry
  onChange: (value: unknown) => void
}) {
  const { key, option, value } = entry
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-4">
      <div>
        <div className="font-mono text-sm">{key}</div>
        {option.description && (
          <div className="text-xs text-white/40">{option.description}</div>
        )}
      </div>
      <div>
        {option.type === 'select' && (
          <select
            aria-label={key}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm outline-none"
          >
            {option.options.map((o) => (
              <option key={o} value={o} className="bg-[#0b0d12]">
                {o}
              </option>
            ))}
          </select>
        )}
        {option.type === 'boolean' && (
          <button
            onClick={() => onChange(!value)}
            className={`rounded-full px-3 py-1 text-xs ${
              value
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-white/10 text-white/60'
            }`}
          >
            {value ? 'on' : 'off'}
          </button>
        )}
        {option.type === 'text' && (
          <input
            defaultValue={String(value)}
            onBlur={(e) => onChange(e.target.value)}
            className="w-full max-w-sm rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm outline-none"
          />
        )}
        {option.type === 'number' && (
          <input
            type="number"
            defaultValue={Number(value)}
            min={option.min}
            max={option.max}
            onBlur={(e) => onChange(Number(e.target.value))}
            className="w-28 rounded-md border border-white/15 bg-transparent px-3 py-1.5 text-sm outline-none"
          />
        )}
      </div>
    </div>
  )
}
