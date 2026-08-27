import { createFileRoute } from '@tanstack/solid-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid'
import { createUI } from '@tanstack/ai-solid-ui'
import { createSignal } from 'solid-js'
import { clientTools } from '@/lib/guitar-tools'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: clientTools,
}

const UI = createUI(chatOptions)

function SolidUIPage() {
  const chat = useChat(chatOptions)
  const [draft, setDraft] = createSignal('')
  const components = UI.defineComponents({
    layout: (props) => (
      <div class="flex h-[calc(100vh-72px)] flex-col overflow-hidden bg-gray-900">
        <div class="flex-1 overflow-y-auto px-4 py-4">
          {props.renderMessages()}
        </div>
        {props.renderInput()}
      </div>
    ),
    message: (props) => (
      <article class="mb-2 p-4" data-role={props.message.role}>
        {props.renderParts()}
      </article>
    ),
    input: () => (
      <form
        class="border-t border-orange-500/20 bg-gray-800 p-4"
        onSubmit={(event) => {
          event.preventDefault()
          const text = draft().trim()
          if (!text) return
          setDraft('')
          void chat.sendMessage(text)
        }}
      >
        <input
          class="w-full rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-white"
          placeholder="Ask about guitars..."
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
        />
      </form>
    ),
    parts: {
      fallback: (props) =>
        props.part.type === 'text' ? <p>{props.part.content}</p> : null,
    },
    tools: {
      recommendGuitar: (props) => <p>{props.part.input?.id}</p>,
      getPersonalGuitarPreference: (props) => (
        <p>{props.part.output?.preference}</p>
      ),
      addToWishList: (props) => (
        <p>
          {props.part.input?.guitarId}
          {props.interrupt?.status === 'pending' ? (
            <button
              type="button"
              onClick={() => props.interrupt?.resolveInterrupt(true)}
            >
              Approve
            </button>
          ) : null}
        </p>
      ),
      addToCart: (props) => (
        <p>
          {props.part.input?.guitarId}
          {props.interrupt?.status === 'pending' ? (
            <button
              type="button"
              onClick={() => props.interrupt?.resolveInterrupt(true)}
            >
              Approve
            </button>
          ) : null}
        </p>
      ),
    },
  })

  return <UI.Chat chat={chat} components={components} />
}

export const Route = createFileRoute('/solid-ui')({
  component: SolidUIPage,
})
