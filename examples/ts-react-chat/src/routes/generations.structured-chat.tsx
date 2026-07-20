import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import {  RecipeSchema } from './api.structured-chat'
import type {Recipe} from './api.structured-chat';
import type { StructuredOutputPart } from '@tanstack/ai-client'

// Structured-output part typed by the schema we passed to `useChat`. Pulled
// out of the loop's lambda to keep the find() predicate readable.
type RecipePart = StructuredOutputPart<Recipe>

const SUGGESTIONS: ReadonlyArray<{ emoji: string; text: string; tag: string }> =
  [
    {
      emoji: '🍝',
      text: 'Pasta dinner for two, under $15 total',
      tag: 'Italian',
    },
    {
      emoji: '🌮',
      text: 'A quick weeknight taco bowl',
      tag: 'Mexican',
    },
    {
      emoji: '🥗',
      text: 'High-protein vegetarian lunch, 20 minutes',
      tag: 'Healthy',
    },
    {
      emoji: '🍜',
      text: 'Comforting noodle soup for a rainy day',
      tag: 'Asian',
    },
  ]

/**
 * Pick a food emoji per cuisine label. Defaults to a generic plate when the
 * model returns something we haven't mapped.
 */
function cuisineEmoji(cuisine: string | undefined): string {
  if (!cuisine) return '🍽️'
  const c = cuisine.toLowerCase()
  if (c.includes('italian')) return '🍝'
  if (c.includes('mexican')) return '🌮'
  if (c.includes('japanese') || c.includes('sushi')) return '🍣'
  if (c.includes('chinese')) return '🥡'
  if (c.includes('thai')) return '🍜'
  if (c.includes('indian')) return '🍛'
  if (c.includes('french')) return '🥖'
  if (c.includes('greek') || c.includes('mediterranean')) return '🫒'
  if (c.includes('spanish')) return '🥘'
  if (c.includes('american') || c.includes('bbq') || c.includes('barbecue'))
    return '🍔'
  if (c.includes('vietnamese')) return '🍲'
  if (c.includes('korean')) return '🍱'
  if (c.includes('middle eastern') || c.includes('lebanese')) return '🧆'
  return '🍽️'
}

/**
 * Multi-turn structured chat — every assistant message carries its own typed
 * structured-output part, so old turns stay renderable as history and the
 * latest one streams progressively.
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

  // Show the "Cooking up your recipe…" placeholder only while we're between
  // sendMessage() and the first assistant chunk on a fresh turn.
  const isAwaitingFirstChunk =
    isLoading && messages[messages.length - 1]?.role === 'user'

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gradient-to-b from-stone-50 to-amber-50 text-stone-900">
      <div className="border-b border-amber-200/60 bg-white/70 backdrop-blur px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="text-3xl">👨‍🍳</div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-stone-900">
              Sous Chef
            </h2>
            <p className="text-sm text-stone-600">
              Tell me what you're in the mood for. I'll plate up a recipe — and
              I'll remember the last one if you want me to tweak it.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {messages.length === 0 && <EmptyState onPick={handleSubmit} />}

          {messages.map((m) => {
            if (m.role === 'user') {
              const text = m.parts
                .filter((p) => p.type === 'text')
                .map((p) => p.content)
                .join('')
              return <UserPrompt key={m.id} text={text} />
            }
            if (m.role === 'assistant') {
              const recipePart = m.parts.find(
                (p): p is RecipePart => p.type === 'structured-output',
              )
              if (!recipePart) return null
              return <RecipeCard key={m.id} part={recipePart} />
            }
            return null
          })}

          {isAwaitingFirstChunk && <CookingPlaceholder />}

          {messages.length > 0 && (
            <div className="rounded-xl border border-amber-200/60 bg-white/50 px-4 py-3 text-xs text-stone-500 font-mono">
              <div className="flex justify-between gap-4">
                <span>
                  <span className="text-stone-400">latest final →</span>{' '}
                  {final ? (
                    <span className="text-stone-800">{final.title}</span>
                  ) : (
                    <em className="text-stone-400">null</em>
                  )}
                </span>
                <span>
                  <span className="text-stone-400">partial.title →</span>{' '}
                  {partial.title ? (
                    <span className="text-stone-800">{partial.title}</span>
                  ) : (
                    <em className="text-stone-400">—</em>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-amber-200/60 bg-white/70 backdrop-blur px-6 py-4">
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
            placeholder="What should we cook?"
            disabled={isLoading}
            className="flex-1 rounded-full border border-stone-200 bg-white px-5 py-3 text-sm text-stone-900 placeholder-stone-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-300 disabled:opacity-50 transition"
          />
          <button
            onClick={() => handleSubmit(input)}
            disabled={!input.trim() || isLoading}
            className="px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-stone-200 disabled:text-stone-400 text-white rounded-full text-sm font-medium shadow-sm transition-colors"
          >
            {isLoading ? 'Cooking…' : 'Cook'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="text-center py-8">
      <div className="text-6xl mb-3">🥘</div>
      <h3 className="text-2xl font-semibold tracking-tight text-stone-900">
        What's for dinner?
      </h3>
      <p className="text-sm text-stone-600 mt-1">
        Try one of these, or describe what you're in the mood for below.
      </p>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.text}
            onClick={() => onPick(s.text)}
            className="group flex items-start gap-3 text-left rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm hover:border-amber-300 hover:shadow-md transition"
          >
            <span className="text-2xl shrink-0">{s.emoji}</span>
            <span className="flex-1">
              <span className="block text-sm text-stone-900 group-hover:text-amber-700 transition-colors">
                {s.text}
              </span>
              <span className="block text-[11px] uppercase tracking-wider text-stone-400 mt-0.5">
                {s.tag}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function UserPrompt({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-amber-600 text-white px-4 py-2.5 shadow-sm">
        <div className="text-[10px] uppercase tracking-wider text-amber-100/80 mb-0.5">
          You asked
        </div>
        <div className="text-sm leading-relaxed">{text}</div>
      </div>
    </div>
  )
}

function CookingPlaceholder() {
  return (
    <div className="rounded-3xl border border-amber-200/60 bg-white/60 px-6 py-8 text-center">
      <div className="text-3xl animate-bounce">🍳</div>
      <p className="text-sm text-stone-600 mt-2">Cooking up your recipe…</p>
    </div>
  )
}

function RecipeCard({ part }: { part: RecipePart }) {
  // `partial` is always populated during streaming; `data` lands on complete.
  // Read whichever is freshest — they converge once `status === 'complete'`.
  // Both fields are typed via the schema, so `recipe.title` etc. accesses
  // below are checked at compile time.
  const recipe = part.data ?? part.partial ?? ({})
  const streaming = part.status === 'streaming'
  const errored = part.status === 'error'

  const emoji = cuisineEmoji(recipe.cuisine)

  return (
    <article
      className={`relative overflow-hidden rounded-3xl border bg-white shadow-sm transition ${
        streaming
          ? 'border-amber-300/80 shadow-amber-100'
          : errored
            ? 'border-red-300/80'
            : 'border-stone-200'
      }`}
    >
      {/* Hero banner — stands in for a food photo. The cuisine emoji moves
          into the gradient once the model lands the cuisine field. */}
      <div className="relative h-32 bg-gradient-to-br from-amber-200 via-orange-200 to-rose-200 flex items-center justify-center">
        <span className="text-6xl drop-shadow-sm">{emoji}</span>
        {streaming && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[10px] uppercase tracking-wider text-amber-700 font-medium shadow-sm">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Streaming
          </div>
        )}
        {errored && (
          <div className="absolute top-3 right-3 rounded-full bg-red-500/90 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white font-medium shadow-sm">
            Failed
          </div>
        )}
      </div>

      <div className="p-6">
        <h3 className="text-2xl font-serif font-semibold tracking-tight text-stone-900">
          {recipe.title || (
            <span className="text-stone-400 italic">Plating up…</span>
          )}
        </h3>

        {(recipe.cuisine ||
          recipe.servings ||
          recipe.estimatedCostUsd !== undefined) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {recipe.cuisine && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 font-medium">
                {recipe.cuisine}
              </span>
            )}
            {recipe.servings !== undefined && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 text-stone-700 px-2.5 py-1">
                <span>👥</span>
                Serves {recipe.servings}
              </span>
            )}
            {recipe.estimatedCostUsd !== undefined && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 text-stone-700 px-2.5 py-1">
                <span>💵</span>~${recipe.estimatedCostUsd.toFixed(2)}
              </span>
            )}
          </div>
        )}

        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <section className="mt-6">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 flex items-center gap-2">
              <span>🧂</span> Ingredients
            </h4>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {recipe.ingredients.map((ing, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-2 text-sm text-stone-700"
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 translate-y-[-2px]" />
                  <span>
                    <span className="font-medium text-stone-900">
                      {ing?.amount}
                    </span>{' '}
                    <span>{ing?.item}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {recipe.steps && recipe.steps.length > 0 && (
          <section className="mt-6">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 flex items-center gap-2">
              <span>📝</span> Method
            </h4>
            <ol className="mt-3 space-y-3">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-600 text-white text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-stone-700">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {recipe.tips && recipe.tips.length > 0 && (
          <section className="mt-6 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700 flex items-center gap-2">
              <span>💡</span> Chef's Tips
            </h4>
            <ul className="mt-2 space-y-1.5">
              {recipe.tips.map((tip, i) => (
                <li
                  key={i}
                  className="text-sm text-stone-700 flex items-start gap-2"
                >
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {errored && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <span className="font-medium">Failed:</span>{' '}
            {part.errorMessage ?? 'Stream failed'}
          </div>
        )}
      </div>
    </article>
  )
}

export const Route = createFileRoute('/generations/structured-chat')({
  component: StructuredChatPage,
})
