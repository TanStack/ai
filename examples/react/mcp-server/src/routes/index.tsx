import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { callDesk } from '@/lib/call-server'
import type { DeskResult } from '@/lib/call-server'

function McpServerPage() {
  const [result, setResult] = useState<DeskResult | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onCall() {
    setError('')
    setPending(true)
    try {
      setResult(await callDesk())
    } catch (caught) {
      setResult(null)
      setError(caught instanceof Error ? caught.message : 'The call failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-3xl font-bold text-white">Travel desk</h1>
      <p className="mb-6 text-gray-300">
        This page calls your MCP server. The server has one tool, one resource,
        and one prompt.
      </p>
      <button
        type="button"
        className="rounded bg-white px-4 py-2 font-semibold text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
        disabled={pending}
        onClick={() => {
          void onCall()
        }}
      >
        {pending ? 'The call is in progress' : 'Call the server'}
      </button>
      {error !== '' ? (
        <p className="mt-4 text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {result !== null ? (
        <div className="mt-8 space-y-6 text-gray-100">
          <section>
            <h2 className="text-xl font-semibold">Forecast</h2>
            <p>{result.forecast}</p>
          </section>
          <section>
            <h2 className="text-xl font-semibold">City guide</h2>
            <pre className="whitespace-pre-wrap">{result.guide}</pre>
          </section>
          <section>
            <h2 className="text-xl font-semibold">Trip brief</h2>
            <p>{result.brief}</p>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export const Route = createFileRoute('/')({
  component: McpServerPage,
})
