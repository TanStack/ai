import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Spacer,
  Text,
  render,
  useAnimation,
  useApp,
  useInput,
  usePaste,
} from 'ink'
import { useSelector } from '@tanstack/react-store'
import { selectGoal } from '@tanstack/ai-harness/plugins'
import { assistant, features } from './harness'
import {
  canTranscribe,
  chooseMicrophone,
  currentMicrophone,
  isSilent,
  listMicrophones,
  startRecording,
  transcribe,
  withSpokenFiles,
} from './voice'
import type { RenderOptions } from 'ink'
import type { Recording, VoiceClip } from './voice'
import type {
  AgentPart,
  MediaPart,
  SessionView,
  ToolCallPart,
  ViewMessage,
  ViewPart,
} from '@tanstack/ai-harness/view'

// TanStack AI's accent color, the dark-mode step, so it reads on dark terminals.
const ACCENT = '#e06e49'
const KIND_COLOR: Record<string, string> = {
  image: 'magenta',
  audio: 'cyan',
  video: 'blue',
  document: 'white',
}
// The name of the `providerKeys()` plugin: its state is in `state.plugins`.
const PROVIDER_KEYS = 'tanstack/provider-keys'
const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

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

/** A model provider of `providerKeys()`, and where its key comes from. */
interface ProviderKey {
  id: string
  label: string
  state: 'connected' | 'env' | 'missing'
}

function isProviderKey(value: unknown): value is ProviderKey {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'label' in value &&
    typeof value.label === 'string' &&
    'state' in value &&
    (value.state === 'connected' ||
      value.state === 'env' ||
      value.state === 'missing')
  )
}

/**
 * The providers in `saved`, the state of the provider-keys plugin (in
 * `state.plugins`). `/connect` and `/disconnect` update it, so the screen
 * shows the keys live. Empty before the plugin reports.
 */
function providerKeysIn(saved: unknown) {
  const isState =
    typeof saved === 'object' && saved !== null && 'providers' in saved
  if (!isState) return []
  const { providers } = saved
  return Array.isArray(providers) ? providers.filter(isProviderKey) : []
}

/**
 * Is `feature` on? A feature that needs a key follows the saved keys: any
 * one of its providers with a key turns it on. The rest stay as at startup.
 */
function isOn(
  feature: (typeof features)[number],
  keys: ReadonlyArray<ProviderKey>,
) {
  const followsKeys = feature.providers.length > 0 && keys.length > 0
  if (!followsKeys) return feature.on
  return keys.some(
    (key) => feature.providers.includes(key.id) && key.state !== 'missing',
  )
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

function Spinner({ color = 'yellow' }: { color?: string }) {
  const { frame } = useAnimation({ interval: 90 })
  return <Text color={color}>{SPINNER[frame % SPINNER.length]}</Text>
}

/** A short one-line view of tool arguments. */
function argsPreview(call: ToolCallPart) {
  const text =
    typeof call.args === 'object' && call.args !== null
      ? Object.values(call.args)
          .filter((value) => typeof value === 'string')
          .join(', ')
      : ''
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 70 ? `${line.slice(0, 70)}...` : line
}

function ToolLine({
  call,
  indent = 2,
}: {
  call: ToolCallPart
  indent?: number
}) {
  const icon =
    call.status === 'running' ? (
      <Spinner />
    ) : call.status === 'done' ? (
      <Text color="green">✓</Text>
    ) : call.status === 'failed' ? (
      <Text color="red">✗</Text>
    ) : (
      <Text color="magenta">?</Text>
    )
  const preview = argsPreview(call)
  return (
    <Box marginLeft={indent}>
      {icon}
      <Text color="yellow">{` ${call.name}`}</Text>
      {preview ? <Text dimColor>{`  ${preview}`}</Text> : null}
      {call.status === 'needs-approval' ? (
        <Text color="magenta"> waits for your approval</Text>
      ) : null}
    </Box>
  )
}

function MediaLine({
  part,
  saved,
  indent = 2,
}: {
  part: MediaPart
  saved: ReadonlyArray<Saved>
  indent?: number
}) {
  const item = saved.find((entry) => entry.id === part.id)
  const color = KIND_COLOR[part.kind] ?? 'white'
  return (
    <Box marginLeft={indent}>
      <Text color={color} bold>
        {`▣ ${item ? `${item.number} ` : ''}${part.kind}`}
      </Text>
      <Text>{`  ${part.name}`}</Text>
      {item?.path ? <Text dimColor>{`  -> ${item.path}`}</Text> : null}
      {item?.error ? (
        <Text color="red">{`  not saved: ${item.error}`}</Text>
      ) : null}
      {item && !item.path && !item.error ? (
        <Text dimColor> saving...</Text>
      ) : null}
    </Box>
  )
}

/**
 * A child agent, for example Codex or Claude Code, in its own card: its
 * status, its last tool calls, its media, and its output. While it runs, the
 * last 4 lines show. When it ends, the last 15 lines of its answer stay.
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
  const running = part.status === 'running'
  const output = running ? lines.slice(-4) : lines.slice(-15)
  const calls = part.parts.flatMap((inner) =>
    inner.type === 'tool-call' ? [inner] : [],
  )
  const media = part.parts.flatMap((inner) =>
    inner.type === 'media' ? [inner] : [],
  )
  const color = part.status === 'failed' ? 'red' : running ? 'yellow' : 'green'
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={1}
      marginLeft={2}
    >
      <Box>
        {running ? (
          <Spinner color={color} />
        ) : (
          <Text color={color}>{part.status === 'done' ? '✓' : '✗'}</Text>
        )}
        <Text bold>{` ${part.name}`}</Text>
        <Spacer />
        <Text color={color}>{part.status}</Text>
      </Box>
      {calls.slice(-4).map((call) => (
        <ToolLine key={call.id} call={call} indent={0} />
      ))}
      {media.map((inner) => (
        <MediaLine key={inner.id} part={inner} saved={saved} indent={0} />
      ))}
      {output.map((line, index) => (
        <Text key={`line-${index}`} dimColor={running}>
          {line}
        </Text>
      ))}
      {part.error ? <Text color="red">{part.error}</Text> : null}
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
      return (
        <Box marginLeft={2}>
          <Text>{part.text}</Text>
        </Box>
      )
    case 'reasoning':
      return (
        <Box marginLeft={2}>
          <Text dimColor italic>
            {part.text}
          </Text>
        </Box>
      )
    case 'tool-call':
      return <ToolLine call={part} />
    case 'agent':
      return <Agent part={part} saved={saved} />
    case 'media':
      return <MediaLine part={part} saved={saved} />
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
      // A voice message names its files as `@"path"`, shown as a file badge.
      const named: Array<string> = []
      const text = message.text
        .replace(/@"([^"]+)"/g, (_match, path: string) => {
          named.push(basename(path))
          return ''
        })
        .trim()
      const files = [
        ...(message.media ?? []).map((part) => `${part.kind} ${part.name}`),
        ...named,
      ]
      return (
        <Box marginTop={1} flexWrap="wrap">
          <Text bold>
            <Text color={ACCENT}>❯ </Text>
            {text}
            {files.length > 0 ? ' ' : ''}
          </Text>
          {files.map((file) => (
            <Text key={file} color="black" backgroundColor={ACCENT}>
              {` ${file} `}
            </Text>
          ))}
        </Box>
      )
    }
    case 'notice': {
      const isError = message.kind === 'error'
      return (
        <Box marginLeft={2}>
          <Text
            color={isError ? 'red' : 'gray'}
          >{`${isError ? '✗' : '·'} ${message.text}`}</Text>
        </Box>
      )
    }
    case 'assistant':
      return (
        <Box flexDirection="column" marginTop={1}>
          {message.parts.map((part, index) => (
            <Part key={index} part={part} saved={saved} />
          ))}
        </Box>
      )
  }
}

function Header({ view }: { view: SessionView }) {
  const model = useSelector(
    view.store,
    (state) => state.config.find((entry) => entry.key === 'model')?.value,
  )
  // The plugin state, not a new list, so the header renders only on a change.
  const saved = useSelector(view.store, (state) => state.plugins[PROVIDER_KEYS])
  const keys = providerKeysIn(saved)
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={ACCENT}
      paddingX={1}
    >
      <Box>
        <Text color={ACCENT} bold>
          ◆ TanStack AI
        </Text>
        <Text bold> harness</Text>
        <Text dimColor>{`  ${assistant.name}`}</Text>
        <Spacer />
        <Text dimColor>model </Text>
        <Text color="cyan" bold>
          {String(model ?? '?')}
        </Text>
      </Box>
      <Box flexWrap="wrap">
        {features.map((feature) => {
          const on = isOn(feature, keys)
          return (
            <Text key={feature.name} color={on ? 'green' : 'gray'}>
              {`${on ? '●' : '○'} ${feature.name}   `}
            </Text>
          )
        })}
      </Box>
      {keys.length > 0 ? (
        <Box flexWrap="wrap">
          <Text dimColor>keys </Text>
          {keys.map((key) => (
            <Text
              key={key.id}
              color={key.state === 'missing' ? 'gray' : 'green'}
            >
              {`${key.id} ${key.state === 'missing' ? '○' : '●'}  `}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

type VoiceState = 'idle' | 'starting' | 'recording' | 'transcribing'

/** A live level meter from the microphone loudness (0 to 32768). */
function LevelMeter({ recording }: { recording: Recording }) {
  const { time } = useAnimation({ interval: 80 })
  const level = recording.level()
  // Map loudness to 0..1 on a log scale: -60 dB is empty, 0 dB is full.
  const decibels = 20 * Math.log10(Math.max(level, 1) / 32768)
  const filled = Math.round(Math.min(1, Math.max(0, (decibels + 60) / 60)) * 16)
  const seconds = Math.floor(time / 1000)
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <Box>
      <Text color="red" bold>{`● REC ${clock}  `}</Text>
      <Text color={filled > 9 ? 'green' : filled > 4 ? 'yellow' : 'gray'}>
        {'▮'.repeat(filled)}
      </Text>
      <Text dimColor>{'▯'.repeat(16 - filled)}</Text>
      <Text dimColor>{`  ${recording.microphone}`}</Text>
    </Box>
  )
}

function Status({
  view,
  voice,
  recording,
}: {
  view: SessionView
  voice: VoiceState
  recording: Recording | undefined
}) {
  const status = useSelector(view.store, (state) => state.status)
  const approvals = useSelector(view.store, (state) => state.approvals)
  const question = useSelector(view.store, (state) => state.questions.at(0))
  const signIns = useSelector(view.store, (state) => state.signIns)
  const goal = useSelector(view.store, selectGoal)
  return (
    <Box flexDirection="column" marginTop={1}>
      {signIns.map((signIn) => (
        <Text key={signIn.connector} color="magenta">
          {`◇ Sign in to ${signIn.connector}: ${signIn.url ?? `run /connect ${signIn.connector}`}${signIn.userCode ? ` (code ${signIn.userCode})` : ''}`}
        </Text>
      ))}
      {approvals.length > 0 ? (
        <Text color="magenta" bold>
          {`◇ Approve ${approvals.map((item) => item.tool).join(', ')}? Type y or n.`}
        </Text>
      ) : null}
      {question ? <Text color="magenta">{`◇ ${question.message}`}</Text> : null}
      {goal ? (
        <Text color="green">{`◎ Goal: ${goal.text} (${goal.status}, round ${goal.round})`}</Text>
      ) : null}
      {voice === 'recording' && recording ? (
        <Box flexDirection="column">
          <LevelMeter recording={recording} />
          <Text dimColor>
            Let go of Ctrl+R (or tap it again) to send. Esc drops it.
          </Text>
        </Box>
      ) : voice === 'starting' ? (
        <Box>
          <Spinner color="red" />
          <Text color="red"> opening the microphone...</Text>
        </Box>
      ) : voice === 'transcribing' ? (
        <Box>
          <Spinner color="cyan" />
          <Text color="cyan"> listening to your voice message...</Text>
        </Box>
      ) : status === 'running' ? (
        <Box>
          <Spinner />
          <Text color="yellow"> working</Text>
          <Text dimColor> Esc cancels, typing steers</Text>
        </Box>
      ) : null}
    </Box>
  )
}

function InputBox({
  input,
  voice,
  hidden,
}: {
  input: string
  voice: VoiceState
  /** The input is a secret (a key): show a dot for each character. */
  hidden: boolean
}) {
  const active = voice === 'idle'
  return (
    <Box
      borderStyle="round"
      borderColor={voice === 'recording' ? 'red' : active ? ACCENT : 'gray'}
      paddingX={1}
    >
      <Text color={ACCENT} bold>
        {'❯ '}
      </Text>
      {input === '' ? (
        <Text dimColor>
          {hidden
            ? 'Paste the key. It stays hidden.'
            : 'Type a message, @file to attach, or hold Ctrl+R to talk'}
        </Text>
      ) : (
        <Text>{hidden ? '•'.repeat(input.length) : input}</Text>
      )}
      <Text inverse> </Text>
    </Box>
  )
}

const HELP = [
  'Voice: hold Ctrl+R and talk, then let go. Or tap Ctrl+R, talk, tap again.',
  '  Name a file ("use cat dot png") or say "the last image" to send it too.',
  '  The first recording listens on all microphones and keeps the loudest.',
  '/mic [n]      list the microphones, or record from microphone n',
  '/voice <file> send a recorded voice message',
  '/open [n]     open media file n (default: the last one)',
  '/play [n]     play audio or video file n',
  '/connect <id> connect a model provider (/keys lists them), notion, or linear',
  '/disconnect <id> remove that key or sign-in',
  '/keys         show where each model key comes from',
  '/exit         quit',
]

// A key held down repeats. Repeats closer than this are one press.
const REPEAT_GAP = 1100
// After the last repeat, the key is up when no repeat comes for this long.
const RELEASE_WAIT = 450

function App({ view }: { view: SessionView }) {
  const { exit } = useApp()
  const messages = useSelector(view.store, (state) => state.messages)
  const saved = useSavedMedia(view, messages)
  // The input line. `hidden`: it holds a secret (a key), typed while a
  // question asked for one. It stays hidden until it is sent or deleted, also
  // when the question ends first, so a key never shows or goes out as a
  // message.
  const [input, setInput] = useState({ text: '', hidden: false })
  const secretAsked = useSelector(
    view.store,
    (state) => state.questions.at(0)?.secret === true,
  )
  /** Add typed or pasted text to the input line. */
  const type = (text: string) => {
    const asked = view.store.get().questions.at(0)?.secret === true
    setInput((current) => ({
      text: current.text + text,
      hidden: asked || (current.hidden && current.text !== ''),
    }))
  }
  const [voice, setVoiceState] = useState<VoiceState>('idle')
  // The phase in a ref too: key events come faster than React renders, and a
  // second Ctrl+R must see "starting" at once, or it starts a second recorder.
  const phase = useRef<VoiceState>('idle')
  const setVoice = (next: VoiceState) => {
    phase.current = next
    setVoiceState(next)
  }
  const recording = useRef<Recording | undefined>(undefined)
  const [recorder, setRecorder] = useState<Recording | undefined>(undefined)
  const talk = useRef({
    last: 0,
    holding: false,
    stopWanted: false,
    cancelWanted: false,
  })
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fail = (error: unknown) =>
    view.notice(
      `Voice: ${error instanceof Error ? error.message : String(error)}`,
    )

  /** A voice message: transcribe it, attach the files it names, and send it. */
  const hear = async (audio: Uint8Array, name: string, clip?: VoiceClip) => {
    setVoice('transcribing')
    try {
      if (clip?.pickedMicrophone)
        view.notice(
          `Voice: using "${clip.microphone}" from now on. /mic changes it.`,
        )
      // Transcription models make up words for silence, so it is not sent.
      if (clip && isSilent(clip))
        return view.notice(
          `Voice: only silence from "${clip.microphone}". Hold Ctrl+R while you talk, or pick another microphone with /mic.`,
        )
      const text = await transcribe(audio, {
        name,
        threadId: view.store.get().threadId,
      })
      if (text === '') return view.notice('Voice: no speech heard.')
      const recent = saved.flatMap((item) =>
        item.path ? [{ kind: item.kind, path: item.path }] : [],
      )
      const message = await withSpokenFiles(
        text,
        [playground, mediaDir],
        recent,
      )
      await view.send(message.text)
    } catch (error) {
      fail(error)
    } finally {
      setVoice('idle')
    }
  }

  const stopTalking = async () => {
    clearTimeout(release.current)
    const current = recording.current
    if (!current) {
      // Still opening: stop as soon as it is open.
      talk.current.stopWanted = true
      return
    }
    recording.current = undefined
    setRecorder(undefined)
    await current
      .stop()
      .then((clip) => hear(clip.audio, 'voice.wav', clip), fail)
  }

  const startTalking = async () => {
    talk.current = {
      last: Date.now(),
      holding: false,
      stopWanted: false,
      cancelWanted: false,
    }
    // "starting" before the key check, so a repeated Ctrl+R starts nothing.
    setVoice('starting')
    try {
      if (!(await canTranscribe(view.store.get().threadId))) {
        setVoice('idle')
        return view.notice(
          'Voice: run /connect openai (or /connect grok) to turn voice on.',
        )
      }
      const started = await startRecording()
      if (talk.current.cancelWanted) {
        started.cancel()
        setVoice('idle')
        return
      }
      recording.current = started
      setRecorder(started)
      setVoice('recording')
      if (talk.current.stopWanted) await stopTalking()
    } catch (error) {
      setVoice('idle')
      fail(error)
    }
  }

  /**
   * Ctrl+R. A terminal sends no key-up, only repeats while a key is held. So
   * repeats mean "held": the recording stops when they stop. A single press
   * starts, and the next single press stops.
   */
  const onTalkKey = () => {
    const now = Date.now()
    const gap = now - talk.current.last
    talk.current.last = now
    if (phase.current === 'transcribing') return
    if (phase.current === 'idle') return void startTalking()
    if (gap < REPEAT_GAP) {
      talk.current.holding = true
      clearTimeout(release.current)
      release.current = setTimeout(() => void stopTalking(), RELEASE_WAIT)
      return
    }
    if (!talk.current.holding) void stopTalking()
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
  const submit = async (line: { text: string; hidden: boolean }) => {
    const text = line.text.trim()
    const state = view.store.get()
    const [question] = state.questions
    if (question?.secret) {
      // The key goes as it is. The screen does not show it anywhere.
      await question.answer(text)
      return
    }
    if (line.hidden) {
      // The question ended before Enter: drop the key, do not send it.
      view.notice('The key question ended, so the key was not used.')
      return
    }
    if (state.approvals.length > 0) {
      if (/^y(es)?$/i.test(text)) view.approveAll()
      else view.rejectAll()
      return
    }
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
      const keys = providerKeysIn(state.plugins[PROVIDER_KEYS])
      const off = features
        .filter((feature) => !isOn(feature, keys))
        .map(
          (feature) => `  ${feature.name} is off: it needs ${feature.needs}.`,
        )
      const commands = state.commands.map(
        (command) => `/${command.name}  ${command.description}`,
      )
      view.notice([...HELP, ...off, ...commands].join('\n'))
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
      if (chosen) await chooseMicrophone(chosen)
      const current = await currentMicrophone()
      view.notice(
        names.length === 0
          ? `Recording from the default input${current ? ` (${current})` : ''}.`
          : [
              ...names.map(
                (name, index) =>
                  `${name === current ? '●' : '○'} ${index + 1}. ${name}`,
              ),
              current
                ? '/mic <n> records from microphone n.'
                : 'No microphone yet: the first recording picks the loudest.',
            ].join('\n'),
      )
      return
    }
    if (command === '/voice') {
      if (!arg) return view.notice('Give an audio file: /voice note.m4a')
      const path = arg.replace(/^@|^"|"$/g, '')
      const audio = await readFile(path).catch(fail)
      if (audio) await hear(new Uint8Array(audio), basename(path))
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

  usePaste(type)

  useInput((character, key) => {
    if (key.ctrl && character === 'r') return onTalkKey()
    if (key.escape) {
      clearTimeout(release.current)
      if (phase.current === 'starting') {
        // Drop the recording as soon as the microphone is open.
        talk.current.cancelWanted = true
        return
      }
      const current = recording.current
      if (current) {
        recording.current = undefined
        setRecorder(undefined)
        current.cancel()
        setVoice('idle')
        return
      }
      if (view.store.get().status === 'running') void view.cancel()
      return
    }
    if (key.return) {
      if (phase.current === 'recording' || phase.current === 'starting')
        return void stopTalking()
      setInput({ text: '', hidden: false })
      void submit(input)
      return
    }
    if (key.backspace || key.delete) {
      setInput((current) => ({ ...current, text: current.text.slice(0, -1) }))
      return
    }
    if (!key.ctrl && !key.meta && character) type(character)
  })

  return (
    <Box flexDirection="column">
      <Header view={view} />
      {messages.slice(-60).map((message) => (
        <Message key={message.id} message={message} saved={saved} />
      ))}
      <Status view={view} voice={voice} recording={recorder} />
      <InputBox
        input={input.text}
        voice={voice}
        hidden={secretAsked || (input.hidden && input.text !== '')}
      />
      <Text dimColor>
        {
          '  Ctrl+R talk   Esc cancel   /model   /keys   /mic   /open   /play   /help   /exit'
        }
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
  const keys = providerKeysIn(view.store.get().plugins[PROVIDER_KEYS])
  if (keys.every((key) => key.state === 'missing'))
    view.notice(
      'No model key yet. Run /connect openai to paste a key, or /connect openrouter to sign in with the browser. /keys lists them all.',
    )
  view.notice('Hold Ctrl+R to talk, or type. /help lists the commands.')
  // ponytail: the SDK logs its warnings and errors on the console (the message,
  // then its details with console.dir). Ink prints console output above the
  // screen, and the screen shows those errors itself, so it drops them.
  const { warn, error, dir } = console
  let dropDetails = false
  const quiet =
    (log: (...args: Array<unknown>) => void) =>
    (...args: Array<unknown>) => {
      const text = typeof args[0] === 'string' ? args[0] : ''
      dropDetails = /\[tanstack-ai:(warn|errors)\]/.test(text)
      if (!dropDetails) log(...args)
    }
  console.warn = quiet(warn)
  console.error = quiet(error)
  console.dir = (...args: Parameters<typeof console.dir>) => {
    if (dropDetails) dropDetails = false
    else dir(...args)
  }
  try {
    await render(<App view={view} />, io).waitUntilExit()
  } finally {
    Object.assign(console, { warn, error, dir })
  }
}
