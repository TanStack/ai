import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import {
  Box,
  Spacer,
  Static,
  Text,
  measureElement,
  render,
  useApp,
  useBoxMetrics,
  useInput,
  usePaste,
  useStdout,
  useWindowSize,
} from 'ink'
import { useSelector } from '@tanstack/react-store'
import { supportedReasoningLevels } from '@tanstack/ai-models'
import {
  assistant,
  features,
  keyProviders,
  modelInfo,
  modelProviders,
  reasons,
} from './harness'
import { hasSession, listSessions } from './sessions'
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
import { useLineEditor } from './screen/editor'
import { Footer } from './screen/footer'
import { PROVIDER_KEYS, isOn, providerKeysIn } from './screen/keys'
import { mediaDir, openExternal, play, useSavedMedia } from './screen/media'
import { Menu } from './screen/menu'
import { Message, settledCount } from './screen/parts'
import { Status } from './screen/status'
import { ACCENT, compact } from './screen/theme'
import type { ReactNode } from 'react'
import type { DOMElement, RenderOptions } from 'ink'
import type { ModelEntry } from './harness'
import type { Recording, VoiceClip } from './voice'
import type { Line } from './screen/editor'
import type { MenuItem } from './screen/menu'
import type { VoiceState } from './screen/status'
import type {
  SessionView,
  SessionViewState,
  ViewCommand,
  ViewMessage,
} from '@tanstack/ai-harness/view'

const playground = fileURLToPath(new URL('../playground', import.meta.url))

/** The commands of the screen itself. The harness adds its own to the list. */
const SCREEN_COMMANDS = [
  {
    name: 'connect',
    description: 'Connect a model provider, Notion, or Linear',
  },
  { name: 'disconnect', description: 'Remove a key or a sign-in' },
  { name: 'model', description: 'Pick the model' },
  { name: 'effort', description: 'Pick how hard the model thinks' },
  { name: 'resume', description: 'Continue a saved session' },
  { name: 'mic', description: 'Pick the microphone' },
  { name: 'open', description: 'Open a media file (default: the last one)' },
  { name: 'play', description: 'Play an audio or video file' },
  {
    name: 'voice',
    description: 'Send a recorded voice message: /voice note.m4a',
  },
  { name: 'help', description: 'Show the commands and the voice tips' },
  { name: 'exit', description: 'Quit' },
]
// Commands that need text after the name: Enter in the list fills the name.
const TAKES_INPUT = new Set(['voice'])

const HELP = [
  'Type / to see the commands. ↑ and ↓ go through the lines you sent.',
  'Voice: hold Ctrl+R and talk, then let go. Or tap Ctrl+R, talk, tap again.',
  '  The words go into the input line. Fix them if needed, then press Enter.',
  '  Name a file ("use cat dot png") or say "the last image" to send it too.',
  '  The first recording listens on all microphones and keeps the loudest.',
]

/** The `/` commands that start with (or contain) what you typed after `/`. */
function suggestionsFor(text: string, commands: ReadonlyArray<ViewCommand>) {
  if (!/^\/\S*$/.test(text)) return []
  const query = text.slice(1).toLowerCase()
  const own = new Set(SCREEN_COMMANDS.map((command) => command.name))
  const all: Array<MenuItem & { takesInput: boolean }> = [
    ...SCREEN_COMMANDS.map((command) => ({
      id: command.name,
      label: `/${command.name}`,
      detail: command.description,
      takesInput: TAKES_INPUT.has(command.name),
    })),
    // `connect:openai` and the like are in the `/connect` picker instead.
    ...commands
      .filter(
        (command) => !command.name.includes(':') && !own.has(command.name),
      )
      .map((command) => ({
        id: command.name,
        label: `/${command.name}`,
        detail: command.description,
        takesInput: command.input !== undefined,
      })),
  ]
  return [
    ...all.filter((item) => item.id.startsWith(query)),
    ...all.filter(
      (item) => !item.id.startsWith(query) && item.id.includes(query),
    ),
  ]
}

/** Does `/connect <id>` sign in with the browser, with no key to paste? */
function signsIn(id: string) {
  return keyProviders.some(
    (provider) => provider.id === id && 'signIn' in provider,
  )
}

/** The rows of the `/connect` picker: the model providers, then the apps. */
function connectItems(state: SessionViewState): Array<MenuItem> {
  const keys = providerKeysIn(state.plugins[PROVIDER_KEYS])
  const providers = keys.map((key) => ({
    id: key.id,
    label: key.label,
    current: key.state !== 'missing',
    detail:
      key.state === 'connected'
        ? 'connected'
        : key.state === 'env'
          ? 'key from the environment'
          : signsIn(key.id)
            ? 'sign in with the browser, no key to paste'
            : 'opens the page to make a key, then you paste it',
  }))
  const apps = state.commands.flatMap((command) => {
    const id = command.name.slice('connect:'.length)
    const isApp =
      command.name.startsWith('connect:') && !keys.some((key) => key.id === id)
    return isApp ? [{ id, label: id, detail: command.description }] : []
  })
  return [...providers, ...apps]
}

const modelCount = (count: number) => `${count} model${count === 1 ? '' : 's'}`

const currentModel = (state: SessionViewState) =>
  String(state.config.find((item) => item.key === 'model')?.value ?? '')

/** The context size, the effort levels, and the price of a model. */
function modelDetail(model: ModelEntry) {
  const { contextWindow, cost } = model.record
  const levels = supportedReasoningLevels(model.record).filter(
    (level) => level !== 'off',
  )
  return [
    `${compact(contextWindow)} context`,
    levels.length === 0
      ? 'no effort setting'
      : levels.length === 1
        ? `effort ${levels[0]}`
        : `effort ${levels[0]} to ${levels.at(-1)}`,
    ...(cost.input > 0 ? [`$${cost.input}/$${cost.output} per 1M tokens`] : []),
  ].join(', ')
}

/** The rows of a `/model` picker for these models. */
function modelRows(
  models: ReadonlyArray<ModelEntry>,
  state: SessionViewState,
): Array<MenuItem> {
  const current = currentModel(state)
  return models.map((model) => ({
    id: model.id,
    label: model.id,
    current: model.id === current,
    detail: modelDetail(model),
  }))
}

/** The first `/model` step: the providers, then the demo model if it is on. */
function providerItems(state: SessionViewState): Array<MenuItem> {
  const current = currentModel(state)
  const keys = providerKeysIn(state.plugins[PROVIDER_KEYS])
  const rows = modelProviders.map((provider) => {
    const missing =
      keys.find((key) => key.id === provider.id)?.state === 'missing'
    return {
      id: provider.id,
      label: provider.label,
      current: modelInfo[current]?.provider === provider.id,
      detail: `${modelCount(provider.models.length)}${missing ? `, needs /connect ${provider.id}` : ''}`,
    }
  })
  const entry = state.config.find((item) => item.key === 'model')
  const demo =
    entry?.option.type === 'select' && entry.option.options.includes('demo')
  return demo
    ? [
        ...rows,
        {
          id: 'demo',
          label: 'Demo',
          current: current === 'demo',
          detail: 'answers without a key',
        },
      ]
    : rows
}

/**
 * The OpenRouter step between the provider and the model: the vendors. An
 * alias vendor (`~anthropic`, its `latest` models) sorts after its vendor.
 */
function vendorItems(
  models: ReadonlyArray<ModelEntry>,
  state: SessionViewState,
): Array<MenuItem> {
  const current = currentModel(state)
  const counts = new Map<string, number>()
  for (const model of models) {
    const [vendor = ''] = model.id.split('/')
    counts.set(vendor, (counts.get(vendor) ?? 0) + 1)
  }
  return [...counts]
    .sort(
      ([a], [b]) =>
        a.replace(/^~/, '').localeCompare(b.replace(/^~/, '')) ||
        a.localeCompare(b),
    )
    .map(([vendor, count]) => ({
      id: vendor,
      label: vendor,
      current: current.startsWith(`${vendor}/`),
      detail: modelCount(count),
    }))
}

const EFFORT_DETAIL: Record<string, string> = {
  default: 'the model decides',
  off: 'no thinking',
  minimal: 'the least thinking',
  low: 'fast, few tokens',
  medium: 'balanced',
  high: 'thinks longer',
  xhigh: 'thinks very long',
  max: 'the most the model can think',
}

/** The rows of the `/effort` picker: the levels the current model has. */
function effortItems(state: SessionViewState): Array<MenuItem> {
  const effort = state.config.find((item) => item.key === 'effort')?.value
  const record = modelInfo[currentModel(state)]?.record
  const levels = record ? supportedReasoningLevels(record) : []
  return ['default', ...levels].map((name) => ({
    id: name,
    label: name,
    current: name === effort,
    detail: EFFORT_DETAIL[name] ?? '',
  }))
}

/** The rows of the `/resume` picker: the saved sessions, newest first. */
async function sessionItems(state: SessionViewState): Promise<Array<MenuItem>> {
  const sessions = await listSessions()
  return sessions.map((session) => ({
    id: session.id,
    label: session.id,
    current: session.id === state.threadId,
    detail: `${new Date(session.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}  ${session.title.slice(0, 60)}`,
  }))
}

// The session the user picked with /resume. The CLI opens it after the
// screen closes.
let nextSession: string | undefined

/** The session `/resume` picked, once. `undefined` when the user quit. */
export function takeNextSession() {
  const next = nextSession
  nextSession = undefined
  return next
}

/** A list open over the input line, for example the `/connect` picker. */
interface Picker {
  title: string
  items: Array<MenuItem>
  pick: (item: MenuItem) => unknown
}

const HEADER_KEYS = 'Ctrl+R talk  / commands  ↑↓ history  Esc cancel'

/**
 * The header, as wide as the screen: the harness, the folder, which features
 * are on, and the keys. It prints once, so the App prints the screen again
 * when a feature turns on or off.
 */
function Header({ view, width }: { view: SessionView; width: number }) {
  const keys = providerKeysIn(
    useSelector(view.store, (state) => state.plugins[PROVIDER_KEYS]),
  )
  const threadId = useSelector(view.store, (state) => state.threadId)
  const marks = features.map((feature) => {
    const on = isOn(feature, keys)
    return {
      name: feature.name,
      on,
      text: `${on ? '●' : '○'} ${feature.name}  `,
    }
  })
  // The border and the padding take 4 columns. The keys go next to the
  // features when both fit, else on their own row.
  const inner = width - 4
  const marksWidth = marks.reduce((sum, mark) => sum + mark.text.length, 0)
  const keysFit = marksWidth + HEADER_KEYS.length <= inner
  return (
    <Box
      width={width}
      flexDirection="column"
      borderStyle="round"
      borderColor={ACCENT}
      paddingX={1}
    >
      <Box>
        <Box flexShrink={0}>
          <Text color={ACCENT} bold>
            ◆ TanStack AI
          </Text>
          <Text bold> harness</Text>
          <Text dimColor>{`  ${assistant.name}  session ${threadId}  `}</Text>
        </Box>
        <Spacer />
        <Box flexShrink={1} minWidth={0}>
          <Text dimColor wrap="truncate-start">
            {process.cwd()}
          </Text>
        </Box>
      </Box>
      <Box>
        <Box flexWrap="wrap" flexShrink={1}>
          {marks.map((mark) => (
            <Text key={mark.name} color={mark.on ? 'green' : 'gray'}>
              {mark.text}
            </Text>
          ))}
        </Box>
        {keysFit && (
          <>
            <Spacer />
            <Text dimColor>{HEADER_KEYS}</Text>
          </>
        )}
      </Box>
      {!keysFit && (
        <Box justifyContent="flex-end">
          <Text dimColor>{HEADER_KEYS}</Text>
        </Box>
      )}
    </Box>
  )
}

function InputBox({
  line,
  voice,
  hidden,
}: {
  line: Line
  voice: VoiceState
  /** The input is a secret (a key): show a dot for each character. */
  hidden: boolean
}) {
  const shown = hidden ? '•'.repeat(line.text.length) : line.text
  return (
    <Box
      borderStyle="round"
      borderColor={
        voice === 'recording' ? 'red' : voice === 'idle' ? ACCENT : 'gray'
      }
      paddingX={1}
    >
      <Text color={ACCENT} bold>
        {'❯ '}
      </Text>
      {shown === '' ? (
        // The cursor goes before the hint, so the hint does not look typed.
        <Text>
          <Text inverse> </Text>
          <Text dimColor>
            {hidden
              ? ' Paste the key. It stays hidden.'
              : ' Type a message, / for commands, @file to attach, or hold Ctrl+R to talk'}
          </Text>
        </Text>
      ) : (
        <Text>
          {shown.slice(0, line.cursor)}
          <Text inverse>{shown[line.cursor] ?? ' '}</Text>
          {shown.slice(line.cursor + 1)}
        </Text>
      )}
    </Box>
  )
}

// A key held down repeats. Repeats closer than this are one press.
const REPEAT_GAP = 1100
// After the last repeat, the key is up when no repeat comes for this long.
const RELEASE_WAIT = 450

type Row = { id: 'header' } | ViewMessage

/** Reports its height once, when Ink prints it (Static prints a row once). */
function Measured({
  id,
  onHeight,
  children,
}: {
  id: string
  onHeight: (id: string, height: number) => void
  children: ReactNode
}) {
  const ref = useRef<DOMElement>(null)
  // Ink lays out the frame before layout effects run, so the height is there.
  useLayoutEffect(() => {
    if (ref.current) onHeight(id, measureElement(ref.current).height)
  }, [])
  return (
    <Box ref={ref} flexDirection="column">
      {children}
    </Box>
  )
}

/** One printed row: the header, or a message that no longer changes. */
function PrintedRow({
  view,
  row,
  saved,
  width,
}: {
  view: SessionView
  row: Row
  saved: ReturnType<typeof useSavedMedia>['saved']
  width: number
}) {
  return 'role' in row ? (
    <Message message={row} saved={saved} width={width} />
  ) : (
    <Header view={view} width={width} />
  )
}

function App({ view }: { view: SessionView }) {
  const { exit } = useApp()
  const messages = useSelector(view.store, (state) => state.messages)
  const running = useSelector(view.store, (state) => state.status === 'running')
  const { saved, saving } = useSavedMedia(view, messages)
  // The input line. A line typed while a question asks for a key stays hidden
  // until it is sent or deleted, also when the question ends first, so a key
  // never shows or goes out as a message.
  const editor = useLineEditor()
  const secretAsked = useSelector(
    view.store,
    (state) => state.questions.at(0)?.secret === true,
  )
  const asksSecret = () => view.store.get().questions.at(0)?.secret === true
  const commands = useSelector(view.store, (state) => state.commands)
  const waiting = useSelector(
    view.store,
    (state) => state.questions.length > 0 || state.approvals.length > 0,
  )
  const [picker, setPicker] = useState<Picker | undefined>(undefined)
  const [selected, setSelected] = useState(0)
  const suggestions =
    // A line from the history keeps the arrows for the history.
    picker || waiting || editor.line.hidden || editor.browsing
      ? []
      : suggestionsFor(editor.line.text, commands)
  const [suggested, setSuggested] = useState(0)
  useEffect(() => setSuggested(0), [editor.line.text])

  // Messages that no longer change print once, above the live area. The
  // count only grows: a printed message is never printed again.
  const printed = useRef(0)
  printed.current = Math.max(
    printed.current,
    settledCount(messages, saving, running),
  )
  const rows: Array<Row> = [
    { id: 'header' },
    ...messages.slice(0, printed.current),
  ]

  // The input sits at the bottom of the screen: until the printed rows fill
  // the screen, empty space above the live area fills the rest. Each row
  // measures itself when it prints. Ink redraws the whole screen for a frame
  // as tall as the screen, so the frame stays one line shorter.
  // ponytail: the heights are from the width at print time. A resize makes
  // the space a little off until the screen is full.
  const { columns, rows: screenRows } = useWindowSize()
  const heights = useRef(new Map<string, number>())
  const [, remeasure] = useReducer((count: number) => count + 1, 0)
  const onHeight = (id: string, height: number) => {
    heights.current.set(id, height)
    remeasure()
  }
  const printedHeight = rows.reduce(
    (sum, row) => sum + (heights.current.get(row.id) ?? 0),
    0,
  )
  const live = useRef<DOMElement>(null)
  const { height: liveHeight } = useBoxMetrics(live)
  const space = Math.max(0, screenRows - 1 - printedHeight - liveHeight)

  // The header shows which features are on, but printed rows never change.
  // So when a feature turns on or off (a /connect), clear the screen and
  // print the header and the conversation again.
  const { stdout } = useStdout()
  const featureMarks = useSelector(view.store, (state) => {
    const keys = providerKeysIn(state.plugins[PROVIDER_KEYS])
    return features.map((feature) => (isOn(feature, keys) ? 1 : 0)).join('')
  })
  const shownMarks = useRef(featureMarks)
  const [printRound, setPrintRound] = useState(0)
  useEffect(() => {
    if (featureMarks === shownMarks.current) return
    shownMarks.current = featureMarks
    if (stdout.isTTY) stdout.write('\x1b[2J\x1b[3J\x1b[H')
    setPrintRound((round) => round + 1)
  }, [featureMarks])

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
    view.notice(error instanceof Error ? error.message : String(error))
  const failVoice = (error: unknown) =>
    view.notice(
      `Voice: ${error instanceof Error ? error.message : String(error)}`,
    )

  /**
   * A voice message: transcribe it, and put the words in the input line, with
   * an `@path` for each file it names. The user fixes the line if needed,
   * then presses Enter to send it.
   */
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
      // A key question keeps its line for the key only.
      if (asksSecret())
        return view.notice('Voice: answer the key question first.')
      // After what the user typed already, so nothing they typed is lost.
      const typed = editor.line.text.trimEnd()
      editor.set(typed === '' ? message.text : `${typed} ${message.text}`)
    } catch (error) {
      failVoice(error)
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
      .then((clip) => hear(clip.audio, 'voice.wav', clip), failVoice)
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
          'Voice: run /connect and pick OpenAI or xAI to turn voice on.',
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
      failVoice(error)
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

  const openPicker = (next: Picker) => {
    if (next.items.length === 0)
      return view.notice(`${next.title}: nothing to pick.`)
    setSelected(
      Math.max(
        0,
        next.items.findIndex((item) => item.current),
      ),
    )
    setPicker(next)
  }

  const pickMicrophone = async () => {
    const names = await listMicrophones()
    const current = await currentMicrophone()
    if (names.length === 0)
      return view.notice(
        `Recording from the default input${current ? ` (${current})` : ''}.`,
      )
    openPicker({
      title: 'Record from which microphone?',
      items: names.map((name) => ({
        id: name,
        label: name,
        current: name === current,
      })),
      pick: async (item) => {
        await chooseMicrophone(item.id)
        view.notice(`Voice: recording from "${item.id}".`)
      },
    })
  }

  /** Pick a model of the provider `id`. OpenRouter asks for the vendor first. */
  const pickModelOf = (id: string) => {
    if (id === 'demo') return view.command('model', 'demo')
    const provider = modelProviders.find((entry) => entry.id === id)
    if (!provider) return
    const state = view.store.get()
    const pickModel = (title: string, models: ReadonlyArray<ModelEntry>) =>
      openPicker({
        title,
        items: modelRows(models, state),
        pick: (item) => view.command('model', item.id),
      })
    if (provider.id !== 'openrouter')
      return pickModel(`${provider.label}: pick the model`, provider.models)
    openPicker({
      title: 'OpenRouter: pick the vendor',
      items: vendorItems(provider.models, state),
      pick: (vendor) =>
        pickModel(
          `OpenRouter: pick the ${vendor.id} model`,
          provider.models.filter((model) =>
            model.id.startsWith(`${vendor.id}/`),
          ),
        ),
    })
  }

  /** Close the screen, and the CLI opens the saved session `id`. */
  const resume = async (id: string) => {
    if (id === view.store.get().threadId)
      return view.notice('You are in this session.')
    if (!(await hasSession(id)))
      return view.notice(`No saved session ${id}. /resume lists them.`)
    nextSession = id
    exit()
  }

  /** Enter: answer an approval or a question, run a screen command, or send. */
  const submit = async (line: Line) => {
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
    const [command, ...rest] = text.split(' ')
    const arg = rest.join(' ').trim() || undefined
    switch (command) {
      case '/exit':
        return exit()
      case '/help': {
        const keys = providerKeysIn(state.plugins[PROVIDER_KEYS])
        const off = features
          .filter((feature) => !isOn(feature, keys))
          .map(
            (feature) => `  ${feature.name} is off: it needs ${feature.needs}.`,
          )
        const list = suggestionsFor('/', state.commands).map(
          (item) => `${item.label.padEnd(14)}${item.detail ?? ''}`,
        )
        return view.notice([...HELP, ...off, ...list].join('\n'))
      }
      case '/connect':
        if (arg) return view.command(`connect:${arg}`)
        return openPicker({
          title: 'Connect to what?',
          items: connectItems(state),
          pick: (item) => view.command(`connect:${item.id}`),
        })
      case '/disconnect': {
        if (arg) return view.command(`disconnect:${arg}`)
        // A key from the environment cannot be removed here, so it is not listed.
        const keys = providerKeysIn(state.plugins[PROVIDER_KEYS])
        return openPicker({
          title: 'Remove which key or sign-in?',
          items: connectItems(state).filter(
            (item) =>
              !keys.some(
                (key) => key.id === item.id && key.state !== 'connected',
              ),
          ),
          pick: (item) => view.command(`disconnect:${item.id}`),
        })
      }
      case '/model':
        if (arg) break
        return openPicker({
          title: 'Pick the provider',
          items: providerItems(state),
          pick: (item) => pickModelOf(item.id),
        })
      case '/effort':
        if (arg) break
        if (!reasons(currentModel(state)))
          return view.notice(
            `${currentModel(state)} has no effort setting. Pick another model with /model.`,
          )
        return openPicker({
          title: 'How hard should the model think?',
          items: effortItems(state),
          pick: (item) => view.command('effort', item.id),
        })
      case '/resume':
        if (arg) return resume(arg)
        return openPicker({
          title: 'Continue which session?',
          items: await sessionItems(state),
          pick: (item) => resume(item.id),
        })
      case '/mic': {
        if (!arg) return pickMicrophone().catch(failVoice)
        const names = await listMicrophones().catch(() => [])
        const chosen = names[Number(arg) - 1]
        if (!chosen)
          return view.notice(`No microphone ${arg}. /mic lists them.`)
        await chooseMicrophone(chosen)
        return view.notice(`Voice: recording from "${chosen}".`)
      }
      case '/voice': {
        if (!arg) return view.notice('Give an audio file: /voice note.m4a')
        const path = arg.replace(/^@|^"|"$/g, '')
        const audio = await readFile(path).catch(failVoice)
        if (audio) await hear(new Uint8Array(audio), basename(path))
        return
      }
      case '/open':
      case '/play': {
        const item = pick(arg)
        if (!item) return
        if (command === '/play' && item.kind !== 'image') play(item)
        else openExternal(item.path)
        return
      }
    }
    await view.send(text)
  }

  /** Send a line and keep it for the up arrow, unless it is a key or an answer. */
  const send = (line: Line) => {
    const state = view.store.get()
    const isAnswer = state.questions.length > 0 || state.approvals.length > 0
    if (!line.hidden && !isAnswer) editor.remember(line.text)
    editor.clear()
    submit(line).catch(fail)
  }

  usePaste((text) => editor.insert(text, asksSecret()))

  useInput((character, key) => {
    if (key.ctrl && character === 'r') return onTalkKey()
    if (picker) {
      const count = picker.items.length
      const number = Number(character)
      const chosen = key.return
        ? picker.items[selected]
        : Number.isInteger(number) && number >= 1
          ? picker.items[number - 1]
          : undefined
      if (key.escape || chosen) setPicker(undefined)
      if (chosen) Promise.resolve(picker.pick(chosen)).catch(fail)
      if (key.upArrow) setSelected((index) => (index - 1 + count) % count)
      if (key.downArrow) setSelected((index) => (index + 1) % count)
      return
    }
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
      else editor.clear()
      return
    }
    const suggestion = suggestions[Math.min(suggested, suggestions.length - 1)]
    if (suggestion) {
      const count = suggestions.length
      if (key.upArrow)
        return setSuggested((index) => (index - 1 + count) % count)
      if (key.downArrow) return setSuggested((index) => (index + 1) % count)
      if (key.tab) return editor.set(`/${suggestion.id} `)
      if (key.return) {
        if (suggestion.takesInput) return editor.set(`/${suggestion.id} `)
        return send({ text: `/${suggestion.id}`, cursor: 0, hidden: false })
      }
    }
    if (key.upArrow) return editor.older()
    if (key.downArrow) return editor.newer()
    if (key.leftArrow) return editor.move(-1)
    if (key.rightArrow) return editor.move(1)
    if (key.home) return editor.move('start')
    if (key.end) return editor.move('end')
    if (key.return) {
      if (phase.current === 'recording' || phase.current === 'starting')
        return void stopTalking()
      return send(editor.line)
    }
    // Most terminals send Backspace as the delete key.
    if (key.backspace || key.delete) return editor.backspace()
    if (!key.ctrl && !key.meta && !key.tab && character)
      editor.insert(character, asksSecret())
  })

  return (
    <Box flexDirection="column">
      <Static key={printRound} items={rows}>
        {(row) => (
          <Measured key={row.id} id={row.id} onHeight={onHeight}>
            <PrintedRow view={view} row={row} saved={saved} width={columns} />
          </Measured>
        )}
      </Static>
      {space > 0 ? <Box height={space} /> : null}
      <Box ref={live} flexDirection="column">
        {messages.slice(printed.current).map((message) => (
          <Message
            key={message.id}
            message={message}
            saved={saved}
            width={columns}
          />
        ))}
        <Status view={view} voice={voice} recording={recorder} />
        <InputBox
          line={editor.line}
          voice={voice}
          hidden={
            secretAsked || (editor.line.hidden && editor.line.text !== '')
          }
        />
        {picker ? (
          <Menu
            title={picker.title}
            items={picker.items}
            selected={selected}
            hint="↑↓ move   Enter or a number picks   Esc closes"
          />
        ) : suggestions.length > 0 ? (
          <Menu
            items={suggestions}
            selected={Math.min(suggested, suggestions.length - 1)}
            hint="↑↓ move   Tab fills   Enter runs"
          />
        ) : null}
        <Footer view={view} />
      </Box>
    </Box>
  )
}

/**
 * The Ink screen for `runCli({ ui })`. It clears the terminal, opens sign-in
 * links in the browser, records voice messages, saves the media the agents
 * make into `./<harness-name>-media`, and resolves when the user types /exit
 * or presses Ctrl+C. `io` replaces the terminal, for a test.
 */
export async function runTui(view: SessionView, io: RenderOptions = {}) {
  view.on('signIn', (signIn) => {
    if (signIn.url) openExternal(signIn.url)
  })
  const keys = providerKeysIn(view.store.get().plugins[PROVIDER_KEYS])
  if (keys.every((key) => key.state === 'missing'))
    view.notice(
      'No model key yet. Type /connect and pick OpenRouter to sign in with the browser.',
    )
  // Start on a clean terminal: clear the screen and the scrollback.
  if (!io.stdout && process.stdout.isTTY)
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H')
  const app = render(<App view={view} />, io)
  // ponytail: the SDK logs its warnings and errors on the console (the
  // message, then its details with console.dir), and the code highlighter
  // warns about languages it does not know. Ink prints console output above
  // the screen, and the screen shows the errors itself, so it drops them.
  // This wraps the console after render(), because render() replaces it.
  const before = { warn: console.warn, error: console.error, dir: console.dir }
  let dropDetails = false
  const quiet =
    (log: (...args: Array<unknown>) => void) =>
    (...args: Array<unknown>) => {
      const text = typeof args[0] === 'string' ? args[0] : ''
      dropDetails =
        /\[tanstack-ai:(warn|errors)\]|Could not find the language/.test(text)
      if (!dropDetails) log(...args)
    }
  const quietWarn = quiet(before.warn)
  console.warn = quietWarn
  console.error = quiet(before.error)
  console.dir = (...args: Parameters<typeof console.dir>) => {
    if (dropDetails) dropDetails = false
    else before.dir(...args)
  }
  try {
    await app.waitUntilExit()
  } finally {
    // Ink puts the first console back when it stops. Without its console
    // (`patchConsole: false`), the screen puts it back itself.
    if (console.warn === quietWarn) Object.assign(console, before)
  }
}
