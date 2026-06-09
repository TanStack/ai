import { useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { DIM, ERROR_RED, PINK } from './theme'
import { forceExit, isCtrlC } from './exit'
import { BrandMark } from './welcome'

export interface ReplMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Interactive chat REPL. Stateless across turns from the CLI's perspective —
 * the full message list is handed to `respond` each turn. `respond` returns the
 * assistant's reply text. `/exit` quits, `/clear` resets the conversation.
 */
function Repl({
  model,
  respond,
}: {
  model: string
  respond: (messages: Array<ReplMessage>) => Promise<string>
}) {
  const { exit } = useApp()
  const [messages, setMessages] = useState<Array<ReplMessage>>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useInput((input, key) => {
    if (isCtrlC(input, key)) forceExit()
    if (busy) return
    if (key.return) {
      const text = draft.trim()
      setDraft('')
      if (!text) return
      if (text === '/exit' || text === '/quit') {
        exit()
        return
      }
      if (text === '/clear') {
        setMessages([])
        setError(null)
        return
      }
      const next = [...messages, { role: 'user' as const, content: text }]
      setMessages(next)
      setBusy(true)
      setError(null)
      respond(next)
        .then((reply) => {
          setMessages((m) => [...m, { role: 'assistant', content: reply }])
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => setBusy(false))
      return
    }
    if (key.escape) {
      exit()
      return
    }
    if (key.backspace || key.delete) {
      setDraft((d) => d.slice(0, -1))
      return
    }
    if (input && !key.ctrl && !key.meta) setDraft((d) => d + input)
  })

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <BrandMark suffix={`chat · ${model} · /clear · /exit`} />
      </Box>
      <Box flexDirection="column">
        {messages.map((m, i) => (
          <Box key={i} marginBottom={1} flexDirection="column">
            <Text bold color={m.role === 'user' ? DIM : PINK}>
              {m.role === 'user' ? 'you' : 'ai'}
            </Text>
            <Text>{m.content}</Text>
          </Box>
        ))}
      </Box>
      {error ? <Text color={ERROR_RED}>✗ {error}</Text> : null}
      <Box>
        {busy ? (
          <Text color={PINK}>● thinking…</Text>
        ) : (
          <Text>
            <Text color={PINK}>❯ </Text>
            {draft}
            <Text color={DIM}>▌</Text>
          </Text>
        )}
      </Box>
    </Box>
  )
}

/** Render the REPL and resolve when the user exits. */
export async function runChatReplInk(input: {
  model: string
  respond: (messages: Array<ReplMessage>) => Promise<string>
}): Promise<void> {
  const { waitUntilExit } = render(
    <Repl model={input.model} respond={input.respond} />,
    { exitOnCtrlC: false },
  )
  await waitUntilExit()
}
