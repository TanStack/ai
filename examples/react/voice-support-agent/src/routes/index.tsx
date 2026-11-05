import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

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
async function startCall(onCaption: (caption: Caption) => void) {
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
  const hangUp = useRef<(() => void) | null>(null)
  const inCall = hangUp.current !== null

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
      setCaptions([])
      return
    }
    try {
      setError('')
      hangUp.current = await startCall(onCaption)
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

      <div className="border-t border-orange-500/10 p-4">
        <button
          type="button"
          onClick={() => void toggleCall()}
          className={`w-full rounded-lg px-4 py-3 text-sm font-medium ${
            inCall
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-orange-500 hover:bg-orange-600'
          }`}
        >
          {inCall ? 'Hang up' : 'Start call'}
        </button>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: CallPage,
})
