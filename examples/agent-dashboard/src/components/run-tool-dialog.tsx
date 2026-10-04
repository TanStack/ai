/**
 * Run a public tool on a team member, out-of-band. Pick a tool from the
 * member's harness (`/api/tools`), supply JSON parameters, and inject it via
 * `runInjection` — the result streams back into the channel like any other tool
 * call. A product control (the roster's per-agent "🔧 tools" button), distinct
 * from the demo panel's run-now.
 */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { XIcon } from '@phosphor-icons/react'
import { runInjection } from '@/lib/session-controller'
import type { MembershipRow } from '@/db/collections'

interface ToolInfo {
  name: string
  description: string
}

export function RunToolDialog({
  member,
  onClose,
}: {
  member: MembershipRow
  onClose: () => void
}) {
  const tools = useQuery<{ tools: Array<ToolInfo> }>({
    queryKey: ['tools', member.threadId, member.harness],
    queryFn: () =>
      fetch(
        `/api/tools?threadId=${member.threadId}&harness=${encodeURIComponent(member.harness)}`,
      ).then((r) => r.json()),
  })
  const toolNames = tools.data?.tools ?? []
  const [tool, setTool] = useState('')
  const [argsText, setArgsText] = useState('{}')
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState<string | undefined>()
  const selected = tool || toolNames[0]?.name || ''
  const selectedInfo = toolNames.find((t) => t.name === selected)

  const run = async () => {
    setError(undefined)
    setResult(undefined)
    let args: Record<string, unknown>
    try {
      args = argsText.trim() ? JSON.parse(argsText) : {}
    } catch {
      setError('Parameters must be valid JSON.')
      return
    }
    if (!selected) return
    const res = await runInjection(member, selected, args)
    if (res.status === 'rejected') {
      setError(res.reason ?? 'Tool was rejected.')
      return
    }
    setResult(`${selected} ${res.status} — result streaming into the channel.`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg border border-line bg-surface-raised p-5 shadow-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[17px] font-bold">
            Run a tool · {member.displayName}
          </h2>
          <button
            onClick={onClose}
            aria-label="Dismiss dialog"
            className="icon-btn"
          >
            <XIcon size={14} />
          </button>
        </div>

        {toolNames.length === 0 ? (
          <p className="text-[13px] text-ink-3">
            {tools.isLoading
              ? 'Loading tools…'
              : 'This agent has no public tools to run.'}
          </p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="label">Tool</span>
              <select
                aria-label="tool"
                value={selected}
                onChange={(e) => setTool(e.target.value)}
                className="input w-full font-mono"
              >
                {toolNames.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedInfo?.description && (
              <p className="text-[13px] text-ink-2">
                {selectedInfo.description}
              </p>
            )}
            <label className="block space-y-1">
              <span className="label">Parameters (JSON)</span>
              <textarea
                aria-label="parameters"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                rows={4}
                spellCheck={false}
                className="input w-full bg-surface-sunken font-mono text-xs"
              />
            </label>
            {error && <p className="text-xs text-err">{error}</p>}
            {result && <p className="text-xs text-ok">{result}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn btn-outline">
                Close
              </button>
              <button onClick={() => void run()} className="btn btn-accent">
                Run
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
