import type { SubagentPartsProps, SubagentProps } from '@tanstack/ai-react/ui'
import type { BlogChatOptions } from '@/chat-ui'

// Only the researcher card draws this tool. The keys come from the
// researcher's `tools`. The other parts use the root widgets from
// `chat-ui.tsx`.
const researcherTools: SubagentPartsProps<
  BlogChatOptions,
  'researcher'
>['toolsComponents'] = {
  lookupWikipedia: ({ part, result }) => (
    <details className="mb-2 rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-300">
      <summary className="cursor-pointer font-mono">
        lookupWikipedia({part.arguments}) ({part.state})
      </summary>
      <pre className="mt-1 whitespace-pre-wrap text-gray-400">
        {result === undefined
          ? 'No result yet'
          : typeof result.content === 'string'
            ? result.content
            : JSON.stringify(result.content)}
      </pre>
    </details>
  ),
}

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
      <div className="mt-2">
        <Parts toolsComponents={researcherTools} />
      </div>
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
