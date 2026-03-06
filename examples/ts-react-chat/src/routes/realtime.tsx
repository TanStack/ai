import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Mic, MicOff, Phone, PhoneOff, Volume2, Wrench } from 'lucide-react'
import { AudioSparkline } from '@/components/AudioSparkline'
import { useRealtime } from '@/lib/use-realtime'

type Provider = 'openai' | 'elevenlabs'

const PROVIDER_OPTIONS: Array<{ value: Provider; label: string }> = [
  { value: 'openai', label: 'OpenAI Realtime' },
  { value: 'elevenlabs', label: 'ElevenLabs' },
]

function RealtimePage() {
  const [provider, setProvider] = useState<Provider>('openai')
  const [agentId, setAgentId] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    status,
    mode,
    messages,
    pendingUserTranscript,
    pendingAssistantTranscript,
    error,
    connect,
    disconnect,
    interrupt,
    inputLevel,
    outputLevel,
    getInputTimeDomainData,
    getOutputTimeDomainData,
  } = useRealtime({ provider, agentId })

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pendingUserTranscript, pendingAssistantTranscript])

  // Get status color
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  // Get mode icon
  const getModeIndicator = () => {
    switch (mode) {
      case 'listening':
        return (
          <div className="flex items-center gap-2 text-green-400">
            <Mic className="w-5 h-5 animate-pulse" />
            <span>Listening...</span>
          </div>
        )
      case 'thinking':
        return (
          <div className="flex items-center gap-2 text-yellow-400">
            <div className="w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            <span>Thinking...</span>
          </div>
        )
      case 'speaking':
        return (
          <div className="flex items-center gap-2 text-blue-400">
            <Volume2 className="w-5 h-5 animate-pulse" />
            <span>Speaking...</span>
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-2 text-gray-400">
            <MicOff className="w-5 h-5" />
            <span>Idle</span>
          </div>
        )
    }
  }

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900">
      <div className="w-full flex flex-col">
        {/* Header */}
        <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Provider selector */}
              <div>
                <label className="text-sm text-gray-400 mb-1 block">
                  Provider
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as Provider)}
                  disabled={status !== 'idle'}
                  className="rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
                >
                  {PROVIDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* ElevenLabs Agent ID (conditional) */}
              {provider === 'elevenlabs' && (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">
                    Agent ID
                  </label>
                  <input
                    type="text"
                    value={agentId}
                    onChange={(e) => setAgentId(e.target.value)}
                    placeholder="Your ElevenLabs Agent ID"
                    disabled={status !== 'idle'}
                    className="rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50 w-64"
                  />
                </div>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
                <span className="text-sm text-gray-300 capitalize">
                  {status}
                </span>
              </div>
              {getModeIndicator()}
            </div>
          </div>
        </div>

        {/* Tools indicator */}
        {provider === 'openai' && (
          <div className="border-b border-orange-500/10 bg-gray-800/50 px-4 py-2">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Wrench className="w-3 h-3" />
              <span>Tools enabled:</span>
              <span className="text-gray-300">getCurrentTime</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-300">getWeather</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-300">setReminder</span>
              <span className="text-gray-500">•</span>
              <span className="text-gray-300">searchKnowledge</span>
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 && status === 'idle' && (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Mic className="w-16 h-16 mb-4" />
              <p className="text-lg">Voice Chat with Tools</p>
              <p className="text-sm">
                Click "Start Conversation" to begin talking with the AI
              </p>
              <p className="text-xs mt-2 text-gray-600">
                Try asking: "What time is it?" or "What's the weather in San
                Francisco?"
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`p-4 rounded-lg mb-2 ${
                message.role === 'assistant'
                  ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
                  : 'bg-transparent'
              }`}
            >
              <div className="flex items-start gap-4">
                {message.role === 'assistant' ? (
                  <div className="w-8 h-8 rounded-lg bg-linear-to-r from-orange-500 to-red-600 flex items-center justify-center text-sm font-medium text-white shrink-0">
                    AI
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0">
                    U
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {message.parts.map((part, idx) => {
                    if (part.type === 'audio') {
                      return (
                        <p key={idx} className="text-white">
                          {part.transcript}
                        </p>
                      )
                    }
                    if (part.type === 'text') {
                      return (
                        <p key={idx} className="text-white">
                          {part.content}
                        </p>
                      )
                    }
                    return null
                  })}
                  {message.interrupted && (
                    <span className="text-xs text-gray-500 ml-2">
                      (interrupted)
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Pending transcripts */}
          {pendingUserTranscript && (
            <div className="p-4 rounded-lg mb-2 bg-transparent opacity-60">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  U
                </div>
                <p className="text-white italic">{pendingUserTranscript}...</p>
              </div>
            </div>
          )}

          {pendingAssistantTranscript && (
            <div className="p-4 rounded-lg mb-2 bg-linear-to-r from-orange-500/5 to-red-600/5 opacity-60">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-lg bg-linear-to-r from-orange-500 to-red-600 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  AI
                </div>
                <p className="text-white italic">
                  {pendingAssistantTranscript}...
                </p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error display */}
        {error && (
          <div className="mx-4 mb-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
            Error: {error.message}
          </div>
        )}

        {/* Audio visualization & controls */}
        <div className="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm p-4">
          {/* Volume meters and waveforms */}
          {status === 'connected' && (
            <div className="mb-4 space-y-3">
              {/* Input (Microphone) */}
              <div className="flex items-center gap-3">
                <Mic className="w-4 h-4 text-gray-400" />
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-75"
                    style={{ width: `${inputLevel * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">
                  {Math.round(inputLevel * 100)}%
                </span>
                <AudioSparkline
                  getData={getInputTimeDomainData}
                  color="#22c55e"
                  label="Input"
                />
              </div>
              {/* Output (Speaker) */}
              <div className="flex items-center gap-3">
                <Volume2 className="w-4 h-4 text-gray-400" />
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-75"
                    style={{ width: `${outputLevel * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">
                  {Math.round(outputLevel * 100)}%
                </span>
                <AudioSparkline
                  getData={getOutputTimeDomainData}
                  color="#3b82f6"
                  label="Output"
                />
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-center gap-4">
            {status === 'idle' ? (
              <button
                onClick={connect}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-full text-sm font-medium transition-colors"
              >
                <Phone className="w-5 h-5" />
                Start Conversation
              </button>
            ) : (
              <>
                {mode === 'speaking' && (
                  <button
                    onClick={interrupt}
                    className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Interrupt
                  </button>
                )}
                <button
                  onClick={disconnect}
                  className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-medium transition-colors"
                >
                  <PhoneOff className="w-5 h-5" />
                  End Conversation
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/realtime')({
  component: RealtimePage,
})
