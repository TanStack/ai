import { createSignal } from 'solid-js'
import { useChat } from '@tanstack/ai-solid2'
import { createChatUI } from '@tanstack/ai-solid2/ui'

const UI = createChatUI(
  {},
  {
    components: {
      layout: (props) => <props.Messages />,
      message: (props) => <props.Parts />,
    },
    partsComponents: {
      text: (props) => {
        const [draft, setDraft] = createSignal('')
        return (
          <div>
            <input
              aria-label="Part draft"
              value={draft()}
              onInput={(event) => setDraft(event.currentTarget.value)}
            />
            <span data-testid="part-content">{props.part.content}</span>
          </div>
        )
      },
    },
  },
)

export function PartState() {
  const chat = useChat({
    threadId: 'part-state',
    connection: { async *connect() {} },
    initialMessages: [
      {
        id: 'streaming-part',
        role: 'assistant',
        parts: [{ type: 'text', content: 'partial' }],
      },
    ],
  })
  const finish = () =>
    chat.setMessages([
      {
        id: 'streaming-part',
        role: 'assistant',
        parts: [{ type: 'text', content: 'partial complete' }],
      },
    ])
  return (
    <section aria-label="Part state fixture">
      <UI.Provider chat={chat}>
        <UI.Message message={chat.messages()[0]!} />
      </UI.Provider>
      <button type="button" onClick={finish}>
        Update part
      </button>
    </section>
  )
}
