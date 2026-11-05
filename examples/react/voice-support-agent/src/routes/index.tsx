import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChevronDown, Phone, PhoneOff } from 'lucide-react'
import { ByokKeyDialog } from '../components/ByokKeyDialog.tsx'
import { byok, getEnvKeyStatus } from '../lib/byok.ts'
import { DEFAULT_CHOICE, HOPS } from '../lib/hops.ts'
import { CHARACTERS, isCharacterName } from '../server/characters.ts'
import type { Choice, Hop } from '../lib/hops.ts'
import type { ProviderId } from '@tanstack/ai/byok'
import type { CharacterName } from '../server/characters.ts'

type Caption = { role: 'caller' | 'agent'; text: string; final: boolean }

/**
 * Runs in an AudioWorklet. Turns the microphone's float samples into 16-bit
 * PCM frames and posts each one to the page, which sends it on the socket.
 */
const PCM_WORKLET = `
class PcmSender extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0][0]
    if (input) {
      const pcm = new Int16Array(input.length)
      for (let i = 0; i < input.length; i++) {
        pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer])
    }
    return true
  }
}
registerProcessor('pcm-sender', PcmSender)
`

/** Open the socket, stream the mic up, play the agent's audio down. */
async function startCall(
  character: CharacterName,
  choice: Choice,
  onCaption: (caption: Caption) => void,
  onClose: (reason: string) => void,
) {
  const context = new AudioContext({ sampleRate: 24000 })
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  })
  const workletUrl = URL.createObjectURL(
    new Blob([PCM_WORKLET], { type: 'text/javascript' }),
  )
  await context.audioWorklet.addModule(workletUrl)

  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}/voice`)
  ws.binaryType = 'arraybuffer'
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('Could not open the voice socket'))
  })
  // The server reads the character, the provider per hop, and your keys from
  // this frame. Keys never touch the URL.
  ws.send(
    JSON.stringify({
      type: 'start',
      choice: { character, ...choice },
      headers: byok.headers(),
    }),
  )

  ws.onclose = (event) => onClose(event.reason)

  const sender = new AudioWorkletNode(context, 'pcm-sender')
  sender.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(event.data)
  }
  context.createMediaStreamSource(mic).connect(sender)

  // Queue each PCM frame right after the previous one so playback is gapless.
  let playAt = 0
  const playing = new Set<AudioBufferSourceNode>()
  ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
    if (typeof event.data === 'string') {
      const message: unknown = JSON.parse(event.data)
      if (
        typeof message !== 'object' ||
        message === null ||
        !('type' in message)
      )
        return
      if (message.type === 'clear') {
        for (const source of playing) source.stop()
        playing.clear()
        playAt = 0
      }
      if (message.type === 'caption' && isCaption(message)) onCaption(message)
      return
    }
    const pcm = new Int16Array(event.data)
    const buffer = context.createBuffer(1, pcm.length, 24000)
    buffer.copyToChannel(
      Float32Array.from(pcm, (s) => s / 0x8000),
      0,
    )
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    playAt = Math.max(playAt, context.currentTime)
    source.start(playAt)
    playAt += buffer.duration
    playing.add(source)
    source.onended = () => playing.delete(source)
  }

  return () => {
    ws.close()
    for (const track of mic.getTracks()) track.stop()
    void context.close()
    URL.revokeObjectURL(workletUrl)
  }
}

function isCaption(value: object): value is Caption {
  return (
    'role' in value &&
    (value.role === 'caller' || value.role === 'agent') &&
    'text' in value &&
    typeof value.text === 'string' &&
    'final' in value &&
    typeof value.final === 'boolean'
  )
}

function CallPage() {
  const [captions, setCaptions] = useState<Array<Caption>>([])
  const [error, setError] = useState('')
  const [inCall, setInCall] = useState(false)
  const [character, setCharacter] = useState<CharacterName>('helpful')
  const [choice, setChoice] = useState<Choice>(DEFAULT_CHOICE)
  const hangUp = useRef<(() => void) | null>(null)
  const [keysOpen, setKeysOpen] = useState(false)
  const [envStatus, setEnvStatus] = useState<Record<string, boolean>>()
  const [missingKey, setMissingKey] = useState<ProviderId | null>(null)
  useEffect(() => {
    void getEnvKeyStatus().then(setEnvStatus)
  }, [])

  // The server closes with "missing <provider> key" when no key covers a hop.
  const onClose = (reason: string) => {
    const missing = /^missing (\S+) key$/.exec(reason)?.[1]
    hangUp.current = null
    setInCall(false)
    if (missing) {
      setMissingKey(missing)
      setKeysOpen(true)
    }
  }

  const onCaption = (caption: Caption) =>
    setCaptions((list) => {
      // Interim caller text replaces the previous interim line.
      const last = list.at(-1)
      const keep =
        last && !last.final && last.role === caption.role
          ? list.slice(0, -1)
          : list
      return [...keep, caption]
    })

  const toggleCall = async () => {
    if (hangUp.current) {
      hangUp.current()
      hangUp.current = null
      setInCall(false)
      setCaptions([])
      return
    }
    try {
      setError('')
      hangUp.current = await startCall(character, choice, onCaption, onClose)
      setInCall(true)
      setCaptions([
        {
          role: 'agent',
          text: 'Connected. Ask me about TanStack AI.',
          final: true,
        },
      ])
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : 'Could not start the call',
      )
    }
  }

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <h1 className="text-lg font-semibold">TanStack AI support line</h1>
        <p className="text-sm text-gray-400">
          Talk, then pause. The agent answers from the docs. Talk over it to
          interrupt.
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {captions.map((caption, index) => (
          <div
            key={index}
            className={`rounded-lg p-3 ${
              caption.role === 'agent'
                ? 'bg-linear-to-r from-orange-500/10 to-red-600/10'
                : caption.final
                  ? 'bg-gray-800'
                  : 'bg-gray-800/40 text-gray-400'
            }`}
          >
            <span className="mr-2 text-xs uppercase text-gray-500">
              {caption.role === 'agent' ? 'Agent' : 'You'}
            </span>
            {caption.text}
          </div>
        ))}
      </div>

      {error ? (
        <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <div className="space-y-3 border-t border-orange-500/10 p-4">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Select
            label="Agent character"
            value={character}
            disabled={inCall}
            options={Object.fromEntries(
              Object.entries(CHARACTERS).map(([name, { label }]) => [
                name,
                label,
              ]),
            )}
            onChange={(next) => {
              if (isCharacterName(next)) setCharacter(next)
            }}
          />
          {(Object.keys(HOPS) as Array<Hop>).map((hop) => (
            <Select
              key={hop}
              label={HOP_LABEL[hop]}
              value={choice[hop]}
              disabled={inCall}
              options={HOPS[hop]}
              onChange={(next) => {
                if (next in HOPS[hop]) {
                  setChoice((current) => ({ ...current, [hop]: next }))
                }
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => void toggleCall()}
            aria-label={inCall ? 'Hang up' : 'Start call'}
            className={`flex h-12 w-12 items-center justify-center rounded-full text-white ${
              inCall
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {inCall ? <PhoneOff size={24} /> : <Phone size={24} />}
          </button>
          <ByokKeyDialog
            open={keysOpen}
            onOpenChange={(open) => {
              setKeysOpen(open)
              if (!open) setMissingKey(null)
            }}
            envStatus={envStatus}
            highlightProvider={missingKey}
            description="Keys stay in your browser and go to the server on the first frame of each call, never stored there. A provider with a server key already works without one."
          />
        </div>
      </div>
    </div>
  )
}

const HOP_LABEL: Record<Hop, string> = {
  listen: 'Listen with',
  think: 'Think with',
  speak: 'Speak with',
}

function Select({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string
  value: string
  options: Record<string, string>
  disabled: boolean
  onChange: (next: string) => void
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-gray-400">
      {label}
      <span className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-44 appearance-none rounded-lg border border-gray-700 bg-gray-800 pl-3 pr-8 text-sm text-white focus:border-orange-500 focus:outline-none disabled:opacity-50"
        >
          {Object.entries(options).map(([name, text]) => (
            <option key={name} value={name}>
              {text}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
        />
      </span>
    </label>
  )
}

export const Route = createFileRoute('/')({
  component: CallPage,
})
