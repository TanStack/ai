import { $, component$, useSignal } from '@qwik.dev/core'
import type { QRL } from '@qwik.dev/core'
import type { DocumentHead } from '@qwik.dev/router'
import { clientTools, useChat } from '@tanstack/ai-qwik'

import { GuitarRecommendation } from '../components/guitar-recommendation'
import {
  addToCartToolDef,
  addToWishListToolDef,
  getPersonalGuitarPreferenceToolDef,
  recommendGuitarToolDef,
} from '../lib/guitar-tools'
import { ChatClientPersistence, UIMessage } from '@tanstack/ai-client'

const localStoragePersistence: ChatClientPersistence = {
  getItem: (id) => {
    const raw = window.localStorage.getItem(id)
    if (!raw) return null
    const stored: Array<UIMessage> = JSON.parse(raw)
    return stored.map((message) => ({
      ...message,
      createdAt:
        typeof message.createdAt === 'string'
          ? new Date(message.createdAt)
          : message.createdAt,
    }))
  },
  setItem: (id, messages) => {
    window.localStorage.setItem(id, JSON.stringify(messages))
  },
  removeItem: (id) => {
    window.localStorage.removeItem(id)
  },
}

function getTextPartContent(part: { type: string; content?: string }) {
  return part.type === 'text' ? part.content || '' : ''
}

function formatToolArguments(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    return value
  }
}

function getRecommendationId(output: unknown) {
  if (!output || typeof output !== 'object' || !('id' in output)) {
    return null
  }

  const id = (output as { id: unknown }).id
  return typeof id === 'string' || typeof id === 'number' ? id : null
}

type ToolCallViewProps = {
  name: string
  state: string
  arguments: string
  approvalId?: string
  recommendationId?: string | number | null
  addToolApprovalResponse: QRL<
    (response: { id: string; approved: boolean }) => Promise<void>
  >
}

const ToolCallView = component$((props: ToolCallViewProps) => {
  return (
    <div class="tool-block">
      <div class="tool-status">
        <span>{props.name}</span>
        <span>{props.state}</span>
      </div>

      {props.recommendationId !== undefined &&
      props.recommendationId !== null ? (
        <GuitarRecommendation id={props.recommendationId} />
      ) : null}

      {props.state === 'approval-requested' && props.approvalId ? (
        <div class="approval-card">
          <div>
            <strong>Approve {props.name}?</strong>
            <pre>{formatToolArguments(props.arguments)}</pre>
          </div>
          <div class="approval-actions">
            <button
              type="button"
              data-approval-id={props.approvalId}
              onClick$={async (_, element) => {
                const id = element.dataset.approvalId
                if (!id) return

                await props.addToolApprovalResponse({
                  id,
                  approved: true,
                })
              }}
            >
              Approve
            </button>
            <button
              type="button"
              class="secondary"
              data-approval-id={props.approvalId}
              onClick$={async (_, element) => {
                const id = element.dataset.approvalId
                if (!id) return

                await props.addToolApprovalResponse({
                  id,
                  approved: false,
                })
              }}
            >
              Deny
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
})

export default component$(() => {
  const input = useSignal('')
  const createTools = $(() => {
    const getPersonalPreference = getPersonalGuitarPreferenceToolDef.client(
      () => ({
        preference: 'acoustic',
      }),
    )

    const addToWishList = addToWishListToolDef.client((args) => {
      const storedWishList = localStorage.getItem('wishList')
      let wishList: unknown = []

      try {
        wishList = storedWishList ? JSON.parse(storedWishList) : []
      } catch {
        wishList = []
      }

      const nextWishList = Array.isArray(wishList) ? wishList : []

      if (!nextWishList.includes(args.guitarId)) {
        nextWishList.push(args.guitarId)
      }

      localStorage.setItem('wishList', JSON.stringify(nextWishList))

      return {
        success: true,
        guitarId: args.guitarId,
        totalItems: nextWishList.length,
      }
    })

    const addToCart = addToCartToolDef.client((args) => ({
      success: true,
      cartId: `CART_CLIENT_${Date.now()}`,
      guitarId: args.guitarId,
      quantity: args.quantity,
      totalItems: args.quantity,
    }))

    const recommendGuitar = recommendGuitarToolDef.client(({ id }) => ({
      id: Number(id),
    }))

    return clientTools(
      getPersonalPreference,
      addToWishList,
      addToCart,
      recommendGuitar,
    )
  })
  const chat = useChat({
    id: 'guitar-store-chat-1',
    api: '/api/chat',
    tools$: createTools,
    forwardedProps: {
      model: 'gpt-5.2',
      provider: 'openai',
    },
    persistence: localStoragePersistence,
  })

  const send = $(async () => {
    const message = input.value.trim()
    if (!message || chat.isLoading.value) return
    input.value = ''
    await chat.sendMessage(message)
  })

  return (
    <main class="chat-shell">
      <section class="chat-panel" aria-label="Qwik guitar store chat example">
        <header class="chat-header">
          <div>
            <p class="eyebrow">TanStack AI + Qwik City</p>
            <h1>Guitar Store Chat</h1>
          </div>
          <div class="status-pill" data-status={chat.status.value}>
            {chat.status.value}
          </div>
        </header>

        <div class="messages" aria-live="polite">
          {chat.messages.value.length === 0 ? (
            <div class="empty-state">
              <h2>Ask for a guitar recommendation.</h2>
              <p>
                Try asking for an acoustic guitar, a comparison, financing, or
                to add a recommendation to your wishlist.
              </p>
            </div>
          ) : (
            chat.messages.value.map((message) => (
              <article
                class={['message', `message-${message.role}`]}
                key={message.id}
              >
                <div class="message-author">
                  {message.role === 'assistant' ? 'AI' : 'You'}
                </div>
                <div class="message-body">
                  {message.parts.map((part, index) => {
                    if (part.type === 'text') {
                      return (
                        <p key={`${message.id}-text-${index}`}>
                          {getTextPartContent(part)}
                        </p>
                      )
                    }

                    if (part.type === 'thinking') {
                      return (
                        <details key={`${message.id}-thinking-${index}`}>
                          <summary>Thinking</summary>
                          <pre>{part.content}</pre>
                        </details>
                      )
                    }

                    if (part.type === 'tool-call') {
                      return (
                        <ToolCallView
                          key={`${message.id}-tool-${index}`}
                          name={part.name}
                          state={part.state}
                          arguments={part.arguments}
                          approvalId={part.approval?.id}
                          recommendationId={
                            part.name === 'recommendGuitar'
                              ? getRecommendationId(part.output)
                              : null
                          }
                          addToolApprovalResponse={chat.addToolApprovalResponse}
                        />
                      )
                    }

                    return null
                  })}
                </div>
              </article>
            ))
          )}
        </div>

        {chat.error.value ? (
          <p class="error-message" role="alert">
            {chat.error.value.message}
          </p>
        ) : null}

        <form
          class="composer"
          preventdefault:submit
          onSubmit$={send}
          aria-label="Send message"
        >
          <label class="sr-only" for="message">
            Message
          </label>
          <textarea
            id="message"
            value={input.value}
            onInput$={(_, element) => {
              input.value = element.value
            }}
            placeholder="Ask for an acoustic guitar recommendation..."
            rows={2}
            disabled={chat.isLoading.value}
          />
          {chat.isLoading.value ? (
            <button type="button" onClick$={chat.stop}>
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!input.value.trim()}>
              Send
            </button>
          )}
        </form>
      </section>
    </main>
  )
})

export const head: DocumentHead = {
  title: 'TanStack AI - Qwik Guitar Chat',
  meta: [
    {
      name: 'description',
      content:
        'Qwik City tool-calling chat example for the TanStack AI Qwik adapter.',
    },
  ],
}
