import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import {
  addToCartToolDef,
  getGuitarsToolDef,
  recommendGuitarToolDef,
} from '@/lib/guitar-tools'

/**
 * Manual type-safety confirmation for passing a BARE inline `tools` array to
 * `useChat` — no `clientTools(...)` wrapper and no `as const`. The `const`
 * modifier on `useChat`'s `TTools` param now captures the tuple + literal tool
 * names, so tool-call parts narrow on `part.name` and expose per-tool typed
 * `input` / `output`.
 *
 * The assertions below are the real proof: this file only compiles if
 * inference works. If the `const` modifier regressed, `part.name` would widen
 * to `string`, the `===` checks would stop narrowing, and the typed field
 * access (`.output.id` as `number`, `.input.quantity` as `number`) would error.
 */
function TypesafeToolsPage() {
  const [prompt, setPrompt] = useState('Recommend me an acoustic guitar.')

  const { messages, sendMessage, isLoading, error } = useChat({
    id: 'typesafe-tools-bare-array',
    connection: fetchServerSentEvents('/api/tanchat'),
    body: { provider: 'openai', model: 'gpt-5.5' },
    // 👇 Bare array literal — no clientTools(), no `as const`.
    tools: [
      getGuitarsToolDef,
      recommendGuitarToolDef.client(({ id }) => ({ id: Number(id) })),
      addToCartToolDef.client((args) => ({
        success: true,
        cartId: `CART_${args.guitarId}`,
        guitarId: args.guitarId,
        quantity: args.quantity,
        totalItems: args.quantity,
      })),
    ],
  })

  const toolCalls = messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === 'tool-call')

  // Hard regression guard: this assignment only compiles when the bare array
  // preserved the literal tool names. If inference widened `part.name` to
  // `string` (the pre-`const` behaviour), assigning it to the literal union
  // below is a type error — so this file failing to compile IS the signal.
  const _assertToolNames: Array<
    'getGuitars' | 'recommendGuitar' | 'addToCart'
  > = toolCalls.map((part) => part.name)
  void _assertToolNames

  // `approval` is gated on the tool's `needsApproval` flag. `addToCart` is
  // defined with `needsApproval: true`, so its part carries `approval`;
  // `getGuitars` isn't, so the field doesn't exist on its part at all.
  const _assertApprovalGating = () => {
    for (const part of toolCalls) {
      if (part.name === 'addToCart') {
        void part.approval // ✅ present — addToCart is needsApproval: true
      }
      if (part.name === 'getGuitars') {
        // @ts-expect-error - getGuitars has no needsApproval, so no `approval`
        void part.approval
      }
    }
  }
  void _assertApprovalGating

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        <header>
          <p className="text-sm font-medium uppercase tracking-wider text-orange-300">
            Type-safety confirmation
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            Bare inline <code>tools</code> array
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-300">
            <code>tools</code> is a plain array literal — no{' '}
            <code>clientTools(...)</code> wrapper, no <code>as const</code>.
            Tool-call parts below are fully narrowed on <code>part.name</code>.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-24 rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm outline-none focus:border-orange-400"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isLoading || !prompt.trim()}
              onClick={() => sendMessage(prompt)}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-gray-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Send
            </button>
            <span className="text-sm text-gray-400">
              {error ? error.message : isLoading ? 'Running…' : 'Ready'}
            </span>
          </div>
        </div>

        <section className="flex flex-col gap-3">
          {toolCalls.map((part) => {
            // `part.name` is narrowed to the literal union of the three tool
            // names — proven by the discriminated access below. In each branch
            // `part.input` (parsed, populated at runtime) and `part.output` are
            // typed to that specific tool's schema.
            if (part.name === 'recommendGuitar') {
              const id = part.output?.id

              return (
                <ToolRow key={part.id} part={part}>
                  → recommended guitar id: <b>{id ?? '—'}</b> (typed{' '}
                  <code>number</code>)
                </ToolRow>
              )
            }
            if (part.name === 'addToCart') {
              const quantity = part.input?.quantity

              return (
                <ToolRow key={part.id} part={part}>
                  → guitar <b>{part.input?.guitarId ?? '—'}</b> ×{' '}
                  <b>{quantity ?? '—'}</b> (quantity typed <code>number</code>)
                </ToolRow>
              )
            }
            if (part.name === 'getGuitars') {
              const count = part.output?.length

              return (
                <ToolRow key={part.id} part={part}>
                  → <b>{count ?? '—'}</b> guitars returned
                </ToolRow>
              )
            }
            return null
          })}
          {toolCalls.length === 0 && (
            <p className="text-sm text-gray-500">
              No tool calls yet — send a message to trigger the tools.
            </p>
          )}
        </section>
      </div>
    </main>
  )
}

function ToolRow({
  part,
  children,
}: {
  part: { name: string; input?: unknown; output?: unknown }
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="text-xs uppercase tracking-wider text-orange-300">
        {part.name}
      </div>
      {/* The raw parsed input/output — `input` is the feature under test: it
          used to always be undefined at runtime, now it's the parsed object. */}
      <div className="mt-2 grid gap-1 font-mono text-xs text-gray-400">
        <div>
          input:{' '}
          <code className="text-emerald-300">
            {part.input === undefined
              ? 'undefined'
              : JSON.stringify(part.input)}
          </code>
        </div>
        <div>
          output:{' '}
          <code className="text-sky-300">
            {part.output === undefined
              ? 'undefined'
              : JSON.stringify(part.output)}
          </code>
        </div>
      </div>
      <div className="mt-2 text-sm text-gray-200">{children}</div>
    </div>
  )
}

export const Route = createFileRoute('/typesafe-tools')({
  component: TypesafeToolsPage,
})
