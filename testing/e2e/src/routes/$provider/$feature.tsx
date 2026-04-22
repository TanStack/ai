import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import type { Feature, Mode, Provider } from '@/lib/types'
import { ALL_PROVIDERS } from '@/lib/types'
import { isSupported } from '@/lib/feature-support'
import { addToCartToolDef } from '@/lib/tools'
import { NotSupported } from '@/components/NotSupported'
import { ChatUI } from '@/components/ChatUI'
import { ImageGenUI } from '@/components/ImageGenUI'
import { TTSUI } from '@/components/TTSUI'
import { TranscriptionUI } from '@/components/TranscriptionUI'
import { VideoGenUI } from '@/components/VideoGenUI'

export const Route = createFileRoute('/$provider/$feature')({
  component: FeaturePage,
  validateSearch: (search: Record<string, unknown>) => {
    const port =
      typeof search.aimockPort === 'string'
        ? parseInt(search.aimockPort, 10)
        : undefined
    return {
      testId: typeof search.testId === 'string' ? search.testId : undefined,
      aimockPort: port != null && !isNaN(port) ? port : undefined,
      mode: typeof search.mode === 'string' ? (search.mode as Mode) : undefined,
    }
  },
})

const MEDIA_FEATURES = new Set<Feature>([
  'image-gen',
  'tts',
  'transcription',
  'video-gen',
])

const addToCartClient = addToCartToolDef.client((args) => ({
  success: true,
  cartId: 'CART_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
}))

function FeaturePage() {
  const { provider, feature } = Route.useParams() as {
    provider: Provider
    feature: Feature
  }
  const { testId, aimockPort, mode } = Route.useSearch()

  if (!ALL_PROVIDERS.includes(provider) || !isSupported(provider, feature)) {
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

  return <ChatFeature provider={provider} feature={feature} />
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
      return (
        <TranscriptionUI
          provider={provider}
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
    default:
      return <NotSupported provider={provider} feature={feature} />
  }
}

function ChatFeature({
  provider,
  feature,
}: {
  provider: Provider
  feature: Feature
}) {
  const needsApproval = feature === 'tool-approval'
  const showImageInput =
    feature === 'multimodal-image' || feature === 'multimodal-structured'

  const tools = needsApproval ? clientTools(addToCartClient) : undefined

  const { testId, aimockPort } = Route.useSearch()

  const { messages, sendMessage, isLoading, addToolApprovalResponse, stop } =
    useChat({
      connection: fetchServerSentEvents('/api/chat'),
      tools,
      body: { provider, feature, testId, aimockPort },
    })

  return (
    <ChatUI
      messages={messages}
      isLoading={isLoading}
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
  )
}
