import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { StructuredOutputPart } from '@tanstack/ai-client'
import { RecipeSchema, type Recipe } from './api.structured-chat'

const SUGGESTIONS = [
  'Pasta dinner for two, under $15 total',
  'Now make it vegan',
  'Make it gluten-free and add a salad',
] as const

/**
 * Multi-turn structured chat. Demonstrates that every assistant message
 * carries its own typed structured-output part — old turns are still
 * renderable as history, the latest one streams progressively.
 *
 * Reads `messages` directly rather than the hook-level `partial`/`final`
 * sugar; those two are derived from the latest assistant message's part, so
 * walking `messages` is the path that exposes history.
 */
function StructuredChatPage() {
  const [input, setInput] = useState('')

  const { messages, sendMessage, isLoading, partial, final } = useChat({
    outputSchema: RecipeSchema,
    connection: fetchServerSentEvents('/api/structured-chat'),
  })

  const handleSubmit = async (text: string) => {
    if (!text.trim() || isLoading) return
    setInput('')
    await sendMessage(text.trim())
  }

  // Pair each assistant message with the user message that prompted it so
  // we can render a clean two-column "prompt → recipe" history view.
  const turns: Array<{
    userPrompt: string
    recipePart: StructuredOutputPart | null
    isLast: boolean
  }> = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (!m || m.role !== 'user') continue
    const next = messages[i + 1]
    const promptText = m.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { content: string }).content)
      .join('')
    const recipePart =
      next && next.role === 'assistant'
        ? ((next.parts.find((p) => p.type === 'structured-output') as
            | StructuredOutputPart
            | undefined) ?? null)
        : null
    turns.push({
      userPrompt: promptText,
      recipePart,
      isLast: i === messages.length - 1 || i + 1 === messages.length - 1,
    })
  }

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <h2 className="text-xl font-semibold">Structured Chat</h2>
        <p className="text-sm text-gray-400 mt-1">
          Every assistant turn carries its own typed{' '}
          <code className="text-orange-400">structured-output</code> part on the
          assistant <code className="text-orange-400">UIMessage</code>. Walk{' '}
          <code className="text-orange-400">messages</code> to render the full
          history; the hook-level{' '}
          <code className="text-orange-400">partial</code> /{' '}
          <code className="text-orange-400">final</code> are derived from the
          latest turn.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {turns.length === 0 && (
            <div className="text-sm text-gray-500">
              Try one of:
              <ul className="mt-2 space-y-1">
                {SUGGESTIONS.map((s) => (
                  <li key={s}>
                    <button
                      onClick={() => handleSubmit(s)}
                      className="text-orange-400 hover:text-orange-300 text-left"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {turns.map((turn, idx) => (
            <div key={idx} className="space-y-2">
              <div className="text-xs uppercase tracking-wider text-gray-500">
                You
              </div>
              <div className="text-sm text-gray-200">{turn.userPrompt}</div>
              <div className="text-xs uppercase tracking-wider text-gray-500 mt-3">
                Recipe
              </div>
              {turn.recipePart ? (
                <RecipeCard part={turn.recipePart} />
              ) : (
                <div className="text-sm text-gray-500 italic">
                  {isLoading ? 'Streaming…' : 'No response yet'}
                </div>
              )}
            </div>
          ))}

          {turns.length > 0 && (
            <div className="border-t border-gray-800 pt-4 text-xs text-gray-500">
              <div>
                <span className="text-gray-400">Latest `final`:</span>{' '}
                {final ? final.title : <em>null</em>}
              </div>
              <div>
                <span className="text-gray-400">Latest `partial.title`:</span>{' '}
                {(partial as { title?: string })?.title ?? <em>—</em>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleSubmit(input)
              }
            }}
            placeholder='e.g. "pasta dinner for two, under $15"'
            disabled={isLoading}
            className="flex-1 rounded-lg border border-orange-500/20 bg-gray-900 px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
          />
          <button
            onClick={() => handleSubmit(input)}
            disabled={!input.trim() || isLoading}
            className="px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isLoading ? 'Streaming…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RecipeCard({ part }: { part: StructuredOutputPart }) {
  // `partial` is always populated during streaming; `data` lands on complete.
  // Read whichever is freshest — they converge once `status === 'complete'`.
  const recipe = (part.data ?? part.partial ?? {}) as Partial<Recipe>
  const streaming = part.status === 'streaming'

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        streaming
          ? 'border-orange-500/40 bg-gray-800/50'
          : part.status === 'error'
            ? 'border-red-500/40 bg-red-500/5'
            : 'border-gray-700 bg-gray-800/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">
          {recipe.title || (
            <span className="text-gray-500 italic">Generating…</span>
          )}
        </h3>
        {streaming && (
          <span className="inline-block w-2 h-2 mt-2 rounded-full bg-orange-400 animate-pulse" />
        )}
      </div>
      {(recipe.cuisine ||
        recipe.servings ||
        recipe.estimatedCostUsd !== undefined) && (
        <p className="text-xs text-gray-400 mt-1">
          {recipe.cuisine}
          {recipe.servings ? ` · serves ${recipe.servings}` : ''}
          {recipe.estimatedCostUsd !== undefined
            ? ` · ~$${recipe.estimatedCostUsd.toFixed(2)}`
            : ''}
        </p>
      )}
      {recipe.ingredients && recipe.ingredients.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-gray-500">
            Ingredients
          </p>
          <ul className="text-sm text-gray-200 mt-1 space-y-0.5">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {ing?.amount} {ing?.item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {recipe.steps && recipe.steps.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-gray-500">
            Steps
          </p>
          <ol className="text-sm text-gray-200 mt-1 list-decimal list-inside space-y-1">
            {recipe.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}
      {recipe.tips && recipe.tips.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wider text-gray-500">Tips</p>
          <ul className="text-sm text-gray-400 mt-1 list-disc list-inside space-y-0.5">
            {recipe.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </div>
      )}
      {part.status === 'error' && (
        <p className="text-sm text-red-400 mt-3">
          {part.errorMessage ?? 'Stream failed'}
        </p>
      )}
    </div>
  )
}

export const Route = createFileRoute('/generations/structured-chat')({
  component: StructuredChatPage,
})
