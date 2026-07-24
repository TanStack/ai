import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { uiMessagesToWire } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import type { ChatClientPersistence, UIMessage } from '@tanstack/ai-client'
import type { GeminiInteractionsCustomEventValue } from '@tanstack/ai-gemini/experimental'
import type { Feature, Mode, Provider } from '@/lib/types'
import { ALL_FEATURES, ALL_PROVIDERS } from '@/lib/types'
import { isSupported } from '@/lib/feature-support'
import { addToCartToolDef } from '@/lib/tools'
import { NotSupported } from '@/components/NotSupported'
import { ChatUI } from '@/components/ChatUI'
import { ImageGenUI } from '@/components/ImageGenUI'
import { TTSUI } from '@/components/TTSUI'
import { TranscriptionUI } from '@/components/TranscriptionUI'
import { VideoGenUI } from '@/components/VideoGenUI'
import { AudioGenUI } from '@/components/AudioGenUI'

const VALID_MODES = new Set<Mode>(['sse', 'http-stream', 'fetcher'])

export const Route = createFileRoute('/$provider/$feature')({
  component: FeaturePage,
  validateSearch: (search: Record<string, unknown>) => {
    const port =
      typeof search.aimockPort === 'number'
        ? search.aimockPort
        : typeof search.aimockPort === 'string'
          ? parseInt(search.aimockPort, 10)
          : undefined
    const rawMode = typeof search.mode === 'string' ? search.mode : undefined
    return {
      testId: typeof search.testId === 'string' ? search.testId : undefined,
      aimockPort: port != null && !isNaN(port) ? port : undefined,
      mode:
        rawMode && VALID_MODES.has(rawMode as Mode)
          ? (rawMode as Mode)
          : undefined,
      persistence:
        search.persistence === 'localStorage' ? 'localStorage' : undefined,
      serverPersistence:
        search.serverPersistence === true ||
        search.serverPersistence === 1 ||
        search.serverPersistence === '1',
    }
  },
})

const MEDIA_FEATURES = new Set<Feature>([
  'image-gen',
  'image-to-image',
  'tts',
  'transcription',
  'transcription-diarization',
  'video-gen',
  'image-to-video',
  'interactions-video',
  'audio-gen',
  'sound-effects',
])

const addToCartClient = addToCartToolDef.client((args) => ({
  success: true,
  cartId: 'CART_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
}))

type StoredUIMessage = Omit<UIMessage, 'createdAt'> & {
  createdAt?: Date | string
}

function serializeJson(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new TypeError('The persistence value is not JSON serializable')
  }
  return serialized
}

const isProvider = (s: string): s is Provider =>
  (ALL_PROVIDERS as ReadonlyArray<string>).includes(s)
const isFeature = (s: string): s is Feature =>
  (ALL_FEATURES as ReadonlyArray<string>).includes(s)
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function isStoredUIMessage(value: unknown): value is StoredUIMessage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.role === 'system' ||
      value.role === 'user' ||
      value.role === 'assistant') &&
    Array.isArray(value.parts) &&
    (value.createdAt === undefined ||
      value.createdAt instanceof Date ||
      typeof value.createdAt === 'string')
  )
}

function deserializeMessages(raw: string): Array<UIMessage> {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed) || !parsed.every(isStoredUIMessage)) {
    throw new TypeError('Stored messages are invalid')
  }
  return parsed.map(({ createdAt, ...message }) => ({
    ...message,
    ...(createdAt
      ? {
          createdAt:
            createdAt instanceof Date ? createdAt : new Date(createdAt),
        }
      : {}),
  }))
}

/** Simple localStorage message adapter (no @tanstack/ai-client storage helpers). */
const messagePersistence: ChatClientPersistence = {
  getItem(id) {
    try {
      const raw = localStorage.getItem(id)
      return raw === null ? null : deserializeMessages(raw)
    } catch {
      return null
    }
  },
  setItem(id, messages) {
    localStorage.setItem(id, serializeJson(messages))
  },
  removeItem(id) {
    localStorage.removeItem(id)
  },
}

function FeaturePage() {
  const { provider, feature } = Route.useParams()
  const { testId, aimockPort, mode } = Route.useSearch()

  if (
    !isProvider(provider) ||
    !isFeature(feature) ||
    !isSupported(provider, feature)
  ) {
    return <NotSupported provider={provider} feature={feature} />
  }

  if (MEDIA_FEATURES.has(feature)) {
    return (
      <MediaFeature
        provider={provider}
        feature={feature}
        mode={mode || 'sse'}
        testId={testId}
        aimockPort={aimockPort}
      />
    )
  }

  return <ChatFeature provider={provider} feature={feature} mode={mode} />
}

function MediaFeature({
  provider,
  feature,
  mode,
  testId,
  aimockPort,
}: {
  provider: Provider
  feature: Feature
  mode: Mode
  testId?: string
  aimockPort?: number
}) {
  switch (feature) {
    case 'image-gen':
      return (
        <ImageGenUI
          provider={provider}
          mode={mode}
          testId={testId}
          aimockPort={aimockPort}
        />
      )
    case 'image-to-image':
      return (
        <ImageGenUI
          provider={provider}
          mode={mode}
          testId={testId}
          aimockPort={aimockPort}
          withImageInput
        />
      )
    case 'tts':
      return (
        <TTSUI
          provider={provider}
          mode={mode}
          testId={testId}
          aimockPort={aimockPort}
        />
      )
    case 'transcription':
    case 'transcription-diarization':
      return (
        <TranscriptionUI
          provider={provider}
          feature={feature}
          mode={mode}
          testId={testId}
          aimockPort={aimockPort}
        />
      )
    case 'video-gen':
      return (
        <VideoGenUI
          provider={provider}
          mode={mode}
          testId={testId}
          aimockPort={aimockPort}
        />
      )
    case 'image-to-video':
      return (
        <VideoGenUI
          provider={provider}
          mode={mode}
          testId={testId}
          aimockPort={aimockPort}
          withImageInput
        />
      )
    case 'interactions-video':
      return (
        <VideoGenUI
          provider={provider}
          mode={mode}
          testId={testId}
          aimockPort={aimockPort}
          feature="interactions-video"
        />
      )
    case 'audio-gen':
    case 'sound-effects':
      return (
        <AudioGenUI
          provider={provider}
          mode={mode}
          testId={testId}
          aimockPort={aimockPort}
          feature={feature}
        />
      )
    default:
      return <NotSupported provider={provider} feature={feature} />
  }
}

function ChatFeature({
  provider,
  feature,
  mode,
}: {
  provider: Provider
  feature: Feature
  mode?: Mode
}) {
  const needsApproval = feature === 'tool-approval'
  const showImageInput =
    feature === 'multimodal-image' || feature === 'multimodal-structured'

  // Stable tools tuple so `useChat` / `BoundInterrupts` keep approval typing
  // (and ChatUI can accept `interrupts` without casts).
  const approvalTools = clientTools(addToCartClient)
  const tools = needsApproval ? approvalTools : undefined

  const { testId, aimockPort, persistence, serverPersistence } =
    Route.useSearch()
  const persistenceEnabled = persistence === 'localStorage'
  const serverPersistenceEnabled = serverPersistence === true
  const baseChatId = `e2e-chat-${testId ?? `${provider}-${feature}`}`
  // When persistence is on, expose a tiny thread switcher so e2e can verify that
  // changing the `id` in place swaps to that id's own persisted history (the
  // render-from-getMessages + activeClientRef path), keyed per thread. Start on
  // thread "a" (not null) so the page loads already on a thread id — switching
  // is then a pure in-place id swap with no initial null→thread transition.
  const [activeThread, setActiveThread] = useState<string | null>(
    persistenceEnabled ? 'a' : null,
  )
  const chatId = activeThread ? `${baseChatId}:${activeThread}` : baseChatId

  const [structuredObject, setStructuredObject] = useState<unknown>(null)
  const [contentDeltaCount, setContentDeltaCount] = useState(0)
  const [interactionId, setInteractionId] = useState<string | undefined>(
    undefined,
  )

  const transport =
    mode === 'fetcher'
      ? {
          fetcher: async (
            input: {
              messages: Array<UIMessage>
              data?: unknown
              threadId: string
              runId: string
              resume?: Array<unknown>
            },
            options: { signal: AbortSignal },
          ) =>
            // Mirror what `fetchServerSentEvents` posts: full AG-UI
            // `RunAgentInput` envelope with messages converted to wire
            // format (UIMessage parts get flattened to string content).
            // `useChat({ body })` already flowed provider/feature/testId/
            // aimockPort into `input.data`, so it forwards as
            // `forwardedProps`.
            fetch('/api/chat', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                // Sentinel header so e2e tests can positively assert the
                // fetcher path executed (and didn't silently fall back to
                // the connection adapter).
                'x-tanstack-ai-transport': 'fetcher',
              },
              body: JSON.stringify({
                threadId: input.threadId,
                runId: input.runId,
                state: {},
                messages: uiMessagesToWire(input.messages),
                tools: [],
                context: [],
                forwardedProps: input.data,
                ...(input.resume ? { resume: input.resume } : {}),
              }),
              signal: options.signal,
            }),
        }
      : { connection: fetchServerSentEvents('/api/chat') }

  const {
    messages,
    sendMessage,
    isLoading,
    resumeState,
    interrupts,
    stop,
    clear,
    queue,
    cancelQueued,
  } = useChat({
    id: chatId,
    threadId: chatId,
    ...transport,
    tools,
    body: {
      provider,
      feature,
      testId,
      aimockPort,
      previousInteractionId: interactionId,
      serverPersistence: serverPersistenceEnabled,
    },
    // Message list persistence only. Interrupt resume snapshots are in-memory
    // on this branch (durable resume adapters live on feat/persistence).
    persistence: persistenceEnabled ? messagePersistence : undefined,
    onCustomEvent: (eventType, data) => {
      if (eventType === 'structured-output.complete') {
        const value = data as { object: unknown; raw: string } | undefined
        setStructuredObject(value?.object ?? null)
      } else if (eventType === 'gemini.interactionId') {
        const value = data as
          | GeminiInteractionsCustomEventValue<'gemini.interactionId'>
          | undefined
        if (value?.interactionId) setInteractionId(value.interactionId)
      }
    },
    onChunk: (chunk) => {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        setContentDeltaCount((n) => n + 1)
      }
    },
  })

  return (
    <>
      {resumeState && (
        <div
          data-testid="resume-state"
          data-thread-id={resumeState.threadId}
          data-run-id={resumeState.runId}
          hidden
        />
      )}
      <div
        data-testid="pending-interrupt-count"
        data-count={String(interrupts.length)}
        hidden
      />
      {interactionId && (
        <div data-testid="gemini-interaction-id" hidden>
          {interactionId}
        </div>
      )}
      {persistenceEnabled && (
        <div className="flex gap-2 border-b border-gray-700 p-2">
          <button
            type="button"
            data-testid="select-thread-a"
            onClick={() => setActiveThread('a')}
          >
            Thread A
          </button>
          <button
            type="button"
            data-testid="select-thread-b"
            onClick={() => setActiveThread('b')}
          >
            Thread B
          </button>
          <button type="button" data-testid="clear-button" onClick={clear}>
            Clear
          </button>
        </div>
      )}
      <ChatUI
        messages={messages}
        isLoading={isLoading}
        structuredObject={structuredObject}
        contentDeltaCount={contentDeltaCount}
        queue={queue}
        cancelQueued={cancelQueued}
        onSendMessage={(text) => {
          sendMessage(text)
        }}
        onSendMessageWithImage={
          showImageInput
            ? (text, file) => {
                const reader = new FileReader()
                reader.onload = () => {
                  const base64 = (reader.result as string).split(',')[1]
                  sendMessage({
                    content: [
                      { type: 'text', content: text },
                      {
                        type: 'image',
                        source: {
                          type: 'data',
                          value: base64,
                          mimeType: file.type,
                        },
                      },
                    ],
                  })
                }
                reader.readAsDataURL(file)
              }
            : undefined
        }
        interrupts={needsApproval ? interrupts : undefined}
        hasPendingInterrupt={interrupts.some((i) => i.status === 'pending')}
        showImageInput={showImageInput}
        onStop={stop}
      />
    </>
  )
}
