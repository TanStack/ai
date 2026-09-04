import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useByok } from '@tanstack/ai-react'
import { byok, reactorByok } from '@/lib/byok'

export default function ReactorKey() {
  const snapshot = useByok(byok)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const status = snapshot.status[reactorByok.id]
  const saved = status?.state === 'set'
  const masked = status && 'masked' in status ? status.masked : ''

  return (
    <form
      className="space-y-2 rounded-lg border border-gray-700 bg-gray-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        const next = value.trim()
        if (!next) return
        void byok
          .update(reactorByok.id, next)
          .then(() => {
            setValue('')
            setError('')
          })
          .catch((caught: unknown) => {
            setError(
              caught instanceof Error ? caught.message : 'Could not save key',
            )
          })
      }}
    >
      <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
        <KeyRound className="h-4 w-4" />
        Reactor API key
      </label>
      <p className="text-xs text-gray-500">
        Paste a key from the Reactor dashboard. It stays in this browser and
        goes out as an <code className="font-mono">x-byok-reactor</code> header.
        If you leave this empty, the relay uses{' '}
        <code className="font-mono">REACTOR_API_KEY</code>.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={saved ? `Saved ${masked}` : 'rk_...'}
          className="min-w-48 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium text-white hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        {saved ? (
          <button
            type="button"
            onClick={() => void byok.clear(reactorByok.id)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800"
          >
            Clear
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  )
}
