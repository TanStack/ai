import { Activity, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchServerSentEvents,
  localStoragePersistence,
  useChat,
} from '@tanstack/ai-react'
import type { ChatPersistedState, ChatStorageAdapter } from '@tanstack/ai-react'

/**
 * Client half of the issue #1639 harness.
 *
 * The store wraps `localStoragePersistence` behind async reads, like React
 * Native AsyncStorage or IndexedDB. The chat renders inside a hidden
 * `<Activity>`, which builds the client (starting the hydrate) but defers its
 * effects, so `attach()` runs only when the spec clicks "Show chat". The spec
 * first waits for `data-async-store-hydrated`, which pins the order the bug
 * needs: the hydrate restores the in-flight run while no view is attached.
 */

const HYDRATED_ATTRIBUTE = 'data-async-store-hydrated'
const syncStore = localStoragePersistence()

const asyncStore: ChatStorageAdapter<ChatPersistedState> = {
  async getItem(key) {
    const value = await syncStore.getItem(key)
    // The client applies the record (messages, then the run pointer) in promise
    // callbacks chained on this read. A timer runs only after those microtasks,
    // so the attribute appears once the run is restored, not merely read.
    setTimeout(() => {
      document.documentElement.setAttribute(HYDRATED_ATTRIBUTE, 'true')
    }, 0)
    return value
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
    // The first visit shows the chat at once, so the spec can start the run.
    deferAttach: search.deferAttach === true || search.deferAttach === 'true',
  }),
})

function AsyncStoreRejoinPage() {
  const { threadId, deferAttach } = Route.useSearch()
  const [visible, setVisible] = useState(!deferAttach)

  return (
    <div data-testid="async-store-rejoin-page" style={{ padding: 16 }}>
      <button data-testid="show-chat" onClick={() => setVisible(true)}>
        Show chat
      </button>
      <Activity mode={visible ? 'visible' : 'hidden'}>
        <Chat threadId={threadId} />
      </Activity>
    </div>
  )
}

function Chat({ threadId }: { threadId: string }) {
  const { messages, sendMessage, isLoading } = useChat({
    threadId,
    connection,
    persistence: asyncStore,
  })
  const [input, setInput] = useState('')

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
    if (!text) return
    setInput('')
    void sendMessage(text)
  }

  return (
    <div>
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
          disabled={!input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
