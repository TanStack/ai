import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'
import { tableSchema } from '@/lib/table-schema'

function TablePage() {
  const [input, setInput] = useState('')
  const { sendMessage, isLoading, error, stop, partial, final } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    byok,
    outputSchema: tableSchema,
  })

  const rows = partial.rows ?? []
  const title = partial.title
  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-lg focus:bg-orange-500 focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to table
      </a>
      <header className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <h1 className="mb-2 text-lg font-semibold text-white">
          Streaming structured table
        </h1>
        <OpenRouterKeyForm />
      </header>

      <main id="main" className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {rows.length === 0 && !isLoading ? (
          <p className="text-sm text-gray-400">
            Paste an OpenRouter key. Then ask for a comparison table.
          </p>
        ) : (
          <table
            className="w-full border-collapse text-left text-sm text-white"
            aria-busy={isLoading}
          >
            <caption className="mb-3 text-left text-base font-semibold text-white">
              {title ?? 'Results'}
              {isLoading ? ' (streaming)' : final ? ' (complete)' : ''}
            </caption>
            <thead>
              <tr className="border-b border-orange-500/30">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Name
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Year
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Kind
                </th>
                <th scope="col" className="py-2 font-medium">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-b border-gray-800">
                  <th scope="row" className="py-2 pr-3 font-medium">
                    {row.name ?? '…'}
                  </th>
                  <td className="py-2 pr-3">{row.year ?? '…'}</td>
                  <td className="py-2 pr-3">{row.kind ?? '…'}</td>
                  <td className="py-2">{row.note ?? '…'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {error ? (
          <p className="mt-3 text-sm text-red-400">{error.message}</p>
        ) : null}

        <p className="sr-only" aria-live="polite">
          {isLoading ? 'Streaming table rows' : final ? 'Table complete' : ''}
        </p>
      </main>

      <div className="border-t border-orange-500/10 bg-gray-900/80 px-4 py-3">
        {isLoading ? (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={stop}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Stop
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor="table-prompt">
            Prompt
          </label>
          <textarea
            id="table-prompt"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Compare 6 JavaScript frameworks"
            className="w-full resize-none rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            rows={1}
            disabled={isLoading}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && input.trim()) {
                event.preventDefault()
                handleSendMessage()
              }
            }}
          />
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={!input.trim() || isLoading}
            className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: TablePage,
})
