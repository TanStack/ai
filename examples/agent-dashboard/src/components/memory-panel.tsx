/**
 * Pod memory for one member. The human operator views the standing instructions
 * the agent has accumulated (and can add/remove them). This is the operational
 * memory the platform attaches to every run — visible mechanics, not hidden state.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

export function MemoryPanel({
  threadId,
  name,
}: {
  threadId: string
  name: string
}) {
  const qc = useQueryClient()
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')

  const memory = useQuery<{ entries: Record<string, string> }>({
    queryKey: ['memory', threadId],
    queryFn: () =>
      fetch(`/api/memory?threadId=${encodeURIComponent(threadId)}`).then((r) =>
        r.json(),
      ),
    refetchInterval: 1500,
  })
  const invalidate = () =>
    void qc.invalidateQueries({ queryKey: ['memory', threadId] })

  const add = useMutation({
    mutationFn: () =>
      fetch('/api/memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId, key, value }),
      }).then((r) => r.json()),
    onSuccess: () => {
      setKey('')
      setValue('')
      invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: (k: string) =>
      fetch(
        `/api/memory?threadId=${encodeURIComponent(threadId)}&key=${encodeURIComponent(k)}`,
        { method: 'DELETE' },
      ).then((r) => r.json()),
    onSuccess: invalidate,
  })

  const entries = Object.entries(memory.data?.entries ?? {})

  return (
    <div
      role="group"
      aria-label={`memory ${name}`}
      className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-4"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-white/80">Memory · {name}</h2>
        <span className="text-xs text-white/40">
          attached to every run — no tokens until then
        </span>
      </div>
      <ul className="space-y-1">
        {entries.length === 0 && (
          <li className="text-xs text-white/40">no entries yet</li>
        )}
        {entries.map(([k, v]) => (
          <li
            key={k}
            className="flex items-start gap-2 rounded border border-white/5 px-2 py-1 text-xs"
          >
            <span className="font-mono text-amber-300">{k}</span>
            <span className="text-white/60">{v}</span>
            <button
              onClick={() => remove.mutate(k)}
              aria-label={`delete memory ${k}`}
              className="ml-auto rounded border border-white/15 px-1.5 text-white/50 hover:bg-white/[0.05]"
            >
              delete
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="memory key"
          placeholder="key"
          className="w-28 rounded border border-white/15 bg-transparent px-2 py-1 text-xs"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="memory value"
          placeholder="value"
          className="min-w-40 flex-1 rounded border border-white/15 bg-transparent px-2 py-1 text-xs"
        />
        <button
          onClick={() => add.mutate()}
          disabled={!key || !value}
          className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/[0.05] disabled:opacity-40"
        >
          + Add entry
        </button>
      </div>
    </div>
  )
}
