import { spawn } from 'node:child_process'
import { useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { useSelector } from '@tanstack/react-store'
import { selectGoal } from '@tanstack/ai-harness/plugins'
import type {
  SessionView,
  ViewMessage,
  ViewPart,
} from '@tanstack/ai-harness/view'

function textOf(parts: ReadonlyArray<ViewPart>) {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
}

/** Open an http(s) link in the default browser. No shell is involved. */
function openInBrowser(url: string) {
  if (!/^https?:\/\//.test(url)) return
  const isWindows = process.platform === 'win32'
  // Not `cmd /c start`: cmd would read `&` in the URL as a command separator.
  const command = isWindows
    ? 'rundll32'
    : process.platform === 'darwin'
      ? 'open'
      : 'xdg-open'
  const args = isWindows ? ['url.dll,FileProtocolHandler', url] : [url]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  // The screen still shows the link when no browser opens.
  child.on('error', () => {})
  child.unref()
}

function Part({ part }: { part: ViewPart }) {
  if (part.type === 'text') return <Text>{part.text}</Text>
  if (part.type === 'reasoning') return <Text dimColor>{part.text}</Text>
  if (part.type === 'tool-call') {
    const note =
      part.status === 'needs-approval'
        ? ' (waits for approval)'
        : part.status === 'failed'
          ? ' (failed)'
          : ''
    return <Text color="yellow">{`  - tool ${part.name}${note}`}</Text>
  }
  // A child agent, for example Claude Code or Codex, with its own tool calls.
  const latest = textOf(part.parts).replace(/\s+/g, ' ').trim().slice(-80)
  return (
    <Box flexDirection="column">
      <Text color="magenta">
        {`  - agent ${part.name} (${part.status})${latest ? `: ${latest}` : ''}`}
      </Text>
      {part.parts.map((inner, index) =>
        inner.type === 'tool-call' ? (
          <Text key={index} color="yellow">{`    - tool ${inner.name}`}</Text>
        ) : null,
      )}
    </Box>
  )
}

function Message({ message }: { message: ViewMessage }) {
  if (message.role === 'user')
    return <Text color="cyan">{`> ${message.text}`}</Text>
  if (message.role === 'notice')
    return (
      <Text color={message.kind === 'error' ? 'red' : 'gray'}>
        {message.text}
      </Text>
    )
  return (
    <Box flexDirection="column">
      {message.parts.map((part, index) => (
        <Part key={index} part={part} />
      ))}
    </Box>
  )
}

function Status({ view }: { view: SessionView }) {
  const status = useSelector(view.store, (state) => state.status)
  const approvals = useSelector(view.store, (state) => state.approvals)
  const question = useSelector(view.store, (state) => state.questions.at(0))
  const signIns = useSelector(view.store, (state) => state.signIns)
  const goal = useSelector(view.store, selectGoal)
  return (
    <Box flexDirection="column" marginTop={1}>
      {signIns.map((signIn) => (
        <Text key={signIn.connector} color="magenta">
          {`Sign in to ${signIn.connector}: ${signIn.url ?? `run /connect ${signIn.connector}`}${signIn.userCode ? ` (code ${signIn.userCode})` : ''}`}
        </Text>
      ))}
      {approvals.length > 0 ? (
        <Text color="magenta">
          {`Approve ${approvals.map((item) => item.tool).join(', ')}? [y/n]`}
        </Text>
      ) : null}
      {question ? <Text color="magenta">{`? ${question.message}`}</Text> : null}
      {goal ? (
        <Text color="green">
          {`Goal: ${goal.text} (${goal.status}, round ${goal.round})`}
        </Text>
      ) : null}
      <Text color="gray">
        {status === 'running' ? 'working (Esc cancels, Enter steers)' : status}
      </Text>
    </Box>
  )
}

/** Enter: answer an approval or a question, run a screen command, or send the line. */
async function submit(view: SessionView, line: string, exit: () => void) {
  const text = line.trim()
  const state = view.store.get()
  if (state.approvals.length > 0) {
    if (/^y(es)?$/i.test(text)) view.approveAll()
    else view.rejectAll()
    return
  }
  const [question] = state.questions
  if (question) {
    const answer = /^y(es)?$/i.test(text)
      ? true
      : /^no?$/i.test(text)
        ? false
        : text
    await question.answer(answer)
    return
  }
  if (text === '/exit') return exit()
  if (text === '/help') {
    const commands = state.commands.map(
      (command) => `/${command.name}  ${command.description}`,
    )
    view.notice(
      ['/connect <id>, /disconnect <id>, /exit', ...commands].join('\n'),
    )
    return
  }
  const connect = /^\/(connect|disconnect) (\S+)$/.exec(text)
  if (connect) return view.command(`${connect[1]}:${connect[2]}`)
  await view.send(text)
}

function App({ view }: { view: SessionView }) {
  const { exit } = useApp()
  const messages = useSelector(view.store, (state) => state.messages)
  const [input, setInput] = useState('')
  useInput((character, key) => {
    if (key.escape) {
      if (view.store.get().status === 'running') void view.cancel()
      return
    }
    if (key.return) {
      setInput('')
      void submit(view, input, exit)
      return
    }
    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1))
      return
    }
    if (!key.ctrl && !key.meta && character)
      setInput((current) => current + character)
  })
  return (
    <Box flexDirection="column">
      {messages.slice(-200).map((message) => (
        <Message key={message.id} message={message} />
      ))}
      <Status view={view} />
      <Text>
        <Text color="cyan">{'> '}</Text>
        {input}
        <Text inverse> </Text>
      </Text>
    </Box>
  )
}

/**
 * The Ink screen for `runCli({ ui })`. It opens sign-in links in the browser,
 * and resolves when the user types /exit or presses Ctrl+C.
 */
export async function runTui(view: SessionView) {
  view.on('signIn', (signIn) => {
    if (signIn.url) openInBrowser(signIn.url)
  })
  view.notice('Type a message, or /help for commands and /exit to quit.')
  await render(<App view={view} />).waitUntilExit()
}
