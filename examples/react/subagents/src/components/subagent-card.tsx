import type { ComponentType } from 'react'
import type { UIMessage } from '@tanstack/ai-react'

type SubagentPart = Extract<UIMessage['parts'][number], { type: 'subagent' }>

export function SubagentCard({
  part,
  SubagentMessages,
}: {
  part: SubagentPart
  SubagentMessages: ComponentType
}) {
  const subagent = part.subagent

  return (
    <section className="mt-3 rounded-lg border border-orange-500/30 bg-gray-900/80 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <strong className="text-sm text-orange-300">{subagent.name}</strong>
        <span className="text-xs text-gray-400">{subagent.status}</span>
        {subagent.status === 'running' ? (
          <button
            type="button"
            onClick={() => subagent.stop?.()}
            className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>
        ) : null}
      </header>
      {subagent.error ? (
        <p className="text-xs text-red-400">{subagent.error.message}</p>
      ) : null}
      <div className="mt-2">
        <SubagentMessages />
      </div>
    </section>
  )
}
