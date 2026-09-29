import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { useSelector } from '@tanstack/react-store'
import { selectGoal } from '@tanstack/ai-harness/plugins'
import { assistant } from './harness'
import type {
  AgentPart,
  MediaPart,
  SessionView,
  ViewMessage,
  ViewPart,
} from '@tanstack/ai-harness/view'

/** Where each media file is saved or why not, by media id. */
type MediaNotes = ReadonlyMap<string, string>

// ponytail: the CLI's default media folder, `./<harness-name>-media`. A custom
// ui gets no `--media-dir`, and the CLI does not export `defaultMediaDir`, so
// this copies its rule. The media id in front of the name keeps names unique.
const mediaDir = `${assistant.name.replace(/[^\w.-]+/g, '-').replace(/^[-.]+|-+$/g, '')}-media`

/** Write the bytes of a media file into `mediaDir`, and return the path. */
async function saveMedia(part: MediaPart) {
  await mkdir(mediaDir, { recursive: true })
  const path = join(mediaDir, `${part.id}-${basename(part.name)}`)
  await writeFile(path, await part.load())
  return path
}

/** Add the media parts of `parts` to `into`, also the ones of child agents. */
function collectMedia(parts: ReadonlyArray<ViewPart>, into: Array<MediaPart>) {
  for (const part of parts) {
    if (part.type === 'media') into.push(part)
    if (part.type === 'agent') collectMedia(part.parts, into)
  }
}

/** The media files that the agents made, from the assistant messages. */
function generatedMedia(messages: ReadonlyArray<ViewMessage>) {
  const media: Array<MediaPart> = []
  for (const message of messages) {
    if (message.role === 'assistant') collectMedia(message.parts, media)
  }
  return media
}

/**
 * Save each new media file once, and keep a note per file: the path, or why
 * it was not saved. Files in the history when the screen opens are not saved
 * again.
 */
function useSavedMedia(view: SessionView, messages: Array<ViewMessage>) {
  const [notes, setNotes] = useState(() => new Map<string, string>())
  const [seen] = useState(
    () =>
      new Set(generatedMedia(view.store.get().messages).map((part) => part.id)),
  )
  useEffect(() => {
    const media = generatedMedia(messages)
    for (const part of media) {
      if (seen.has(part.id)) continue
      seen.add(part.id)
      const note = (text: string) =>
        setNotes((current) => new Map(current).set(part.id, text))
      saveMedia(part).then(
        (path) => note(`saved: ${path}`),
        (error: unknown) =>
          note(
            `not saved: ${error instanceof Error ? error.message : String(error)}`,
          ),
      )
    }
  }, [messages, seen])
  return notes
}

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

/** One line for a media file an agent made: kind, name, and where it went. */
function MediaLine({
  part,
  notes,
  indent,
}: {
  part: MediaPart
  notes: MediaNotes
  indent: string
}) {
  const note = notes.get(part.id)
  return (
    <Text color="green">
      {`${indent}- ${part.kind} ${part.name}${note ? ` (${note})` : ''}`}
    </Text>
  )
}

/** A child agent, for example Claude Code or Codex, with its tool calls and media. */
function Agent({ part, notes }: { part: AgentPart; notes: MediaNotes }) {
  const latest = textOf(part.parts).replace(/\s+/g, ' ').trim().slice(-80)
  return (
    <Box flexDirection="column">
      <Text color="magenta">
        {`  - agent ${part.name} (${part.status})${latest ? `: ${latest}` : ''}`}
      </Text>
      {part.parts.map((inner, index) => {
        if (inner.type === 'tool-call')
          return (
            <Text key={index} color="yellow">{`    - tool ${inner.name}`}</Text>
          )
        if (inner.type === 'media')
          return (
            <MediaLine key={index} part={inner} notes={notes} indent="    " />
          )
        return null
      })}
    </Box>
  )
}

function Part({ part, notes }: { part: ViewPart; notes: MediaNotes }) {
  switch (part.type) {
    case 'text':
      return <Text>{part.text}</Text>
    case 'reasoning':
      return <Text dimColor>{part.text}</Text>
    case 'tool-call': {
      const note =
        part.status === 'needs-approval'
          ? ' (waits for approval)'
          : part.status === 'failed'
            ? ' (failed)'
            : ''
      return <Text color="yellow">{`  - tool ${part.name}${note}`}</Text>
    }
    case 'agent':
      return <Agent part={part} notes={notes} />
    case 'media':
      return <MediaLine part={part} notes={notes} indent="  " />
  }
}

function Message({
  message,
  notes,
}: {
  message: ViewMessage
  notes: MediaNotes
}) {
  switch (message.role) {
    case 'user': {
      // The files the user sent go after the text: `[image cat.png]`.
      const files = (message.media ?? []).map(
        (part) => `[${part.kind} ${part.name}]`,
      )
      const line = [message.text, ...files].filter((text) => text !== '')
      return <Text color="cyan">{`> ${line.join(' ')}`}</Text>
    }
    case 'notice':
      return (
        <Text color={message.kind === 'error' ? 'red' : 'gray'}>
          {message.text}
        </Text>
      )
    case 'assistant':
      return (
        <Box flexDirection="column">
          {message.parts.map((part, index) => (
            <Part key={index} part={part} notes={notes} />
          ))}
        </Box>
      )
  }
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
  const notes = useSavedMedia(view, messages)
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
        <Message key={message.id} message={message} notes={notes} />
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
 * saves the media the agents make into `./<harness-name>-media`, and resolves
 * when the user types /exit or presses Ctrl+C.
 */
export async function runTui(view: SessionView) {
  view.on('signIn', (signIn) => {
    if (signIn.url) openInBrowser(signIn.url)
  })
  view.notice('Type a message, or /help for commands and /exit to quit.')
  await render(<App view={view} />).waitUntilExit()
}
