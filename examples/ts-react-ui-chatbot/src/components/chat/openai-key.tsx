import { useEffect, useId, useRef, useState } from 'react'
import { KeyRoundIcon, XIcon } from 'lucide-react'
import { useByok } from '@tanstack/ai-react'
import { byok } from '@/chat/byok'
import { Button } from '@/components/ui/button'

export function OpenaiKey() {
  const snapshot = useByok(byok)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const status = snapshot.status.openai
  const saved = status?.state === 'set'

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <Button
        aria-label="OpenAI key"
        onClick={() => setOpen(true)}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <KeyRoundIcon className="size-4" />
      </Button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className="w-full max-w-sm rounded-xl border bg-card p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium" id={titleId}>
                OpenAI key
              </h2>
              <Button
                aria-label="Close"
                onClick={() => setOpen(false)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
            <p className="text-muted-foreground mb-3 text-xs">
              Paste a key to send it from this browser. If you leave this empty,
              the server uses OPENAI_API_KEY from .env.
            </p>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                const next = value.trim()
                if (!next) return
                void byok.update('openai', next)
                setValue('')
                setOpen(false)
              }}
            >
              <input
                autoComplete="off"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none"
                onChange={(event) => setValue(event.currentTarget.value)}
                placeholder={saved ? status.masked : 'sk-...'}
                ref={inputRef}
                type="password"
                value={value}
              />
              <div className="flex justify-end gap-2">
                {saved ? (
                  <Button
                    onClick={() => void byok.clear('openai')}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Clear
                  </Button>
                ) : null}
                <Button disabled={!value.trim()} size="sm" type="submit">
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
