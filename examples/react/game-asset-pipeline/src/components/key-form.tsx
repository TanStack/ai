import { useState } from 'react'
import { useByok } from '@tanstack/ai-react'
import { byok } from '@/lib/byok'
import type { ByokProvider } from '@tanstack/ai/byok'

/** A key field for one provider. The page shows one per provider it uses. */
export function KeyForm({ provider }: { provider: ByokProvider }) {
  const snapshot = useByok(byok)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const status = snapshot.status[provider.id]
  const masked = status && 'masked' in status ? status.masked : undefined
  const missingKey =
    snapshot.prompt?.reason === 'missing' &&
    snapshot.prompt.provider === provider.id
  const inputId = `${provider.id}-key`

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault()
        const next = draft.trim()
        if (!next) return
        setError('')
        void byok
          .update(provider.id, next)
          .then(() => setDraft(''))
          .catch((caught: unknown) =>
            setError(
              caught instanceof Error ? caught.message : 'Could not save key',
            ),
          )
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        {provider.label} API key
      </label>
      <input
        id={inputId}
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={
          masked ? `Saved ${masked}` : `Paste your ${provider.label} key`
        }
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Save key
        </button>
        {masked ? (
          <button
            type="button"
            className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200"
            onClick={() => {
              setError('')
              void byok
                .clear(provider.id)
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not clear key',
                  ),
                )
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {missingKey ? (
        <p className="text-xs text-amber-400">
          Paste a {provider.label} key, then run the step again.
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  )
}
