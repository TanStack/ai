import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import type { Feature, Provider } from '@/lib/types'
import { ALL_PROVIDERS } from '@/lib/types'
import { isSupported } from '@/lib/feature-support'
import { addToCartToolDef } from '@/lib/tools'
import { NotSupported } from '@/components/NotSupported'
import { ChatUI } from '@/components/ChatUI'
import { SummarizeUI } from '@/components/SummarizeUI'
import { ImageDisplay } from '@/components/ImageDisplay'
import { AudioPlayer } from '@/components/AudioPlayer'
import { TranscriptionDisplay } from '@/components/TranscriptionDisplay'

export const Route = createFileRoute('/$provider/$feature')({
  component: FeaturePage,
})

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

  if (!ALL_PROVIDERS.includes(provider) || !isSupported(provider, feature)) {
    return <NotSupported provider={provider} feature={feature} />
  }

  // All features use ChatUI — the user sends a message and gets a response
  return <ChatFeature provider={provider} feature={feature} />
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

  const { messages, sendMessage, isLoading, addToolApprovalResponse, stop } =
    useChat({
      connection: fetchServerSentEvents('/api/chat'),
      tools,
      body: { provider, feature },
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

function SummarizeFeature({
  provider,
  stream,
}: {
  provider: Provider
  stream: boolean
}) {
  const [result, setResult] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (text: string) => {
    setIsLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, provider, stream }),
      })
      const data = await res.json()
      setResult(data.summary)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <SummarizeUI
      onSubmit={handleSubmit}
      result={result}
      isLoading={isLoading}
    />
  )
}

function ImageGenFeature({ provider }: { provider: Provider }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleGenerate = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'a guitar in a music store', provider }),
      })
      const data = await res.json()
      setImageSrc(data.url || data.image)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-4">
      <button
        data-testid="send-button"
        onClick={handleGenerate}
        disabled={isLoading}
        className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
      >
        {isLoading ? 'Generating...' : 'Generate Image'}
      </button>
      {imageSrc && <ImageDisplay src={imageSrc} />}
    </div>
  )
}

function TTSFeature({ provider }: { provider: Provider }) {
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleGenerate = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Welcome to the guitar store', provider }),
      })
      const data = await res.json()
      setAudioSrc(data.url || data.audio)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-4">
      <button
        data-testid="send-button"
        onClick={handleGenerate}
        disabled={isLoading}
        className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
      >
        {isLoading ? 'Generating...' : 'Generate Speech'}
      </button>
      {audioSrc && <AudioPlayer src={audioSrc} />}
    </div>
  )
}

function TranscriptionFeature({ provider }: { provider: Provider }) {
  const [text, setText] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleTranscribe = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: 'test-audio-base64', provider }),
      })
      const data = await res.json()
      setText(data.text)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="p-4">
      <button
        data-testid="send-button"
        onClick={handleTranscribe}
        disabled={isLoading}
        className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
      >
        {isLoading ? 'Transcribing...' : 'Transcribe Audio'}
      </button>
      {text && <TranscriptionDisplay text={text} />}
    </div>
  )
}
