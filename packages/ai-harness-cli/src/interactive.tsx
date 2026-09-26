import { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { HARNESS_EVENTS } from '@tanstack/ai-harness'
import { EventType } from '@tanstack/ai'
import { handleLine } from './commands'
import {
  applyEvent,
  approvalQuestion,
  openUrl,
  resolveAll,
} from './session-view'
import type {
  AnyHarness,
  HarnessSession,
  SessionSnapshot,
} from '@tanstack/ai-harness'
import type { ViewEntry } from './session-view'

const MAX_ENTRIES = 200

function Entry({ entry }: { entry: ViewEntry }) {
  switch (entry.kind) {
    case 'user':
      return <Text color="cyan">{`> ${entry.text}`}</Text>
    case 'assistant':
      return <Text>{entry.text}</Text>
    case 'tool':
      return <Text color="yellow">{`  - ${entry.text}`}</Text>
    case 'notice':
      return <Text color="gray">{entry.text}</Text>
  }
}

function App({
  session,
  harness,
}: {
  session: HarnessSession
  harness: AnyHarness
}) {
  const { exit } = useApp()
  const [entries, setEntries] = useState<Array<ViewEntry>>([
    { kind: 'notice', text: `${harness.name}. Type /help for commands.` },
  ])
  const [input, setInput] = useState('')
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() =>
    session.snapshot(),
  )

  useEffect(() => {
    const reader = new AbortController()
    void (async () => {
      for await (const entry of session.events({
        from: session.snapshot().cursor,
        signal: reader.signal,
      })) {
        setEntries((current) => applyEvent(current, entry).slice(-MAX_ENTRIES))
        const event = entry.event
        if (event.type === EventType.CUSTOM) {
          if (event.name === HARNESS_EVENTS.authRequired) {
            const url = (event.value as { url?: unknown }).url
            if (typeof url === 'string') openUrl(url)
          }
          // Let the operation settle before reading the status.
          setTimeout(() => setSnapshot(session.snapshot()), 0)
        }
      }
    })()
    return () => reader.abort()
  }, [session])

  const notice = (text: string) =>
    setEntries((current) =>
      [...current, { kind: 'notice' as const, text }].slice(-MAX_ENTRIES),
    )

  const submit = async (line: string) => {
    const current = session.snapshot()
    if (current.status === 'requires_action') {
      const approved = /^y(es)?$/i.test(line.trim())
      await resolveAll(session, current.pendingInterrupts, approved)
      notice(approved ? 'Approved.' : 'Rejected.')
      return
    }
    if (line.trim() !== '' && !line.trim().startsWith('/')) {
      setEntries((list) =>
        [...list, { kind: 'user' as const, text: line.trim() }].slice(
          -MAX_ENTRIES,
        ),
      )
    }
    const result = await handleLine(session, line)
    if (result.type === 'exit') exit()
    else if (result.type === 'notice' && result.text) notice(result.text)
    setSnapshot(session.snapshot())
  }

  useInput((character, key) => {
    if (key.escape) {
      void session.cancel().then(() => setSnapshot(session.snapshot()))
      return
    }
    if (key.return) {
      const line = input
      setInput('')
      void submit(line)
      return
    }
    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1))
      return
    }
    if (key.ctrl || key.meta || !character) return
    // A paste (or fast typing) can arrive as one chunk with line breaks in it.
    const [first = '', ...rest] = character.split(/\r\n|\r|\n/)
    if (rest.length === 0) {
      setInput((current) => current + first)
      return
    }
    const lines = [input + first, ...rest.slice(0, -1)]
    setInput(rest.at(-1) ?? '')
    void (async () => {
      for (const line of lines) await submit(line)
    })()
  })

  const question = snapshot.pendingQuestions[0]
  const status = question
    ? `${question.message} (type your answer)`
    : snapshot.status === 'running'
      ? 'working (Esc to cancel, Enter steers)'
      : snapshot.status === 'requires_action'
        ? approvalQuestion(snapshot.pendingInterrupts)
        : 'ready'
  const background = snapshot.activeOperations.filter(
    (operation) => operation.kind === 'agent',
  )

  return (
    <Box flexDirection="column">
      {entries.map((entry, index) => (
        <Entry key={index} entry={entry} />
      ))}
      <Box marginTop={1}>
        <Text
          color={snapshot.status === 'requires_action' ? 'magenta' : 'gray'}
        >
          {status}
          {background.length > 0
            ? ` | agents: ${background.map((operation) => operation.agent).join(', ')}`
            : ''}
          {snapshot.queuedTurns > 0 ? ` | queued: ${snapshot.queuedTurns}` : ''}
        </Text>
      </Box>
      <Text>
        <Text color="cyan">{'> '}</Text>
        {input}
        <Text inverse> </Text>
      </Text>
    </Box>
  )
}

/** Start the interactive UI. Resolves when the user quits. */
export async function runInteractive(
  session: HarnessSession,
  harness: AnyHarness,
  streams: {
    stdin?: NodeJS.ReadStream
    stdout?: NodeJS.WriteStream
    /** Route `console` output above the UI. Default true. */
    patchConsole?: boolean
  } = {},
): Promise<void> {
  const instance = render(<App session={session} harness={harness} />, streams)
  await instance.waitUntilExit()
}
