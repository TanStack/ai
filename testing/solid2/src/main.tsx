import { For, Show, createSignal } from 'solid-js'
import { render } from '@solidjs/web'
import { useChat } from '@tanstack/ai-solid2'
import type { ConnectConnectionAdapter } from '@tanstack/ai-solid2'
import { EventType } from '@tanstack/ai/client'
import type { StreamChunk } from '@tanstack/ai'

function App() {
  const [mounted, setMounted] = createSignal(true)
  const [threadId, setThreadId] = createSignal('thread-a')
  const [provider, setProvider] = createSignal('alpha')
  const [requests, setRequests] = createSignal<
    Array<{ threadId: string; provider: unknown; users: number }>
  >([])
  const [active, setActive] = createSignal(0)
  const [aborted, setAborted] = createSignal(0)
  const [finished, setFinished] = createSignal(0)
  let release: (() => void) | undefined

  // Deterministic test fixture, not a recorded or live AI response.
  // Only the transport is a fixture. useChat uses the real ChatClient.
  const connection: ConnectConnectionAdapter = {
    async *connect(
      messages,
      data,
      signal,
      context,
    ): AsyncGenerator<StreamChunk> {
      setRequests((current) => [
        ...current,
        {
          threadId: context.threadId,
          provider: data?.provider,
          users: messages.filter((message) => message.role === 'user').length,
        },
      ])
      setActive((count) => count + 1)
      const messageId = `fixture-${context.runId}`
      let continueReply: () => void = () => {}
      const barrier = new Promise<void>((resolve) => {
        continueReply = resolve
      })
      release = continueReply
      const onAbort = () => {
        setAborted((count) => count + 1)
        continueReply()
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      try {
        yield {
          type: EventType.RUN_STARTED,
          threadId: context.threadId,
          runId: context.runId,
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: `Fixture ${String(data?.provider)}: first`,
        }
        await barrier
        if (signal?.aborted) return
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: ' complete',
        }
        yield { type: EventType.TEXT_MESSAGE_END, messageId }
        yield {
          type: EventType.RUN_FINISHED,
          threadId: context.threadId,
          runId: context.runId,
        }
      } finally {
        signal?.removeEventListener('abort', onAbort)
        if (release === continueReply) release = undefined
        setActive((count) => count - 1)
      }
    },
  }

  function Chat() {
    const chat = useChat({
      get threadId() {
        return threadId()
      },
      get forwardedProps() {
        return { provider: provider() }
      },
      connection,
      onFinish: () => setFinished((count) => count + 1),
    })

    return (
      <section>
        <output data-testid="status">{chat.status()}</output>
        <output data-testid="loading">{String(chat.isLoading())}</output>
        <output data-testid="error">{chat.error()?.message ?? ''}</output>
        <div data-testid="messages">
          <For each={chat.messages()}>
            {(message) => (
              <p data-role={message.role}>
                <For each={message.parts}>
                  {(part) => (part.type === 'text' ? part.content : null)}
                </For>
              </p>
            )}
          </For>
        </div>
        <button
          type="button"
          disabled={chat.isLoading()}
          onClick={() => void chat.sendMessage('Hello')}
        >
          Send
        </button>
      </section>
    )
  }

  return (
    <main>
      <h1>Solid 2 adapter consumer test</h1>
      <p>Replies are deterministic test fixtures, not live AI responses.</p>
      <button type="button" onClick={() => release?.()}>
        Release reply
      </button>
      <button type="button" onClick={() => setProvider('beta')}>
        Change provider
      </button>
      <button type="button" onClick={() => setThreadId('thread-b')}>
        Switch thread
      </button>
      <button type="button" onClick={() => setMounted(false)}>
        Unmount chat
      </button>
      <button type="button" onClick={() => setMounted(true)}>
        Mount chat
      </button>
      <output data-testid="thread">{threadId()}</output>
      <output data-testid="provider">{provider()}</output>
      <output data-testid="requests">{JSON.stringify(requests())}</output>
      <output data-testid="active">{active()}</output>
      <output data-testid="aborted">{aborted()}</output>
      <output data-testid="finished">{finished()}</output>
      <Show when={mounted()}>
        <Chat />
      </Show>
    </main>
  )
}

const root = document.getElementById('app')
if (!root) throw new Error('Missing app root')
render(() => <App />, root)
