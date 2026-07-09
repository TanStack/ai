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
      typeof search.aimockPort === 'string'
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
  'audio-gen',
  'sound-effects',
])

const addToCartClient = addToCartToolDef.client((args) => ({
  success: true,
  cartId: 'CART_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
}))

const localStoragePersistence: ChatClientPersistence = {
  getItem: (id) => {
    const item = window.localStorage.getItem(id)
    return item
      ? (JSON.parse(item) as Array<UIMessage>).map((message) => ({
          ...message,
          createdAt:
            typeof message.createdAt === 'string'
              ? new Date(message.createdAt)
              : message.createdAt,
        }))
      : null
  },
  setItem: (id, messages) => {
    window.localStorage.setItem(id, JSON.stringify(messages))
  },
  removeItem: (id) => {
    window.localStorage.removeItem(id)
  },
}

const isProvider = (s: string): s is Provider =>
  (ALL_PROVIDERS as ReadonlyArray<string>).includes(s)
const isFeature = (s: string): s is Feature =>
  (ALL_FEATURES as ReadonlyArray<string>).includes(s)

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

  const tools = needsApproval ? clientTools(addToCartClient) : undefined

  const { testId, aimockPort, persistence } = Route.useSearch()
  const persistenceEnabled = persistence === 'localStorage'
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
              }),
              signal: options.signal,
            }),
        }
      : { connection: fetchServerSentEvents('/api/chat') }

  const {
    messages,
    sendMessage,
    isLoading,
    addToolApprovalResponse,
    stop,
    clear,
  } = useChat({
    id: chatId,
    ...transport,
    tools,
    body: {
      provider,
      feature,
      testId,
      aimockPort,
      previousInteractionId: interactionId,
    },
    persistence:
      persistence === 'localStorage' ? localStoragePersistence : undefined,
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
        addToolApprovalResponse={
          needsApproval ? addToolApprovalResponse : undefined
        }
        showImageInput={showImageInput}
        onStop={stop}
      />
    </>
  )
}
