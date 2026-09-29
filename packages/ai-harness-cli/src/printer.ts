import { shortAnswer, signInText } from './session-view'
import type {
  AgentPart,
  MediaPart,
  SessionViewState,
  ViewPart,
} from '@tanstack/ai-harness/view'

/**
 * Prints a session view as lines: streamed text as it grows, and one
 * bracketed line per tool call, child agent, notice, question, and sign-in.
 * Notices that line mode prints itself (command results, rejected inputs,
 * and UI notes) are skipped.
 *
 * Media parts print nothing here. `onMedia` gets each new media part of an
 * assistant message once, from the lead or from a child at any depth.
 */
export function createPrinter(
  write: (text: string) => unknown,
  options: { onMedia?: (part: MediaPart) => void } = {},
) {
  const done = new Set<string>()
  const written = new Map<string, number>()
  // True while streamed text has no line break at its end yet.
  let midLine = false
  let lastStream = ''
  let marking = false

  const line = (text: string) => {
    if (marking) return
    if (midLine) write('\n')
    midLine = false
    write(`${text}\n`)
  }
  const once = (key: string, text: string) => {
    if (done.has(key)) return
    done.add(key)
    line(`[${text}]`)
  }
  const stream = (key: string, text: string) => {
    const before = written.get(key) ?? 0
    if (text.length <= before) return
    written.set(key, text.length)
    if (marking) return
    if (midLine && key !== lastStream) write('\n')
    write(text.slice(before))
    midLine = true
    lastStream = key
  }
  const agent = (key: string, part: AgentPart) => {
    once(`${key}:start`, `agent ${part.name} started`)
    part.parts.forEach((inner, index) => {
      if (inner.type === 'tool-call')
        once(`${key}:${index}`, `${part.name}: tool ${inner.name}`)
    })
    const answer = shortAnswer(
      part.parts
        .map((inner) => (inner.type === 'text' ? inner.text : ''))
        .join(''),
    )
    if (part.status === 'done')
      once(
        `${key}:end`,
        answer
          ? `agent ${part.name} finished: ${answer}`
          : `agent ${part.name} finished`,
      )
    if (part.status === 'failed')
      once(`${key}:end`, `agent ${part.name} failed: ${part.error ?? ''}`)
  }
  const media = (parts: ReadonlyArray<ViewPart>) => {
    for (const part of parts) {
      if (part.type === 'agent') media(part.parts)
      if (part.type !== 'media' || done.has(`media:${part.id}`)) continue
      done.add(`media:${part.id}`)
      if (!marking) options.onMedia?.(part)
    }
  }
  const print = (state: SessionViewState) => {
    for (const message of state.messages) {
      if (message.role === 'notice') {
        if (message.kind === 'error' || message.kind === 'info')
          once(message.id, message.text)
        continue
      }
      if (message.role !== 'assistant') continue
      message.parts.forEach((part, index) => {
        const key = `${message.id}:${index}`
        if (part.type === 'text') stream(key, part.text)
        if (part.type === 'tool-call') once(key, `tool ${part.name}`)
        if (part.type === 'agent') agent(key, part)
      })
      media(message.parts)
    }
    for (const question of state.questions)
      once(`question:${question.id}`, `? ${question.message}`)
    for (const signIn of state.signIns)
      once(
        `sign-in:${signIn.connector}:${signIn.url ?? ''}`,
        signInText(signIn),
      )
  }

  return {
    print,
    /** Mark everything in `state` as printed, for history. */
    mark: (state: SessionViewState) => {
      marking = true
      print(state)
      marking = false
    },
    line,
    end: () => {
      if (midLine) write('\n')
      midLine = false
    },
  }
}
