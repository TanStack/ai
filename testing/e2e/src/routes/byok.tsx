import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useRef } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import {
  ByokKeyManager,
  ByokProvider,
  byokHeaders,
  memoryStorage,
  useByok,
} from '@tanstack/ai-byok/react'
import { ChatUI } from '@/components/ChatUI'
import type { Keyring, KeyringStorage } from '@tanstack/ai-byok/react'

interface ByokSearch {
  testId?: string
  aimockPort?: number
  key?: string
}

export const Route = createFileRoute('/byok')({
  component: ByokRoute,
  validateSearch: (search: Record<string, unknown>): ByokSearch => ({
    testId: typeof search.testId === 'string' ? search.testId : undefined,
    aimockPort:
      search.aimockPort != null ? Number(search.aimockPort) : undefined,
    key: typeof search.key === 'string' ? search.key : undefined,
  }),
})

// A storage that hydrates the keyring with a preloaded key on mount — the same
// path `passkeyStorage` uses to restore keys, driven deterministically for the
// test. No key param → session-only memory (nothing stored).
function preloadedStorage(keys: Keyring): KeyringStorage {
  return {
    id: 'preload',
    label: 'Preloaded (test)',
    persistent: false,
    load: () => keys,
    save: () => {},
    clear: () => {},
  }
}

function ByokRoute() {
  const { key } = Route.useSearch()
  const storage = useMemo(
    () => (key ? preloadedStorage({ openai: key }) : memoryStorage()),
    [key],
  )
  return (
    <ByokProvider storage={storage}>
      <ByokChat />
    </ByokProvider>
  )
}

function ByokChat() {
  const { testId, aimockPort } = Route.useSearch()
  const { keys } = useByok()
  const keysRef = useRef(keys)
  keysRef.current = keys

  const connection = useMemo(
    () =>
      fetchServerSentEvents('/api/byok-chat', () => ({
        headers: byokHeaders(keysRef.current),
      })),
    [],
  )

  const chat = useChat({
    id: 'byok-chat',
    connection,
    body: { testId, aimockPort },
  })

  return (
    <div className="space-y-4 p-4">
      <ByokKeyManager providers={['openai']} />
      {chat.error ? (
        <p data-testid="byok-error" className="text-sm text-red-400">
          {chat.error.message}
        </p>
      ) : null}
      <ChatUI
        messages={chat.messages}
        isLoading={chat.isLoading}
        onSendMessage={(text) => {
          void chat.sendMessage(text)
        }}
        onStop={chat.stop}
      />
    </div>
  )
}
