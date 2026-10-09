import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/ui'

export const Route = createFileRoute('/config')({
  component: Config,
})

type ConfigOption =
  | {
      type: 'select'
      options: Array<string>
      default: string
      description?: string
    }
  | { type: 'boolean'; default: boolean; description?: string }
  | { type: 'text'; default: string; description?: string }
  | {
      type: 'number'
      default: number
      min?: number
      max?: number
      description?: string
    }

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
    queryFn: () =>
      fetch(`/api/config?threadId=${THREAD}`).then((r) => r.json()),
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
    <div className="px-8 py-7">
      <PageHeader
        title="Config"
        sub={
          <>
            Generated from the agent's typed{' '}
            <code className="rounded-[4px] bg-ui px-1 font-mono text-xs">
              ConfigOption
            </code>{' '}
            schemas. Changes write through the harness protocol.
          </>
        }
      >
        <span className="font-mono text-[11px] text-ink-3">
          support/triage · protocol v{config.data?.protocolVersion ?? '…'}
        </span>
      </PageHeader>

      <div className="panel max-w-3xl divide-y divide-line py-1">
        {entries.length === 0 && (
          <p className="py-4 text-ink-3">Loading config…</p>
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
    <div className="grid grid-cols-[220px_1fr] items-center gap-6 py-4">
      <div>
        <div className="font-mono text-[13px]">{key}</div>
        {option.description && (
          <div className="mt-0.5 text-xs text-ink-3">{option.description}</div>
        )}
      </div>
      <div>
        {option.type === 'select' && (
          <select
            aria-label={key}
            value={String(value)}
            onChange={(e) => onChange(e.target.value)}
            className="input"
          >
            {option.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        {option.type === 'boolean' && (
          <button
            onClick={() => onChange(!value)}
            aria-label={key}
            aria-pressed={Boolean(value)}
            className={`relative h-4 w-7 rounded-full transition-colors duration-150 ${value ? 'bg-ink' : 'bg-line-strong'}`}
          >
            <span
              className={`absolute top-0.5 size-3 rounded-full bg-surface transition-[left] duration-150 ${value ? 'left-3.5' : 'left-0.5'}`}
            />
          </button>
        )}
        {option.type === 'text' && (
          <input
            defaultValue={String(value)}
            onBlur={(e) => onChange(e.target.value)}
            className="input w-full max-w-sm"
          />
        )}
        {option.type === 'number' && (
          <input
            type="number"
            defaultValue={Number(value)}
            min={option.min}
            max={option.max}
            onBlur={(e) => onChange(Number(e.target.value))}
            className="input w-28"
          />
        )}
      </div>
    </div>
  )
}
