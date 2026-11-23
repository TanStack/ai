import type { AudioVisualization } from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'

/**
 * Opens a WebRTC connection to an OpenAI voice API. It owns the peer
 * connection, the microphone, the `oai-events` data channel, audio playback,
 * the audio analysers, and the teardown.
 *
 * The caller supplies the two parts that are different for each API: how the
 * SDP offer becomes an answer (`exchangeSdp`), and what to do with each server
 * event (`onServerEvent`). The promise resolves when the data channel is open.
 * A failed or aborted setup releases the microphone and the peer connection,
 * then rejects.
 */
export async function createOpenAIWebRTCTransport(options: {
  logger: InternalLogger
  /** Log source, for example `openai.realtime`. */
  source: string
  exchangeSdp: (offerSdp: string, abortSignal?: AbortSignal) => Promise<string>
  onServerEvent: (event: Record<string, unknown>) => void
  /** Runs when the data channel opens, after the queued events are sent. */
  onOpen: () => void
  onError: (error: Error) => void
  abortSignal?: AbortSignal
}) {
  const { logger, source, abortSignal } = options

  // WebRTC peer connection
  const pc = new RTCPeerConnection()

  // Audio context for visualization
  let audioContext: AudioContext | null = null
  let inputAnalyser: AnalyserNode | null = null
  let outputAnalyser: AnalyserNode | null = null
  let inputSource: MediaStreamAudioSourceNode | null = null
  let outputSource: MediaStreamAudioSourceNode | null = null
  let localStream: MediaStream | null = null

  // Audio element for playback (more reliable than AudioContext.destination)
  let audioElement: HTMLAudioElement | null = null

  // Data channel for events (assigned at construction below; nulled out by teardown)
  let dataChannel: RTCDataChannel | null = null

  // Empty arrays for when visualization isn't available
  // frequencyBinCount = fftSize / 2 = 1024
  const emptyFrequencyData = new Uint8Array(1024)
  const emptyTimeDomainData = new Uint8Array(2048).fill(128) // 128 is silence

  // Set up data channel for bidirectional communication. Captured into a const
  // so closures see a non-nullable reference (teardown re-points the outer
  // `dataChannel` to null, but in-flight closures still need to close their
  // own channel).
  const channel = pc.createDataChannel('oai-events')
  dataChannel = channel

  let isChannelOpen = false

  // Resolves when the data channel opens. A close or an error before that
  // rejects it, so the setup cleanup runs and connect() does not hang.
  const dataChannelReady = new Promise<void>((resolve, reject) => {
    channel.onopen = () => {
      isChannelOpen = true
      flushPendingEvents()
      options.onOpen()
      resolve()
    }

    channel.onclose = () => {
      reject(new Error('Data channel closed before it opened'))
    }

    channel.onerror = (error) => {
      logger.errors(`${source} fatal`, {
        error,
        source,
      })
      const failure = new Error(`Data channel error: ${error}`)
      // Before the channel opens, the error fails the setup. After it opens,
      // the session reports it through onError.
      if (isChannelOpen) options.onError(failure)
      else reject(failure)
    }
  })
  // A setup failure can close the channel before anything waits on this
  // promise. Mark it as handled so that it is not an unhandled rejection.
  void dataChannelReady.catch(() => {})

  channel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      logger.provider(
        `provider=openai direction=in type=${(message as { type?: string }).type ?? '<unknown>'}`,
        { frame: message },
      )
      options.onServerEvent(message)
    } catch (e) {
      logger.errors(`${source} fatal`, {
        error: e,
        source,
      })
    }
  }

  // Handle incoming audio track
  pc.ontrack = (event) => {
    if (event.track.kind === 'audio' && event.streams[0]) {
      setupOutputAudioAnalysis(event.streams[0])
    }
  }

  // A failed or aborted setup releases the microphone and the peer
  // connection. Without this, the mic indicator stays on after disconnect().
  try {
    // A disconnect during the token fetch already aborted the signal. Do not
    // ask for the microphone in that case.
    abortSignal?.throwIfAborted()
    // IMPORTANT: Request microphone access and add audio track BEFORE creating offer
    // OpenAI's voice APIs require an audio track in the SDP offer
    const microphone = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 24000,
      },
    })
    try {
      // An abort while the permission prompt is open rejects at once.
      localStream = await waitUnlessAborted(microphone, abortSignal)
    } catch (error) {
      if (abortSignal?.aborted) {
        // The browser can still give the stream after the abort. Stop it then.
        void microphone.then(stopTracks, () => {})
        throw abortSignal.reason
      }
      throw new Error(
        `Microphone access required for realtime voice: ${error instanceof Error ? error.message : error}`,
      )
    }

    // Add audio track to peer connection
    for (const track of localStream.getAudioTracks()) {
      pc.addTrack(track, localStream)
    }

    // Create and set local description (now includes audio track)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    // ponytail: the WebRTC types mark `sdp` as optional, but createOffer()
    // always sets it. The empty string only satisfies the type.
    const answerSdp = await options.exchangeSdp(offer.sdp ?? '', abortSignal)
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
  } catch (error) {
    if (localStream) stopTracks(localStream)
    localStream = null
    channel.close()
    dataChannel = null
    pc.close()
    throw error
  }

  // Set up input audio analysis now that we have the stream. The meter is
  // optional: if the setup fails, the session continues without it.
  try {
    setupInputAudioAnalysis(localStream)
  } catch (error) {
    inputAnalyser = null
    logger.errors(`${source} input audio analysis failed`, {
      error,
      source,
    })
  }

  // Set up audio analysis for output
  function setupOutputAudioAnalysis(stream: MediaStream) {
    // Create audio element for playback - this is the standard way to play WebRTC audio
    audioElement = new Audio()
    audioElement.srcObject = stream
    audioElement.autoplay = true
    // Some browsers require this for autoplay
    audioElement.play().catch((e) => {
      logger.errors(`${source} audio autoplay failed`, {
        error: e,
        source,
      })
    })

    // Set up AudioContext for visualization only (not playback)
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    // Resume AudioContext if suspended (browsers require user interaction)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        // Ignore - visualization just won't work
      })
    }

    outputAnalyser = audioContext.createAnalyser()
    outputAnalyser.fftSize = 2048 // Larger size for more accurate level detection
    outputAnalyser.smoothingTimeConstant = 0.3

    outputSource = audioContext.createMediaStreamSource(stream)
    outputSource.connect(outputAnalyser)
    // Don't connect to destination - the Audio element handles playback
  }

  // Set up audio analysis for input
  function setupInputAudioAnalysis(stream: MediaStream) {
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    // Resume AudioContext if suspended (browsers require user interaction)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        // Ignore - visualization just won't work
      })
    }

    inputAnalyser = audioContext.createAnalyser()
    inputAnalyser.fftSize = 2048 // Larger size for more accurate level detection
    inputAnalyser.smoothingTimeConstant = 0.3

    inputSource = audioContext.createMediaStreamSource(stream)
    inputSource.connect(inputAnalyser)
  }

  // Queue for events sent before the data channel is open
  const pendingEvents: Array<Record<string, unknown>> = []

  // Send event to server (queues if data channel not yet open)
  function sendEvent(event: Record<string, unknown>) {
    if (dataChannel?.readyState === 'open') {
      logger.provider(
        `provider=openai direction=out type=${(event.type as string | undefined) ?? '<unknown>'}`,
        { frame: event },
      )
      dataChannel.send(JSON.stringify(event))
    } else {
      pendingEvents.push(event)
    }
  }

  // Flush any queued events (called when data channel opens)
  function flushPendingEvents() {
    for (const event of pendingEvents) {
      logger.provider(
        `provider=openai direction=out type=${(event.type as string | undefined) ?? '<unknown>'}`,
        { frame: event },
      )
      channel.send(JSON.stringify(event))
    }
    pendingEvents.length = 0
  }

  // Stops the microphone, playback, the data channel, the peer connection,
  // and the audio context.
  async function close() {
    if (localStream) {
      stopTracks(localStream)
      localStream = null
    }

    if (audioElement) {
      audioElement.pause()
      audioElement.srcObject = null
      audioElement = null
    }

    if (dataChannel) {
      dataChannel.close()
      dataChannel = null
    }

    pc.close()

    if (audioContext) {
      await audioContext.close()
      audioContext = null
    }
  }

  // Wait for the data channel to be open before returning the transport.
  // This ensures session.update (tools, instructions, etc.) can be sent immediately.
  // An abort during this wait releases the mic, the peer connection, and the
  // audio context, and rejects, so the caller does not stay pending.
  try {
    await waitUnlessAborted(dataChannelReady, abortSignal)
  } catch (error) {
    await close()
    throw error
  }

  return {
    sendEvent,
    close,

    // Audio capture is established during connection setup.
    // This enables the microphone tracks again.
    startAudioCapture() {
      if (localStream) {
        for (const track of localStream.getAudioTracks()) {
          track.enabled = true
        }
      }
    },

    // Disable tracks rather than stopping them to allow re-enabling
    stopAudioCapture() {
      if (localStream) {
        for (const track of localStream.getAudioTracks()) {
          track.enabled = false
        }
      }
    },

    getAudioVisualization(): AudioVisualization {
      // Helper to calculate audio level from time domain data
      // Uses peak amplitude which is more responsive for voice audio meters
      function calculateLevel(analyser: AnalyserNode): number {
        const data = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(data)

        // Find peak deviation from center (128 is silence)
        // This is more responsive than RMS for voice level meters
        let maxDeviation = 0
        for (const sample of data) {
          const deviation = Math.abs(sample - 128)
          if (deviation > maxDeviation) {
            maxDeviation = deviation
          }
        }

        // Normalize to 0-1 range (max deviation is 128)
        // Scale by 1.5x so that ~66% amplitude reads as full scale
        // This provides good visual feedback without pegging too early
        const normalized = maxDeviation / 128
        return Math.min(1, normalized * 1.5)
      }

      return {
        get inputLevel() {
          if (!inputAnalyser) return 0
          return calculateLevel(inputAnalyser)
        },

        get outputLevel() {
          if (!outputAnalyser) return 0
          return calculateLevel(outputAnalyser)
        },

        getInputFrequencyData() {
          if (!inputAnalyser) return emptyFrequencyData
          const data = new Uint8Array(inputAnalyser.frequencyBinCount)
          inputAnalyser.getByteFrequencyData(data)
          return data
        },

        getOutputFrequencyData() {
          if (!outputAnalyser) return emptyFrequencyData
          const data = new Uint8Array(outputAnalyser.frequencyBinCount)
          outputAnalyser.getByteFrequencyData(data)
          return data
        },

        getInputTimeDomainData() {
          if (!inputAnalyser) return emptyTimeDomainData
          const data = new Uint8Array(inputAnalyser.fftSize)
          inputAnalyser.getByteTimeDomainData(data)
          return data
        },

        getOutputTimeDomainData() {
          if (!outputAnalyser) return emptyTimeDomainData
          const data = new Uint8Array(outputAnalyser.fftSize)
          outputAnalyser.getByteTimeDomainData(data)
          return data
        },

        get inputSampleRate() {
          return 24000
        },

        get outputSampleRate() {
          return 24000
        },
      }
    },
  }
}

/** Settle like `promise`, or reject with the abort reason when `signal` aborts first. */
function waitUnlessAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
) {
  if (!signal) return promise
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    if (signal.aborted) return onAbort()
    signal.addEventListener('abort', onAbort, { once: true })
    void promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function stopTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop()
}
