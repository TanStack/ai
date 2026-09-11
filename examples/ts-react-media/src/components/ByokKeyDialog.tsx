import { useEffect, useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import { useByok } from '@tanstack/ai-react'
import { byok, KEYED_PROVIDERS } from '@/lib/byok'
import type { KeyStatus } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'

export type ByokKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  envStatus?: Record<string, boolean>
}

const STATUS_LABEL: Record<
  KeyStatus['state'],
  { label: string; className: string }
> = {
  empty: { label: 'Not set', className: 'text-gray-500' },
  set: { label: 'Saved', className: 'text-gray-400' },
  locked: { label: 'Locked', className: 'text-amber-400' },
  error: { label: 'Check failed', className: 'text-red-400' },
}

export function ByokKeyDialog({
  open,
  onOpenChange,
  envStatus,
}: ByokKeyDialogProps) {
  const snapshot = useByok(byok)
  const [unlocking, setUnlocking] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const locked = snapshot.locked
  const needsAttention =
    locked ||
    KEYED_PROVIDERS.every((provider) => {
      const status = snapshot.status[provider.id]
      const empty = !status || status.state === 'empty'
      return empty && !envStatus?.[provider.id]
    })

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        title="API keys"
        aria-label="API keys"
        className="relative flex items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 p-2 text-purple-400 transition-colors hover:bg-purple-500/20"
      >
        <KeyRound className="h-5 w-5" />
        {needsAttention ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-gray-800" />
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
          onClick={() => onOpenChange(false)}
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">API keys</h2>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                  className="text-gray-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-4 text-sm leading-snug text-gray-400">
                Keys stay in this browser and are sent per request in a header.
                Never stored on the server. Providers with a server env key
                already work without one.
              </p>

              {snapshot.locked ? (
                <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-gray-200">
                  <span>Saved keys are locked ({byok.storage.label}).</span>
                  <button
                    type="button"
                    disabled={unlocking}
                    className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500 disabled:opacity-50"
                    onClick={() => {
                      setUnlocking(true)
                      setActionError('')
                      void byok
                        .unlock()
                        .catch((error: unknown) =>
                          setActionError(
                            error instanceof Error
                              ? error.message
                              : 'Could not unlock keys',
                          ),
                        )
                        .finally(() => setUnlocking(false))
                    }}
                  >
                    {unlocking ? 'Unlocking…' : 'Unlock'}
                  </button>
                </div>
              ) : null}

              {byok.storage.warning ? (
                <p className="mb-3 text-xs text-amber-400">
                  {byok.storage.warning}
                </p>
              ) : null}
              {snapshot.storageError ? (
                <p className="mb-3 text-xs text-red-400">
                  {snapshot.storageError}
                </p>
              ) : null}
              {actionError ? (
                <p className="mb-3 text-xs text-red-400">{actionError}</p>
              ) : null}

              <div className="flex flex-col gap-4">
                {KEYED_PROVIDERS.map((provider) => (
                  <ProviderRow
                    key={provider.id}
                    id={provider.id}
                    label={provider.label}
                    status={snapshot.status[provider.id]}
                    locked={snapshot.locked}
                    hasEnvKey={Boolean(envStatus?.[provider.id])}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function ProviderRow({
  id,
  label,
  status,
  locked,
  hasEnvKey,
}: {
  id: ProviderId
  label: string
  status: KeyStatus | undefined
  locked: boolean
  hasEnvKey: boolean
}) {
  const [draft, setDraft] = useState('')
  const [rowError, setRowError] = useState('')
  const state = status?.state ?? 'empty'
  const masked = status && 'masked' in status ? status.masked : undefined
  const isLocked = locked || state === 'locked'
  const hasKey = state !== 'empty'

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-700 bg-gray-800/50 p-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white">{label}</span>
        <PresenceBadge
          state={state}
          hasKey={hasKey}
          isLocked={state === 'locked'}
          hasEnvKey={hasEnvKey}
        />
      </div>

      {hasKey && masked ? (
        <div className="flex items-center justify-between gap-2">
          <code className="font-mono tracking-wider text-gray-300">
            {masked}
          </code>
          <button
            type="button"
            disabled={isLocked}
            className="rounded-md border border-gray-600 bg-gray-800 px-2.5 py-1 text-sm text-gray-200 disabled:opacity-50"
            onClick={() => {
              setRowError('')
              void byok
                .clear(id)
                .catch((error: unknown) =>
                  setRowError(
                    error instanceof Error
                      ? error.message
                      : 'Could not clear key',
                  ),
                )
            }}
          >
            Clear
          </button>
        </div>
      ) : null}

      {state === 'error' && status && 'message' in status ? (
        <p className="text-xs text-red-400">{status.message}</p>
      ) : null}
      {rowError ? <p className="text-xs text-red-400">{rowError}</p> : null}

      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          const next = draft.trim()
          if (!next || isLocked) return
          setRowError('')
          void byok
            .update(id, next)
            .then(() => setDraft(''))
            .catch((error: unknown) =>
              setRowError(
                error instanceof Error ? error.message : 'Could not save key',
              ),
            )
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          disabled={isLocked}
          placeholder={
            isLocked
              ? 'Unlock to replace…'
              : hasKey
                ? 'Replace key…'
                : `Paste ${label} key…`
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="flex-1 rounded-md border border-gray-600 bg-gray-950 px-2 py-1.5 text-sm text-white placeholder-gray-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isLocked}
          className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </form>
    </div>
  )
}

function PresenceBadge({
  state,
  hasKey,
  isLocked,
  hasEnvKey,
}: {
  state: KeyStatus['state']
  hasKey: boolean
  isLocked: boolean
  hasEnvKey: boolean
}) {
  if (hasKey && !isLocked) {
    return (
      <span className="text-xs font-semibold text-emerald-400">Your key</span>
    )
  }
  if (isLocked) {
    return <span className="text-xs font-semibold text-amber-400">Locked</span>
  }
  if (hasEnvKey) {
    return (
      <span className="text-xs font-semibold text-gray-400">Server key</span>
    )
  }
  const { label, className } = STATUS_LABEL[state]
  return <span className={`text-xs font-semibold ${className}`}>{label}</span>
}
