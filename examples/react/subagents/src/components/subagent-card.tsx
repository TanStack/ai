import type { SubagentProps } from '@tanstack/ai-react/ui'
import type { BlogChatOptions } from '@/chat-ui'

function SubagentShell({ subagent, Parts }: SubagentProps<BlogChatOptions>) {
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
        <Parts />
      </div>
    </section>
  )
}

export function Researcher(
  props: SubagentProps<BlogChatOptions, 'researcher'>,
) {
  return <SubagentShell {...props} />
}

export function Writer(props: SubagentProps<BlogChatOptions, 'writer'>) {
  return <SubagentShell {...props} />
}
