import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createRealtimeEventEmitter } from '@tanstack/ai'
import { useRealtimeChat } from '@tanstack/ai-react'
import type {
  AudioVisualization,
  RealtimeRelayAdapter,
  RealtimeSessionAnswer,
  RealtimeSessionRequest,
} from '@tanstack/ai'

const silence: AudioVisualization = {
  inputLevel: 0,
  outputLevel: 0,
  getInputFrequencyData: () => new Uint8Array(0),
  getOutputFrequencyData: () => new Uint8Array(0),
  getInputTimeDomainData: () => new Uint8Array(0),
  getOutputTimeDomainData: () => new Uint8Array(0),
  inputSampleRate: 0,
  outputSampleRate: 0,
}

/**
 * A relay adapter with no WebRTC and no microphone. It sends a fixed offer
 * through `createSession` and counts the `updateSession` calls on the
 * connection that it returns.
 */
function fakeRelayAdapter(onUpdateSession: () => void) {
  return {
    provider: 'e2e-relay',
    kind: 'relay',
    async connect(createSession) {
      await createSession({ sdp: 'v=0 offer-e2e' })
      const emitter = createRealtimeEventEmitter()
      return {
        disconnect: async () => {},
        startAudioCapture: async () => {},
        stopAudioCapture: () => {},
        sendText: () => {},
        sendImage: () => {},
        sendToolResult: () => {},
        updateSession: onUpdateSession,
        interrupt: () => {},
        on: emitter.on,
        getAudioVisualization: () => silence,
      }
    },
  } satisfies RealtimeRelayAdapter
}

async function postLiveSession(request: RealtimeSessionRequest) {
  const response = await fetch('/api/live-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(`live-session ${response.status}`)
  const answer: RealtimeSessionAnswer = await response.json()
  return answer
}

function RealtimeRelayPage() {
  const [hydrated, setHydrated] = useState(false)
  const [sessionId, setSessionId] = useState('')
  const [updateSessionCalls, setUpdateSessionCalls] = useState(0)
  const [adapter] = useState(() =>
    fakeRelayAdapter(() => setUpdateSessionCalls((count) => count + 1)),
  )
  const { status, connect } = useRealtimeChat({
    adapter,
    createSession: async (request) => {
      const answer = await postLiveSession(request)
      setSessionId(answer.sessionId)
      return answer
    },
    autoCapture: false,
    instructions: 'client',
  })

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="session-id">{sessionId}</div>
      <div data-testid="update-session-calls">{updateSessionCalls}</div>
      <button
        data-testid="connect-button"
        type="button"
        disabled={!hydrated}
        onClick={() => void connect()}
      >
        Connect
      </button>
    </div>
  )
}

export const Route = createFileRoute('/realtime-relay')({
  component: RealtimeRelayPage,
})
