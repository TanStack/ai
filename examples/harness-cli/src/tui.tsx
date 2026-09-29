import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { useEffect, useRef, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import { useSelector } from '@tanstack/react-store'
import { selectGoal } from '@tanstack/ai-harness/plugins'
import { assistant } from './harness'
import {
  currentMicrophone,
  isSilent,
  listMicrophones,
  startRecording,
  transcribe,
  chooseMicrophone,
  withSpokenFiles,
} from './voice'
import type { RenderOptions } from 'ink'
import type { Recording } from './voice'
import type {
  AgentPart,
  MediaPart,
  SessionView,
  ViewMessage,
  ViewPart,
} from '@tanstack/ai-harness/view'

// ponytail: the CLI's default media folder, `./<harness-name>-media`. A custom
// ui gets no `--media-dir`, and the CLI does not export `defaultMediaDir`, so
// this copies its rule. The media id in front of the name keeps names unique.
const mediaDir = `${assistant.name.replace(/[^\w.-]+/g, '-').replace(/^[-.]+|-+$/g, '')}-media`
const playground = fileURLToPath(new URL('../playground', import.meta.url))

/** A media file the screen saved. `number` is what `/open` and `/play` take. */
interface Saved {
  id: string
  number: number
  kind: string
  name: string
  path?: string
  error?: string
}

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
 * Save each new media file once, and number it. Files in the history when
 * the screen opens are not saved again.
 */
function useSavedMedia(view: SessionView, messages: Array<ViewMessage>) {
  const [saved, setSaved] = useState<ReadonlyArray<Saved>>([])
  const [seen] = useState(
    () =>
      new Set(generatedMedia(view.store.get().messages).map((part) => part.id)),
  )
  useEffect(() => {
    for (const part of generatedMedia(messages)) {
      if (seen.has(part.id)) continue
      seen.add(part.id)
      const number = seen.size
      const update = (change: Partial<Saved>) =>
        setSaved((current) =>
          current.map((item) =>
            item.id === part.id ? { ...item, ...change } : item,
          ),
        )
      setSaved((current) => [
        ...current,
        { id: part.id, number, kind: part.kind, name: part.name },
      ])
      saveMedia(part).then(
        (path) => update({ path }),
        (error: unknown) =>
          update({
            error: error instanceof Error ? error.message : String(error),
          }),
      )
    }
  }, [messages, seen])
  return saved
}

function textOf(parts: ReadonlyArray<ViewPart>) {
  return parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
}

/** Start a program without a shell. The screen still shows the path on error. */
function launch(command: string, args: Array<string>) {
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}

/** Open a link or a file with the default app. No shell is involved. */
function openExternal(target: string) {
  if (process.platform === 'win32') {
    // Not `cmd /c start`: cmd would read `&` in a URL as a command separator.
    if (/^https?:\/\//.test(target))
      launch('rundll32', ['url.dll,FileProtocolHandler', target])
    else launch('explorer', [resolve(target)])
    return
  }
  launch(process.platform === 'darwin' ? 'open' : 'xdg-open', [target])
}

/** Play audio or video with ffplay, which comes with ffmpeg. */
function play(item: Saved & { path: string }) {
  const window = item.kind === 'video' ? [] : ['-nodisp']
  launch(process.env.FFPLAY_PATH || 'ffplay', [
    ...window,
    '-autoexit',
    '-loglevel',
    'quiet',
    item.path,
  ])
}

function MediaLine({
  part,
  saved,
  indent,
}: {
  part: MediaPart
  saved: ReadonlyArray<Saved>
  indent: string
}) {
  const item = saved.find((entry) => entry.id === part.id)
  const where = item?.path
    ? ` saved: ${item.path}`
    : item?.error
      ? ` not saved: ${item.error}`
      : ''
  const number = item ? `[${item.number}] ` : ''
  return (
    <Text color="green">{`${indent}- ${number}${part.kind} ${part.name}${where}`}</Text>
  )
}

/**
 * A child agent, for example Codex or Claude Code: its status, its last tool
 * calls, its media, and its output. While it runs, the last 3 lines show. When
 * it ends, the last 15 lines of its answer stay.
 */
function Agent({
  part,
  saved,
}: {
  part: AgentPart
  saved: ReadonlyArray<Saved>
}) {
  const lines = textOf(part.parts)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '')
  const output = part.status === 'running' ? lines.slice(-3) : lines.slice(-15)
  const tools = part.parts.flatMap((inner) =>
    inner.type === 'tool-call' ? [inner.name] : [],
  )
  const media = part.parts.flatMap((inner) =>
    inner.type === 'media' ? [inner] : [],
  )
  const color =
    part.status === 'failed'
      ? 'red'
      : part.status === 'done'
        ? 'magenta'
        : 'yellow'
  return (
    <Box flexDirection="column">
      <Text color={color}>{`  - agent ${part.name} (${part.status})`}</Text>
      {tools.slice(-5).map((name, index) => (
        <Text key={`tool-${index}`} color="yellow">{`    - tool ${name}`}</Text>
      ))}
      {media.map((inner) => (
        <MediaLine key={inner.id} part={inner} saved={saved} indent="    " />
      ))}
      {output.map((line, index) => (
        <Text key={`line-${index}`} dimColor={part.status === 'running'}>
          {`    ${line}`}
        </Text>
      ))}
      {part.error ? <Text color="red">{`    ${part.error}`}</Text> : null}
    </Box>
  )
}

function Part({
  part,
  saved,
}: {
  part: ViewPart
  saved: ReadonlyArray<Saved>
}) {
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
      return <Agent part={part} saved={saved} />
    case 'media':
      return <MediaLine part={part} saved={saved} indent="  " />
  }
}

function Message({
  message,
  saved,
}: {
  message: ViewMessage
  saved: ReadonlyArray<Saved>
}) {
  switch (message.role) {
    case 'user': {
      // The files the user sent go after the text: `[image cat.png]`. A
      // voice message names its files as `@"path"`, shown as `[cat.png]`.
      const files = (message.media ?? []).map(
        (part) => `[${part.kind} ${part.name}]`,
      )
      const text = message.text.replace(
        /@"([^"]+)"/g,
        (_match, path: string) => `[${basename(path)}]`,
      )
      const line = [text, ...files].filter((item) => item !== '')
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
            <Part key={index} part={part} saved={saved} />
          ))}
        </Box>
      )
  }
}

type VoiceState = 'idle' | 'recording' | 'transcribing'

function Header({ view }: { view: SessionView }) {
  const model = useSelector(
    view.store,
    (state) => state.config.find((entry) => entry.key === 'model')?.value,
  )
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text
        bold
      >{`TanStack AI harness: ${assistant.name}  (model: ${String(model ?? '?')})`}</Text>
      <Text color="gray">
        Ctrl+R talk | Esc cancel | /help | /model | /connect notion | /open |
        /play | /exit
      </Text>
    </Box>
  )
}

function Status({
  view,
  voice,
  microphone,
}: {
  view: SessionView
  voice: VoiceState
  microphone: string
}) {
  const status = useSelector(view.store, (state) => state.status)
  const approvals = useSelector(view.store, (state) => state.approvals)
  const question = useSelector(view.store, (state) => state.questions.at(0))
  const signIns = useSelector(view.store, (state) => state.signIns)
  const goal = useSelector(view.store, selectGoal)
  const line =
    voice === 'recording'
      ? `recording from ${microphone}: speak, then press Ctrl+R or Enter to send (Esc drops it)`
      : voice === 'transcribing'
        ? 'transcribing your voice message...'
        : status === 'running'
          ? 'working (Esc cancels, Enter steers)'
          : status
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
      <Text color={voice === 'recording' ? 'red' : 'gray'}>{line}</Text>
    </Box>
  )
}

const HELP = [
  'Voice: press Ctrl+R, speak, press Ctrl+R again. Name a file ("use cat dot png") or say "the last image" to send it too.',
  '/voice <audio file>  send a recorded voice message',
  '/mic [n]  list the microphones, or record from microphone n',
  '/open [n]  open media file n (default: the last one)',
  '/play [n]  play audio or video file n',
  '/connect <id>, /disconnect <id>  sign in to notion or linear',
  '@path in a message sends that file. /exit quits.',
]

function App({ view }: { view: SessionView }) {
  const { exit } = useApp()
  const messages = useSelector(view.store, (state) => state.messages)
  const saved = useSavedMedia(view, messages)
  const [input, setInput] = useState('')
  const [voice, setVoice] = useState<VoiceState>('idle')
  const [microphone, setMicrophone] = useState('')
  const recording = useRef<Recording | undefined>(undefined)

  const fail = (error: unknown) =>
    view.notice(
      `Voice: ${error instanceof Error ? error.message : String(error)}`,
    )

  /** A voice message: transcribe it, attach the files it names, and send it. */
  const hear = async (audio: Uint8Array, name: string) => {
    setVoice('transcribing')
    try {
      // A recording from the microphone that holds only silence is not sent:
      // transcription models make up words for it.
      if (name === 'voice.wav' && isSilent(audio))
        return view.notice(
          `Voice: only silence from "${await currentMicrophone()}". Speak closer, or pick another microphone with /mic.`,
        )
      const text = await transcribe(audio, name)
      if (text === '') return view.notice('Voice: no speech heard.')
      const recent = saved.flatMap((item) =>
        item.path ? [{ kind: item.kind, path: item.path }] : [],
      )
      const message = await withSpokenFiles(
        text,
        [playground, mediaDir],
        recent,
      )
      const files =
        message.files.length > 0 ? ` (files: ${message.files.join(', ')})` : ''
      view.notice(`Heard: "${text}"${files}`)
      await view.send(message.text)
    } catch (error) {
      fail(error)
    } finally {
      setVoice('idle')
    }
  }

  const toggleVoice = async () => {
    if (voice === 'transcribing') return
    const current = recording.current
    if (current) {
      recording.current = undefined
      await current.stop().then((audio) => hear(audio, 'voice.wav'), fail)
      return
    }
    try {
      recording.current = await startRecording()
      setVoice('recording')
      setMicrophone(await currentMicrophone().catch(() => 'the default input'))
    } catch (error) {
      fail(error)
    }
  }

  /** The saved media file `/open 2` or `/play` names. */
  const pick = (arg: string | undefined) => {
    const ready = saved.filter((item) => item.path !== undefined)
    const item = arg
      ? ready.find((entry) => entry.number === Number(arg))
      : ready.at(-1)
    if (!item?.path) {
      view.notice(arg ? `No saved media file ${arg}.` : 'No media file yet.')
      return undefined
    }
    return { ...item, path: item.path }
  }

  /** Enter: answer an approval or a question, run a screen command, or send. */
  const submit = async (line: string) => {
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
      view.notice([...HELP, ...commands].join('\n'))
      return
    }
    const [command, ...rest] = text.split(' ')
    const arg = rest.join(' ').trim() || undefined
    if (command === '/mic') {
      const names = await listMicrophones().catch((error: unknown) => {
        fail(error)
        return []
      })
      const chosen = arg ? names[Number(arg) - 1] : undefined
      if (chosen) chooseMicrophone(chosen)
      const current = await currentMicrophone().catch(() => undefined)
      view.notice(
        names.length === 0
          ? `Recording from the default input${current ? ` (${current})` : ''}.`
          : [
              ...names.map(
                (name, index) =>
                  `${name === current ? '*' : ' '} ${index + 1}. ${name}`,
              ),
              '/mic <n> records from microphone n.',
            ].join('\n'),
      )
      return
    }
    if (command === '/voice') {
      if (!arg) return view.notice('Give an audio file: /voice note.m4a')
      const audio = await readFile(arg.replace(/^@|^"|"$/g, '')).catch(fail)
      if (audio) await hear(new Uint8Array(audio), basename(arg))
      return
    }
    if (command === '/open' || command === '/play') {
      const item = pick(arg)
      if (!item) return
      if (command === '/play' && item.kind !== 'image') play(item)
      else openExternal(item.path)
      return
    }
    const connect = /^\/(connect|disconnect) (\S+)$/.exec(text)
    if (connect) return view.command(`${connect[1]}:${connect[2]}`)
    await view.send(text)
  }

  useInput((character, key) => {
    if (key.ctrl && character === 'r') {
      void toggleVoice()
      return
    }
    if (key.escape) {
      const current = recording.current
      if (current) {
        recording.current = undefined
        current.cancel()
        setVoice('idle')
        return
      }
      if (view.store.get().status === 'running') void view.cancel()
      return
    }
    if (key.return) {
      if (recording.current) {
        void toggleVoice()
        return
      }
      setInput('')
      void submit(input)
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
      <Header view={view} />
      {messages.slice(-200).map((message) => (
        <Message key={message.id} message={message} saved={saved} />
      ))}
      <Status view={view} voice={voice} microphone={microphone} />
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
 * records voice messages, saves the media the agents make into
 * `./<harness-name>-media`, and resolves when the user types /exit or presses
 * Ctrl+C. `io` replaces the terminal, for a test.
 */
export async function runTui(view: SessionView, io: RenderOptions = {}) {
  view.on('signIn', (signIn) => {
    if (signIn.url) openExternal(signIn.url)
  })
  view.notice(
    'Type a message, or press Ctrl+R to talk. /help lists the commands.',
  )
  // ponytail: the adapters warn on the console about tool schemas they send
  // without strict mode. Ink prints console output above the screen, so the
  // screen drops only those warnings.
  const warn = console.warn
  console.warn = (...args: Array<unknown>) => {
    if (typeof args[0] === 'string' && args[0].includes('[tanstack-ai:warn]'))
      return
    warn(...args)
  }
  try {
    await render(<App view={view} />, io).waitUntilExit()
  } finally {
    console.warn = warn
  }
}
