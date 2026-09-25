import { RealtimeClient } from '@tanstack/ai-client'
import type {
  RealtimeMessage,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeStatus,
} from '@tanstack/ai'
import type { Handle } from 'remix/ui'
import type { CreateRealtimeChatOptions } from './realtime-types.ts'

const emptyFrequencyData = new Uint8Array(128)
const emptyTimeDomainData = new Uint8Array(128).fill(128)

/**
 * Remix helper for realtime voice conversations.
 *
 * Call from component setup with Handle. State fields are getters so the
 * render function reads the current value after `handle.update()`.
 *
 * @param handle - Remix Handle from setup. Used to re-render and to clean up
 *   when the component disconnects.
 * @param options - Adapter, token loader, and optional session/callback config.
 *
 * @example
 * ```typescript
 * import { createRealtimeChat } from '@tanstack/ai-remix'
 * import { openaiRealtime } from '@tanstack/ai-openai'
 * import type { Handle } from 'remix/ui'
 *
 * function VoiceChat(handle: Handle) {
 *   const chat = createRealtimeChat(handle, {
 *     getToken: () => fetch('/api/realtime-token').then((r) => r.json()),
 *     adapter: openaiRealtime(),
 *   })
 *
 *   return () => (
 *     <div>
 *       <p>Status: {chat.status}</p>
 *       <button on={{ click: chat.status === 'idle' ? chat.connect : chat.disconnect }}>
 *         {chat.status === 'idle' ? 'Start' : 'Stop'}
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export function createRealtimeChat(
  handle: Handle,
  options: CreateRealtimeChatOptions,
) {
  let status: RealtimeStatus = 'idle'
  let mode: RealtimeMode = 'idle'
  let messages: Array<RealtimeMessage> = []
  let pendingUserTranscript: string | null = null
  let pendingAssistantTranscript: string | null = null
  let error: Error | null = null
  let animationFrame: number | null = null

  function notify() {
    if (!handle.signal.aborted) {
      void handle.update()
    }
  }

  function stopLevelLoop() {
    if (animationFrame === null) return
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }

  function startLevelLoop() {
    if (animationFrame !== null) return
    function tick() {
      animationFrame = requestAnimationFrame(tick)
      notify()
    }
    animationFrame = requestAnimationFrame(tick)
  }

  // Each optional source field is spread conditionally because the
  // `RealtimeClientOptions` target declares strict optionals
  // (`field?: T`) and `exactOptionalPropertyTypes` rejects passing
  // `undefined` for absent values.
  const client = new RealtimeClient({
    getToken: () => options.getToken(),
    adapter: {
      get provider() {
        return options.adapter.provider
      },
      connect(token, tools) {
        return options.adapter.connect(token, tools)
      },
    },
    ...(options.tools !== undefined && { tools: options.tools }),
    ...(options.instructions !== undefined && {
      instructions: options.instructions,
    }),
    ...(options.voice !== undefined && { voice: options.voice }),
    ...(options.autoPlayback !== undefined && {
      autoPlayback: options.autoPlayback,
    }),
    ...(options.autoCapture !== undefined && {
      autoCapture: options.autoCapture,
    }),
    ...(options.vadMode !== undefined && { vadMode: options.vadMode }),
    ...(options.outputModalities !== undefined && {
      outputModalities: options.outputModalities,
    }),
    ...(options.temperature !== undefined && {
      temperature: options.temperature,
    }),
    ...(options.maxOutputTokens !== undefined && {
      maxOutputTokens: options.maxOutputTokens,
    }),
    ...(options.semanticEagerness !== undefined && {
      semanticEagerness: options.semanticEagerness,
    }),
    onStatusChange: (newStatus) => {
      status = newStatus
      if (newStatus === 'connected') {
        startLevelLoop()
      } else {
        stopLevelLoop()
      }
      notify()
      options.onStatusChange?.(newStatus)
    },
    onModeChange: (newMode) => {
      mode = newMode
      notify()
      options.onModeChange?.(newMode)
    },
    onMessage: (message) => {
      messages = [...messages, message]
      notify()
      options.onMessage?.(message)
    },
    onUsage: (usage) => {
      options.onUsage?.(usage)
    },
    onGoAway: (timeLeft) => {
      options.onGoAway?.(timeLeft)
    },
    onError: (err) => {
      error = err
      notify()
      options.onError?.(err)
    },
    onConnect: () => {
      error = null
      notify()
      options.onConnect?.()
    },
    onDisconnect: () => {
      options.onDisconnect?.()
    },
    onInterrupted: () => {
      pendingAssistantTranscript = null
      notify()
      options.onInterrupted?.()
    },
  })

  client.onStateChange((state) => {
    pendingUserTranscript = state.pendingUserTranscript
    pendingAssistantTranscript = state.pendingAssistantTranscript
    notify()
  })

  handle.signal.addEventListener('abort', () => {
    stopLevelLoop()
    client.destroy()
  })

  return {
    get status() {
      return status
    },
    get error() {
      return error
    },
    connect: async () => {
      error = null
      messages = []
      pendingUserTranscript = null
      pendingAssistantTranscript = null
      notify()
      await client.connect()
    },
    disconnect: () => client.disconnect(),

    get mode() {
      return mode
    },
    get messages() {
      return messages
    },
    get pendingUserTranscript() {
      return pendingUserTranscript
    },
    get pendingAssistantTranscript() {
      return pendingAssistantTranscript
    },

    startListening: () => {
      client.startListening()
    },
    stopListening: () => {
      client.stopListening()
    },
    interrupt: () => {
      client.interrupt()
    },

    sendText: (text: string) => {
      client.sendText(text)
    },

    sendImage: (imageData: string, mimeType: string) => {
      client.sendImage(imageData, mimeType)
    },

    get inputLevel() {
      return client.audio?.inputLevel ?? 0
    },
    get outputLevel() {
      return client.audio?.outputLevel ?? 0
    },
    getInputFrequencyData: () =>
      client.audio?.getInputFrequencyData() ?? emptyFrequencyData,
    getOutputFrequencyData: () =>
      client.audio?.getOutputFrequencyData() ?? emptyFrequencyData,
    getInputTimeDomainData: () =>
      client.audio?.getInputTimeDomainData() ?? emptyTimeDomainData,
    getOutputTimeDomainData: () =>
      client.audio?.getOutputTimeDomainData() ?? emptyTimeDomainData,

    updateSession: (config: RealtimeSessionConfig) => {
      client.updateSession(config)
    },
  }
}
