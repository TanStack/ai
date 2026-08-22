import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { defineByok, memoryStorage } from '@tanstack/ai-client/byok'
import { fetchServerSentEvents, useByok, useChat } from '@tanstack/ai-react'
import { ChatUI } from '@/components/ChatUI'

export const Route = createFileRoute('/byok')({
  component: ByokPage,
  validateSearch: (search: Record<string, unknown>) => {
    const port =
      typeof search.aimockPort === 'number'
        ? search.aimockPort
        : typeof search.aimockPort === 'string'
          ? parseInt(search.aimockPort, 10)
          : undefined
    return {
      testId: typeof search.testId === 'string' ? search.testId : undefined,
      aimockPort: port != null && !Number.isNaN(port) ? port : undefined,
      serverCoverage:
        search.serverCoverage === true ||
        search.serverCoverage === '1' ||
        search.serverCoverage === 'true',
    }
  },
})

function ByokPage() {
  const { testId, aimockPort, serverCoverage } = Route.useSearch()
  const [byok] = useState(() => {
    const client = defineByok({ storage: memoryStorage() })
    if (serverCoverage) client.setServerCoverage(true)
    return client
  })
  const snapshot = useByok(byok)
  const [hydrated, setHydrated] = useState(false)
  const openaiStatus = snapshot.status.openai
  const last4 =
    openaiStatus && 'masked' in openaiStatus ? openaiStatus.masked : ''

  useEffect(() => {
    setHydrated(true)
  }, [])

  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/byok-chat'),
    byok,
    forwardedProps: {
      provider: 'openai',
      model: 'gpt-5.5',
      testId,
      aimockPort,
    },
  })

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const raw = data.get('key')
    const next = typeof raw === 'string' ? raw.trim() : ''
    if (!next) return
    void byok.update('openai', next).then(() => {
      form.reset()
    })
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-gray-700 p-3 space-y-2">
        <div data-testid="byok-prompt">{snapshot.prompt?.provider ?? ''}</div>
        <div data-testid="byok-last4">{last4}</div>
        <form className="flex gap-2" onSubmit={handleSave}>
          <input
            name="key"
            data-testid="byok-key-input"
            type="text"
            autoComplete="off"
            placeholder="API key"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
          />
          <button
            data-testid="byok-save-button"
            type="submit"
            disabled={!hydrated}
            className="px-4 py-2 bg-orange-500 text-white rounded text-sm disabled:opacity-50"
          >
            Save
          </button>
        </form>
      </div>
      <ChatUI
        messages={messages}
        isLoading={isLoading}
        onStop={stop}
        onSendMessage={(text) => {
          void sendMessage(text).catch(() => {
            // ByokBlockedError / ByokMissingError set snapshot.prompt
          })
        }}
      />
    </div>
  )
}
