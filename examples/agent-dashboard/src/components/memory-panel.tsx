/**
 * Pod memory for one member. The human operator views the standing instructions
 * the agent has accumulated (and can add/remove them). This is the operational
 * memory the platform attaches to every run — visible mechanics, not hidden state.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FileTextIcon, TrashIcon } from '@phosphor-icons/react'

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
    <div role="group" aria-label={`memory ${name}`} className="space-y-2">
      <h2 className="label">Memory · {name}</h2>
      <ul className="space-y-1">
        {entries.length === 0 && (
          <li className="text-xs font-normal text-ink-3">no entries yet</li>
        )}
        {entries.map(([k, v]) => (
          <li key={k} className="group flex items-start gap-2 text-[13px]">
            <FileTextIcon size={14} className="mt-0.5 shrink-0 text-ink-3" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs break-all text-ink">{k}</div>
              <div
                className="line-clamp-2 text-xs font-normal text-ink-3"
                title={v}
              >
                {v}
              </div>
            </div>
            <button
              onClick={() => remove.mutate(k)}
              aria-label={`delete memory ${k}`}
              title="Delete"
              className="icon-btn shrink-0"
            >
              <TrashIcon size={13} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-1.5">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="memory key"
          placeholder="key"
          className="input w-20 min-w-0 py-1 text-xs"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="memory value"
          placeholder="value"
          className="input min-w-0 flex-1 py-1 text-xs"
        />
        <button
          onClick={() => add.mutate()}
          disabled={!key || !value}
          className="btn btn-sm btn-outline"
        >
          + Add entry
        </button>
      </div>
    </div>
  )
}
