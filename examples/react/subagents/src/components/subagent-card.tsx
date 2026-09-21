import type { UIMessage } from '@tanstack/ai-react'

type SubagentPart = Extract<UIMessage['parts'][number], { type: 'subagent' }>

export function SubagentCard({ part }: { part: SubagentPart }) {
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
      {subagent.messages.map((message) => (
        <div key={message.id} className="mt-2">
          {message.parts.map((childPart, index) =>
            childPart.type === 'text' && childPart.content ? (
              <div
                key={`text-${index}`}
                className="whitespace-pre-wrap text-white"
              >
                {childPart.content}
              </div>
            ) : null,
          )}
        </div>
      ))}
    </section>
  )
}
