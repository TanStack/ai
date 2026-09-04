import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useByok } from '@tanstack/ai-react'
import { byok, getEnvKeyStatus, reactorByok } from '@/lib/byok'

export default function ReactorKey() {
  const snapshot = useByok(byok)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>({})

  useEffect(() => {
    void byok.ready()
  }, [])

  useEffect(() => {
    void getEnvKeyStatus().then(setEnvStatus)
  }, [])

  const status = snapshot.status[reactorByok.id]
  const state = status?.state ?? 'empty'
  const saved = state === 'set' || state === 'locked'
  const masked = status && 'masked' in status ? status.masked : ''
  const hasEnvKey = Boolean(envStatus[reactorByok.id])

  return (
    <form
      className="space-y-2 rounded-lg border border-gray-700 bg-gray-900 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        const next = value.trim()
        if (!next || state === 'locked') return
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
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <KeyRound className="h-4 w-4" />
          Reactor API key
        </label>
        <span className="text-xs text-gray-400">
          {state === 'locked'
            ? 'Locked'
            : saved
              ? 'Saved'
              : hasEnvKey
                ? 'On server'
                : 'Not set'}
        </span>
      </div>
      <p className="text-xs text-gray-500">
        Keys stay in this browser (passkey) and are sent as{' '}
        <code className="font-mono">x-byok-reactor</code>. After a refresh,
        Unlock. If you leave this empty, the relay uses{' '}
        <code className="font-mono">REACTOR_API_KEY</code>.
      </p>
      {byok.storage.warning ? (
        <p className="text-xs text-amber-400">{byok.storage.warning}</p>
      ) : null}
      {snapshot.storageError ? (
        <p className="text-xs text-red-400">{snapshot.storageError}</p>
      ) : null}
      {snapshot.locked ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-gray-200">
          <span>
            Saved keys are locked
            {masked ? ` (••${masked})` : ''}. Unlock to use them.
          </span>
          <button
            type="button"
            disabled={unlocking}
            className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
            onClick={() => {
              setUnlocking(true)
              setError('')
              void byok
                .unlock()
                .catch((caught: unknown) => {
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not unlock keys',
                  )
                })
                .finally(() => setUnlocking(false))
            }}
          >
            {unlocking ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      ) : null}
      {saved && masked ? (
        <p className="font-mono text-sm tracking-wider text-gray-300">
          ••{masked}
        </p>
      ) : hasEnvKey ? (
        <p className="text-xs text-gray-400">
          Relay has <code className="font-mono">REACTOR_API_KEY</code>. You can
          start without pasting a key.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={state === 'locked'}
          onChange={(event) => setValue(event.target.value)}
          placeholder={
            state === 'locked'
              ? 'Unlock to replace…'
              : saved
                ? 'Replace key…'
                : 'rk_...'
          }
          className="min-w-48 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!value.trim() || state === 'locked'}
          className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium text-white hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        {saved ? (
          <button
            type="button"
            disabled={state === 'locked'}
            onClick={() => void byok.clear(reactorByok.id)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  )
}
