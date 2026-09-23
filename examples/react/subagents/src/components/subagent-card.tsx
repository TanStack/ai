import type { SubagentProps } from '@tanstack/ai-react/ui'
import type { BlogChatOptions } from '@/chat-ui'

function AgentHeader({
  name,
  status,
  onStop,
}: {
  name: string
  status: string
  onStop?: () => void
}) {
  return (
    <header className="mb-3 flex flex-wrap items-center gap-2">
      <strong className="text-sm uppercase tracking-wide">{name}</strong>
      <span className="text-xs opacity-70">{status}</span>
      {status === 'running' && onStop ? (
        <button
          type="button"
          onClick={onStop}
          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          Stop
        </button>
      ) : null}
    </header>
  )
}

export function Researcher({
  subagent,
  Parts,
}: SubagentProps<BlogChatOptions, 'researcher'>) {
  return (
    <section className="mt-3 rounded-lg border border-orange-500/30 bg-gray-900/80 p-3 text-gray-100">
      <AgentHeader
        name={subagent.name}
        status={subagent.status}
        onStop={subagent.stop}
      />
      {subagent.error ? (
        <p className="text-xs text-red-400">{subagent.error.message}</p>
      ) : null}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs opacity-70">
          Research notes
        </summary>
        <div className="mt-2">
          <Parts />
        </div>
      </details>
    </section>
  )
}

export function Seo({
  subagent,
  Parts,
}: SubagentProps<BlogChatOptions, 'seo'>) {
  return (
    <section className="mt-3 rounded-lg border border-sky-500/40 bg-gray-900/80 p-3 text-gray-100">
      <AgentHeader
        name={subagent.name}
        status={subagent.status}
        onStop={subagent.stop}
      />
      {subagent.error ? (
        <p className="text-xs text-red-400">{subagent.error.message}</p>
      ) : null}
      <div className="mt-2">
        <Parts />
      </div>
    </section>
  )
}

export function Writer({
  subagent,
  Parts,
}: SubagentProps<BlogChatOptions, 'writer'>) {
  return (
    <article className="writer-article">
      <AgentHeader
        name={subagent.name}
        status={subagent.status}
        onStop={subagent.stop}
      />
      {subagent.error ? (
        <p className="text-sm text-red-700">{subagent.error.message}</p>
      ) : null}
      <Parts />
    </article>
  )
}
