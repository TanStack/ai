import { createChat, fetchServerSentEvents } from '@tanstack/ai-remix'
import { clientEntry, css, on, type Handle } from 'remix/ui'
import guitars from '../data/guitars.ts'
import { clientTools } from '../lib/guitar-tools.ts'
import { routes } from '../routes.ts'

export const Chat = clientEntry(import.meta.url, function Chat(handle: Handle) {
  const chat = createChat(handle, {
    connection: fetchServerSentEvents(routes.chat.stream.href()),
    tools: clientTools,
  })

  return () => (
    <div mix={shellStyle}>
      <a href="#main" mix={skipStyle}>
        Skip to chat
      </a>
      <header mix={headerStyle}>
        <img
          src="/tanstack-landscape-black.svg"
          alt="TanStack"
          width="160"
          height="25"
          mix={logoStyle}
        />
        <p mix={kickerStyle}>Remix Chat</p>
      </header>
      <main id="main" mix={mainStyle} aria-busy={chat.isLoading}>
        <h1 mix={titleStyle}>Guitar shop</h1>
        <p mix={ledeStyle}>
          Ask for a recommendation. The assistant looks at inventory, then shows
          a card you can buy.
        </p>
        <div mix={transcriptStyle}>
          {chat.messages.length === 0 ? (
            <p mix={emptyStyle}>No messages yet. Try “Recommend a guitar”.</p>
          ) : (
            <ul mix={listStyle} role="list">
              {chat.messages.map((message) => {
                const visibleParts = message.parts
                  .map((part, index) => renderMessagePart(part, index))
                  .filter((node) => node !== null)
                if (visibleParts.length === 0) return null
                return (
                  <li
                    key={message.id}
                    mix={[
                      bubbleStyle,
                      message.role === 'user'
                        ? userBubbleStyle
                        : assistantBubbleStyle,
                    ]}
                  >
                    <p mix={roleStyle}>
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </p>
                    {visibleParts}
                  </li>
                )
              })}
            </ul>
          )}
          <div mix={statusStyle} aria-live="polite">
            {chat.isLoading ? <p>Thinking…</p> : null}
            {chat.error ? (
              <p mix={errorStyle} role="alert">
                {chat.error.message}
              </p>
            ) : null}
          </div>
        </div>
        <form
          mix={[
            formStyle,
            on('submit', (event) => {
              event.preventDefault()
              const form = event.currentTarget
              const formData = new FormData(form)
              const text = String(formData.get('message') ?? '').trim()
              if (!text) return
              form.reset()
              void chat.sendMessage(text)
            }),
          ]}
        >
          <label mix={fieldStyle}>
            <span mix={visuallyHiddenStyle}>Message</span>
            <input
              name="message"
              type="text"
              autocomplete="off"
              placeholder="Ask about a guitar…"
              disabled={chat.isLoading}
              mix={inputStyle}
            />
          </label>
          {chat.isLoading ? (
            <button
              type="button"
              mix={[
                buttonStyle,
                secondaryButtonStyle,
                on('click', () => chat.stop()),
              ]}
            >
              Stop
            </button>
          ) : (
            <button type="submit" mix={buttonStyle}>
              Send
            </button>
          )}
        </form>
      </main>
    </div>
  )
})

function renderMessagePart(part: MessagePartViewModel, index: number) {
  const key = partKey(part, index)
  if (
    part.type === 'text' &&
    typeof part.content === 'string' &&
    part.content
  ) {
    return (
      <p key={key} mix={textStyle}>
        {part.content}
      </p>
    )
  }
  const guitarId = guitarIdFromPart(part)
  if (guitarId !== undefined) {
    return renderGuitarCard(key, guitarId)
  }
  return null
}

function renderGuitarCard(key: string, id: number) {
  const guitar = guitars.find((item) => item.id === id)
  if (!guitar) {
    return (
      <p key={key} mix={errorStyle}>
        Guitar {id} is not in inventory.
      </p>
    )
  }
  return (
    <article key={key} mix={cardStyle}>
      <img
        src={guitar.image}
        alt={guitar.name}
        width="640"
        height="480"
        mix={cardImageStyle}
      />
      <div mix={cardBodyStyle}>
        <h2 mix={cardTitleStyle}>{guitar.name}</h2>
        <p mix={cardCopyStyle}>{guitar.shortDescription}</p>
        <p mix={priceStyle}>${guitar.price}</p>
      </div>
    </article>
  )
}

function partKey(part: MessagePartViewModel, index: number) {
  if (typeof part.id === 'string' && part.id) return part.id
  return String(index)
}

function guitarIdFromPart(part: MessagePartViewModel): number | undefined {
  if (part.type !== 'tool-call' || part.name !== 'recommendGuitar') {
    return undefined
  }
  const fromOutput = idFromUnknown(part.output)
  if (fromOutput !== undefined) return fromOutput
  const fromInput = idFromUnknown(part.input)
  if (fromInput !== undefined) return fromInput
  if (typeof part.arguments === 'string' && part.arguments.length > 0) {
    try {
      const parsed: unknown = JSON.parse(part.arguments)
      return idFromUnknown(parsed)
    } catch {
      return undefined
    }
  }
  return undefined
}

function idFromUnknown(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  if (isRecord(value) && 'id' in value) {
    return idFromUnknown(value.id)
  }
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

type MessagePartViewModel = {
  type: string
  id?: string
  name?: string
  content?: unknown
  output?: unknown
  input?: unknown
  arguments?: string
}

const shellStyle = css({
  height: '100%',
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
})

const skipStyle = css({
  position: 'absolute',
  left: '-999px',
  top: '0.75rem',
  zIndex: 10,
  padding: '0.5rem 0.75rem',
  background: 'var(--surface)',
  color: 'var(--ink)',
  borderRadius: '8px',
  outline: '2px solid var(--accent)',
  outlineOffset: '2px',
  '&:focus': {
    left: '0.75rem',
  },
})

const headerStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  flexShrink: 0,
  padding: '1rem 1.25rem',
  borderBottom: '1px solid var(--border)',
})

const logoStyle = css({
  height: '1.5rem',
  width: 'auto',
  display: 'block',
})

const kickerStyle = css({
  margin: 0,
  fontSize: '0.875rem',
  lineHeight: 1.25,
  fontWeight: 400,
  color: 'var(--muted)',
})

const mainStyle = css({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  width: 'min(42rem, 100%)',
  marginInline: 'auto',
  padding: '1.5rem 1rem 1.25rem',
})

const titleStyle = css({
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(1.75rem, 4vw, 2.25rem)',
  lineHeight: 1.15,
  fontWeight: 700,
  letterSpacing: '-0.02em',
  color: 'var(--accent)',
})

const ledeStyle = css({
  margin: 0,
  maxWidth: '42ch',
  color: 'var(--muted)',
  fontSize: '1rem',
})

const transcriptStyle = css({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  paddingBottom: '0.5rem',
})

const emptyStyle = css({
  margin: 0,
  padding: '1.25rem',
  background: 'var(--surface)',
  borderRadius: '20px',
  boxShadow: 'var(--shadow)',
  color: 'var(--muted)',
})

const listStyle = css({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
})

const bubbleStyle = css({
  maxWidth: '100%',
  padding: '0.9rem 1rem',
  borderRadius: '18px',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow)',
})

const userBubbleStyle = css({
  marginInlineStart: '12%',
  outline: '1px solid var(--border)',
})

const assistantBubbleStyle = css({
  marginInlineEnd: '8%',
})

const roleStyle = css({
  margin: '0 0 0.35rem',
  fontSize: '0.75rem',
  lineHeight: 1.2,
  fontWeight: 400,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
})

const textStyle = css({
  margin: 0,
  whiteSpace: 'pre-wrap',
})

const statusStyle = css({
  minHeight: '1.5rem',
  color: 'var(--muted)',
})

const errorStyle = css({
  margin: 0,
  color: 'var(--accent)',
  fontWeight: 400,
})

const formStyle = css({
  display: 'flex',
  flexShrink: 0,
  gap: '0.5rem',
  padding: '0.5rem',
  background: 'var(--surface)',
  borderRadius: '20px',
  boxShadow: 'var(--shadow)',
})

const fieldStyle = css({
  flex: 1,
  minWidth: 0,
  display: 'flex',
})

const visuallyHiddenStyle = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
})

const inputStyle = css({
  flex: 1,
  minHeight: '2.75rem',
  width: '100%',
  border: 0,
  borderRadius: '12px',
  padding: '0.65rem 0.85rem',
  background: 'transparent',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: '1rem',
  fontWeight: 400,
  outline: '2px solid transparent',
  outlineOffset: '2px',
  '&:focus-visible': {
    outlineColor: 'var(--accent)',
  },
  '&::placeholder': {
    color: 'var(--muted)',
    opacity: 0.8,
  },
  '&:disabled': {
    opacity: 0.6,
  },
})

const buttonStyle = css({
  minHeight: '2.75rem',
  minWidth: '4.5rem',
  padding: '0.5rem 1rem',
  border: 0,
  borderRadius: '12px',
  background: 'var(--accent)',
  color: '#fffdf6',
  fontFamily: 'inherit',
  fontSize: '0.95rem',
  fontWeight: 600,
  cursor: 'pointer',
  outline: '2px solid transparent',
  outlineOffset: '2px',
  transitionProperty: 'transform, opacity',
  transitionDuration: '120ms',
  transitionTimingFunction: 'ease-out',
  '&:hover': {
    opacity: 0.92,
  },
  '&:focus-visible': {
    outlineColor: 'var(--ink)',
  },
  '&:active': {
    transform: 'scale(0.96)',
  },
  '&:disabled': {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
})

const secondaryButtonStyle = css({
  background: 'transparent',
  color: 'var(--ink)',
  outline: '1px solid var(--border)',
})

const cardStyle = css({
  marginBlockStart: '0.75rem',
  overflow: 'hidden',
  borderRadius: '16px',
  background: 'var(--bg)',
  outline: '1px solid var(--border)',
})

const cardImageStyle = css({
  display: 'block',
  width: '100%',
  height: 'auto',
  aspectRatio: '4 / 3',
  objectFit: 'cover',
  outline: '1px solid oklch(0 0 0 / 0.1)',
  outlineOffset: '-1px',
})

const cardBodyStyle = css({
  padding: '0.9rem 1rem 1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
})

const cardTitleStyle = css({
  margin: 0,
  fontFamily: 'var(--font-display)',
  fontSize: '1.15rem',
  lineHeight: 1.25,
  fontWeight: 700,
})

const cardCopyStyle = css({
  margin: 0,
  color: 'var(--muted)',
  fontSize: '0.95rem',
})

const priceStyle = css({
  margin: '0.25rem 0 0',
  fontWeight: 600,
  color: 'var(--accent)',
})
