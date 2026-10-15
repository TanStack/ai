import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ChatClient,
  fetchServerSentEvents,
  localStoragePersistence,
} from '@tanstack/ai-react'
import type {
  ChatPersistedState,
  ChatStorageAdapter,
  UIMessage,
} from '@tanstack/ai-react'

/**
 * Client half of the issue #1639 harness.
 *
 * The store wraps `localStoragePersistence` behind async reads, like React
 * Native AsyncStorage or IndexedDB. The page drives a `ChatClient` directly:
 * `useChat` holds the store read until it attaches, but a client created
 * without it starts reading at construction. On the second load the client
 * attaches only when the spec clicks "Show chat", after
 * `data-async-store-hydrated` shows the read restored the in-flight run.
 */

const syncStore = localStoragePersistence()

const asyncStore: ChatStorageAdapter<ChatPersistedState> = {
  async getItem(key) {
    return await syncStore.getItem(key)
  },
  async setItem(key, value) {
    await syncStore.setItem(key, value)
  },
  async removeItem(key) {
    await syncStore.removeItem(key)
  },
}

const connection = fetchServerSentEvents('/api/async-store-rejoin')

export const Route = createFileRoute('/async-store-rejoin')({
  component: AsyncStoreRejoinPage,
  validateSearch: (search: Record<string, unknown>) => ({
    threadId:
      typeof search.threadId === 'string' && search.threadId.length > 0
        ? search.threadId
        : 'async-store-rejoin-thread',
    // The first visit attaches at once, so the spec can start the run.
    deferAttach: search.deferAttach === true || search.deferAttach === 'true',
  }),
})

function AsyncStoreRejoinPage() {
  const { threadId, deferAttach } = Route.useSearch()
  const [client, setClient] = useState<ChatClient | null>(null)
  const [messages, setMessages] = useState<Array<UIMessage>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [attached, setAttached] = useState(!deferAttach)
  const [input, setInput] = useState('')

  // Created in an effect, not during render, so the server never builds one.
  useEffect(() => {
    const instance = new ChatClient({
      threadId,
      connection,
      persistence: asyncStore,
      onMessagesChange: setMessages,
      onLoadingChange: setIsLoading,
      onHydratingChange: (isHydrating) => {
        if (!isHydrating) setHydrated(true)
      },
    })
    setClient(instance)
    return () => instance.dispose()
  }, [threadId])

  useEffect(() => {
    if (!client || !attached) return
    client.attach()
    return () => client.detach()
  }, [client, attached])

  const assistantText = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join('')

  const handleSubmit = () => {
    const text = input.trim()
    if (!text || !client) return
    setInput('')
    void client.sendMessage(text)
  }

  return (
    <div
      data-testid="async-store-rejoin-page"
      data-async-store-hydrated={hydrated ? 'true' : undefined}
      style={{ padding: 16 }}
    >
      <button data-testid="show-chat" onClick={() => setAttached(true)}>
        Show chat
      </button>
      <div data-testid="assistant-text">{assistantText || 'none'}</div>
      {isLoading ? (
        <div data-testid="loading-indicator">Generating...</div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          data-testid="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Type a message..."
        />
        <button
          data-testid="send-button"
          onClick={handleSubmit}
          disabled={!input.trim() || !client}
        >
          Send
        </button>
      </div>
    </div>
  )
}
