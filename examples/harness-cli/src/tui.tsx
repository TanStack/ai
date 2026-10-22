import { useState } from 'react'
import { Box, Static, Text, render, useApp, useInput } from 'ink'
import { useSelector } from '@tanstack/react-store'
import type {
  SessionView,
  ViewMessage,
  ViewPart,
} from '@tanstack/ai-harness/view'

function Part({ part }: { part: ViewPart }) {
  switch (part.type) {
    case 'text':
      return <Text>{part.text}</Text>
    case 'reasoning':
      return <Text dimColor>{part.text}</Text>
    case 'tool-call':
      return (
        <Text color={part.status === 'failed' ? 'red' : 'yellow'}>
          {`* ${part.name} (${part.status})`}
        </Text>
      )
    case 'agent':
      return (
        <Box flexDirection="column" marginLeft={2}>
          <Text color="cyan">{`${part.name} (${part.status})`}</Text>
          {part.parts.map((child, index) => (
            <Part key={index} part={child} />
          ))}
        </Box>
      )
    case 'media':
      return <Text color="magenta">{`[${part.kind}: ${part.name}]`}</Text>
  }
}

function Message({ message }: { message: ViewMessage }) {
  if (message.role === 'user') {
    return <Text color="green">{`> ${message.text}`}</Text>
  }
  if (message.role === 'notice') {
    return (
      <Text color={message.kind === 'error' ? 'red' : 'gray'}>
        {message.text}
      </Text>
    )
  }
  return (
    <Box flexDirection="column">
      {message.parts.map((part, index) => (
        <Part key={index} part={part} />
      ))}
    </Box>
  )
}

/** The typed answer: JSON (a number, a boolean) unless the question wants text. */
function answerOf(text: string, schema: unknown): unknown {
  const wantsText =
    typeof schema !== 'object' ||
    schema === null ||
    Reflect.get(schema, 'type') === 'string'
  if (wantsText) return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** The whole screen: the messages, then one line for what waits for you. */
function Screen({ view }: { view: SessionView }) {
  const { exit } = useApp()
  const state = useSelector(view.store)
  const [line, setLine] = useState('')
  // The turn goes on when every approval and interrupt has an answer, so the
  // screen asks them one by one.
  const [answered, setAnswered] = useState<ReadonlyArray<string>>([])
  const approval = state.approvals.find(({ id }) => !answered.includes(id))
  const interrupt = state.interrupts.find(({ id }) => !answered.includes(id))
  const [question] = state.questions

  useInput((input, key) => {
    if (key.escape) {
      void view.cancel()
      return
    }
    // An approval takes one key: y or n.
    if (approval) {
      if (input !== 'y' && input !== 'n') return
      if (input === 'y') approval.approve()
      else approval.reject()
      setAnswered((ids) => [...ids, approval.id])
      return
    }
    if (key.return) {
      const text = line.trim()
      setLine('')
      if (text === '/exit') exit()
      else if (interrupt) {
        interrupt.resolve(answerOf(text, interrupt.responseSchema))
        setAnswered((ids) => [...ids, interrupt.id])
      } else if (question) {
        void question
          .answer(answerOf(text, question.schema))
          .then((receipt) => {
            if (receipt.status === 'rejected') {
              view.notice({
                text: `Answer again: ${receipt.reason ?? 'not accepted'}`,
              })
            }
          })
      }
      // A `/command` runs the command. Text while a turn runs steers it.
      else void view.send(text)
      return
    }
    if (key.backspace || key.delete) {
      setLine((value) => value.slice(0, -1))
      return
    }
    // A paste can hold line breaks. The line stays one line.
    if (!key.ctrl && !key.meta) {
      setLine((value) => value + input.replace(/[\r\n]+/g, ' '))
    }
  })

  // The turns before the last message you sent do not change, so Ink prints
  // them once. Only the running turn redraws.
  let lastSent = 0
  state.messages.forEach((message, index) => {
    if (message.role === 'user') lastSent = index
  })
  const done = state.messages.slice(0, lastSent)
  const live = state.messages.slice(lastSent)

  const typed = question?.secret ? '*'.repeat(line.length) : line
  const asking = interrupt
    ? (interrupt.message ?? interrupt.reason)
    : question?.message
  const prompt = asking ? `? ${asking} ` : '> '
  return (
    <Box flexDirection="column">
      <Static items={done}>
        {(message) => <Message key={message.id} message={message} />}
      </Static>
      {live.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      {state.signIns.map((signIn) => (
        <Text key={signIn.connector} color="cyan">
          {`Sign in to ${signIn.connector}: ${signIn.url ?? ''} ${signIn.userCode ?? ''}`}
        </Text>
      ))}
      {approval ? (
        <Text color="yellow">
          {`Run ${approval.tool} ${JSON.stringify(approval.args)}? (y/n)`}
        </Text>
      ) : (
        <Box flexDirection="column">
          {question?.url ? (
            <Text color="cyan">{`Open ${question.url}`}</Text>
          ) : null}
          <Text>{`${prompt}${typed}`}</Text>
        </Box>
      )}
      <Text dimColor>
        {`${state.status}. Enter sends, Esc cancels, /exit quits.`}
      </Text>
    </Box>
  )
}

/** The ids of the child agent parts in `parts`, at any depth. */
function agentIds(parts: ReadonlyArray<ViewPart>): Array<string> {
  return parts.flatMap((part) =>
    part.type === 'agent' ? [part.id, ...agentIds(part.parts)] : [],
  )
}

/**
 * Fill the saved child agents of a reopened thread. Ink prints the old turns
 * once, so they load before the first render. A loaded child can have saved
 * children of its own, so it loads again until no new id shows up.
 */
async function loadSavedAgents(view: SessionView) {
  const loaded = new Set<string>()
  for (;;) {
    const ids = view.store
      .get()
      .messages.flatMap((message) =>
        message.role === 'assistant' ? agentIds(message.parts) : [],
      )
      .filter((id) => !loaded.has(id))
    if (ids.length === 0) return
    for (const id of ids) loaded.add(id)
    await Promise.all(ids.map((id) => view.loadAgent({ id })))
  }
}

/** The `ui` of runCli: show the screen until the user quits. */
export async function runTui(view: SessionView) {
  await loadSavedAgents(view)
  await render(<Screen view={view} />).waitUntilExit()
}
