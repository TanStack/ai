import type { SubagentHandle } from '@tanstack/ai-client'

export function SubagentRow({ subagent }: { subagent: SubagentHandle }) {
  return (
    <p className="mb-1 flex items-center gap-2 text-sm text-gray-200">
      <span>
        {subagent.name}: {subagent.status}
      </span>
      {subagent.status === 'running' ? (
        <button
          type="button"
          onClick={() => subagent.stop?.()}
          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          Stop
        </button>
      ) : null}
    </p>
  )
}
