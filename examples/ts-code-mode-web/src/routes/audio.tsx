import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Activity,
  Mic,
  Music,
  Send,
  Sparkles,
  Square,
  Upload,
  Volume2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { parsePartialJSON } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import type { VMEvent, IsolateVM } from '@/components'
import type { PlotData } from '@/components/audio/PlotRenderer'
import {
  CodeBlock,
  ExecutionResult,
  JavaScriptVM,
  ToolSidebar,
  CollapsibleSection,
  AUDIO_ISOLATE_VM_TOOLS,
  AUDIO_CATEGORY_CONFIG,
  Header,
} from '@/components'
import { AudioFileList, MonitorStatus, PlotRenderer } from '@/components/audio'
import { useAudioManager } from '@/hooks/useAudioManager'

export const Route = createFileRoute('/audio')({
  component: AudioWorkbenchPage,
})

type Provider = 'anthropic' | 'openai' | 'gemini'

interface ModelOption {
  provider: Provider
  model: string
  label: string
}

const MODEL_OPTIONS: Array<ModelOption> = [
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
  },
  {
    provider: 'anthropic',
    model: 'claude-haiku-4-20250514',
    label: 'Claude Haiku 4',
  },
  { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o' },
  { provider: 'gemini', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
]

const PROMPT_SUGGESTIONS = [
  {
    label: '🎤 Check my noise floor',
    prompt: 'Record 5 seconds of silence and analyze my noise floor',
  },
  {
    label: '🔊 Find harsh frequencies',
    prompt: 'Analyze the audio and find any harsh frequencies I should cut',
  },
  {
    label: '📊 Show the spectrum',
    prompt: 'Show me the frequency spectrum of the loaded audio',
  },
  {
    label: '🎛️ Compare before/after',
    prompt: 'Apply some EQ cuts and show me a before/after comparison',
  },
]

/**
 * Show a file picker dialog and return the selected file
 * Uses a promise-based approach to work with async/await
 */
function showFilePicker(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*'

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        resolve(file)
      } else {
        reject(new Error('No file selected'))
      }
    }

    // Handle cancel (user closes dialog without selecting)
    input.oncancel = () => {
      reject(new Error('File selection cancelled'))
    }

    // Also handle if the dialog is dismissed without selection
    // This is a fallback since oncancel isn't universally supported
    const handleFocus = () => {
      setTimeout(() => {
        if (!input.files?.length) {
          window.removeEventListener('focus', handleFocus)
          // Don't reject here as it might fire before selection
        }
      }, 300)
    }
    window.addEventListener('focus', handleFocus)

    input.click()
  })
}

// LLM Tools for Audio Workbench
const AUDIO_LLM_TOOLS = [
  {
    name: 'execute_typescript',
    description: 'Runs TypeScript code in a sandboxed environment',
  },
]

function AudioWorkbenchPage() {
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODEL_OPTIONS[0],
  )
  const [selectedVM, setSelectedVM] = useState<IsolateVM>('node')
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map())
  const [toolInvocationCounts, setToolInvocationCounts] = useState<
    Map<string, number>
  >(new Map())
  const [plotsByToolCall, setPlotsByToolCall] = useState<
    Map<string, Array<PlotData>>
  >(new Map())
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const eventIdCounter = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Audio manager for client-side audio operations
  const audioManager = useAudioManager()

  // Use a ref to always get the current audioManager in callbacks
  // This fixes stale closure issues when callbacks are passed to useChat
  const audioManagerRef = useRef(audioManager)
  audioManagerRef.current = audioManager

  // Pre-load example audio file on mount
  useEffect(() => {
    const loadExampleAudio = async () => {
      try {
        const response = await fetch('/media/example-1.wav')
        if (!response.ok) {
          console.warn('[AudioWorkbench] Example audio not found')
          return
        }
        const arrayBuffer = await response.arrayBuffer()

        // Decode the audio
        const audioContext = new AudioContext()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

        // Get the samples (mono - just use channel 0)
        const samples = audioBuffer.getChannelData(0)

        // Store in audio manager (use replace: true to handle React strict mode double-render)
        audioManager.storeAudio('example-1', samples, audioBuffer.sampleRate, {
          replace: true,
        })
        console.log(
          '[AudioWorkbench] Pre-loaded example-1.wav:',
          audioBuffer.duration.toFixed(2),
          'seconds',
        )

        await audioContext.close()
      } catch (err) {
        console.error('[AudioWorkbench] Failed to load example audio:', err)
      }
    }

    loadExampleAudio()
  }, [audioManager])

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
    }),
    [selectedModel.provider, selectedModel.model],
  )

  // Resolve an async request by POSTing to the server
  const resolveRequest = useCallback(
    async (requestId: string, data: unknown, error?: string) => {
      try {
        console.log(`[AsyncResolve] Sending response for ${requestId}`)
        const response = await fetch('/api/audio-resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId, data, error }),
        })
        const result = await response.json()
        console.log(`[AsyncResolve] Response:`, result)
        return result.success
      } catch (err) {
        console.error('[AsyncResolve] Failed to resolve request:', err)
        return false
      }
    },
    [],
  )

  // Handle custom events from the server
  // Uses audioManagerRef to always get the current audioManager (avoids stale closure)
  const handleCustomEvent = useCallback(
    async (
      eventType: string,
      data: unknown,
      context: { toolCallId?: string },
    ) => {
      const toolCallId = context.toolCallId
      const eventData = data as Record<string, unknown>
      // Use ref to get current audioManager (fixes stale closure issue)
      const am = audioManagerRef.current

      // Handle plot rendering - associate with toolCallId for inline display
      if (eventType === 'plot:render') {
        const plotData = data as PlotData
        if (toolCallId) {
          setPlotsByToolCall((prev) => {
            const newMap = new Map(prev)
            const existing = newMap.get(toolCallId) || []
            newMap.set(toolCallId, [...existing, plotData])
            return newMap
          })
        }
        return
      }

      // Handle audio operations with async request/response pattern
      if (eventType.startsWith('audio:')) {
        const requestId = eventData.requestId as string | undefined

        try {
          switch (eventType) {
            // === ASYNC REQUEST HANDLERS (wait for client, POST response) ===

            case 'audio:load_request': {
              const source = eventData.source as
                | 'file'
                | 'microphone'
                | 'stored'
              const name = eventData.name as string | undefined
              const duration = (eventData.duration as number) || 5

              console.log(
                `[Audio] Load request: source=${source}, name=${name}, requestId=${requestId}`,
              )

              try {
                let audioData: {
                  samples: Array<number>
                  sampleRate: number
                  duration: number
                  channels: number
                }

                if (source === 'stored') {
                  // Get from stored audio
                  // Debug: list all available audio to check state
                  const availableAudio = am.listAudio()
                  console.log(
                    `[Audio] Getting stored audio "${name}". Available:`,
                    availableAudio.map((a) => a.name),
                  )
                  const stored = am.getAudio(name!)
                  if (!stored) {
                    throw new Error(
                      `Audio "${name}" not found. Available: ${availableAudio.map((a) => a.name).join(', ') || 'none'}`,
                    )
                  }
                  audioData = {
                    samples: Array.from(stored.samples),
                    sampleRate: stored.sampleRate,
                    duration: stored.duration,
                    channels: 1,
                  }
                } else if (source === 'microphone') {
                  // Record from microphone
                  setIsRecording(true)
                  try {
                    const result = await am.recordFromMicrophone(duration)
                    audioData = {
                      samples: Array.from(result.samples),
                      sampleRate: result.sampleRate,
                      duration: result.duration,
                      channels: result.channels,
                    }
                    // Also store the recording
                    const recordingName = `recording_${Date.now()}`
                    am.storeAudio(
                      recordingName,
                      result.samples,
                      result.sampleRate,
                    )
                  } finally {
                    setIsRecording(false)
                  }
                } else {
                  // File upload - show file picker
                  const file = await showFilePicker()
                  const result = await am.loadAudioFile(file)
                  audioData = {
                    samples: Array.from(result.samples),
                    sampleRate: result.sampleRate,
                    duration: result.duration,
                    channels: result.channels,
                  }
                  // Store the uploaded audio
                  const fileName = file.name.replace(/\.[^/.]+$/, '')
                  am.storeAudio(
                    fileName,
                    result.samples,
                    result.sampleRate,
                  )
                }

                // Send success response
                await resolveRequest(requestId!, audioData)
              } catch (err) {
                // Send error response
                await resolveRequest(
                  requestId!,
                  null,
                  (err as Error).message || 'Failed to load audio',
                )
              }
              break
            }

            case 'audio:play_request': {
              const name = eventData.name as string
              console.log(
                `[Audio] Play request: name=${name}, requestId=${requestId}`,
              )

              setPlayingAudio(name)
              try {
                await am.playAudio(name)
                const stored = am.getAudio(name)
                await resolveRequest(requestId!, {
                  success: true,
                  duration: stored?.duration,
                })
              } catch (err) {
                await resolveRequest(requestId!, {
                  success: false,
                  error: (err as Error).message,
                })
              } finally {
                setPlayingAudio(null)
              }
              break
            }

            case 'audio:list_request': {
              console.log(`[Audio] List request: requestId=${requestId}`)
              const files = am.listAudio()
              await resolveRequest(requestId!, { files })
              break
            }

            // === FIRE-AND-FORGET HANDLERS (no response needed) ===

            case 'audio:store': {
              const samples = eventData.samples as Array<number>
              const sampleRate = eventData.sampleRate as number
              const name = eventData.name as string
              const description = eventData.description as string | undefined
              const replace = eventData.replace as boolean | undefined

              am.storeAudio(name, samples, sampleRate, {
                description,
                replace,
              })
              console.log(`[Audio] Stored audio "${name}"`)
              break
            }

            case 'audio:delete': {
              const name = eventData.name as string
              am.deleteAudio(name)
              console.log(`[Audio] Deleted audio "${name}"`)
              break
            }
          }
        } catch (err) {
          console.error('[Audio] Error handling event:', eventType, err)
          // If there's a requestId, try to send error response
          if (requestId) {
            await resolveRequest(
              requestId,
              null,
              (err as Error).message || 'Unknown error',
            )
          }
        }
        return
      }

      // Handle plugin operations (simplified)
      if (eventType.startsWith('plugin:')) {
        try {
          switch (eventType) {
            case 'plugin:create': {
              await am.registerPlugin({
                name: eventData.name as string,
                processorCode: eventData.processorCode as string,
                params: eventData.params as Array<{
                  name: string
                  defaultValue: number
                  min?: number
                  max?: number
                }>,
                description: eventData.description as string | undefined,
              })
              console.log(`[Plugin] Created plugin "${eventData.name}"`)
              break
            }

            case 'plugin:delete': {
              am.deletePlugin(eventData.name as string)
              console.log(`[Plugin] Deleted plugin "${eventData.name}"`)
              break
            }
          }
        } catch (err) {
          console.error('[Plugin] Error handling event:', eventType, err)
        }
        return
      }

      // Handle monitor operations (simplified)
      if (eventType.startsWith('monitor:')) {
        try {
          switch (eventType) {
            case 'monitor:start': {
              const plugins = eventData.plugins as Array<{
                name: string
                params?: Record<string, number>
              }>
              await am.startMonitor(plugins)
              console.log(
                '[Monitor] Started with plugins:',
                plugins.map((p) => p.name),
              )
              break
            }

            case 'monitor:stop': {
              am.stopMonitor()
              console.log('[Monitor] Stopped')
              break
            }

            case 'monitor:updateParam': {
              am.updateMonitorParam(
                eventData.pluginName as string,
                eventData.paramName as string,
                eventData.value as number,
              )
              break
            }

            case 'monitor:setChain': {
              const plugins = eventData.plugins as Array<{
                name: string
                params?: Record<string, number>
              }>
              await am.setMonitorChain(plugins)
              console.log(
                '[Monitor] Chain updated:',
                plugins.map((p) => p.name),
              )
              break
            }
          }
        } catch (err) {
          console.error('[Monitor] Error handling event:', eventType, err)
        }
        return
      }

      // Track tool call events for VM display
      if (toolCallId) {
        const event: VMEvent = {
          id: `event-${eventIdCounter.current++}`,
          eventType,
          data,
          timestamp: Date.now(),
        }

        setToolCallEvents((prev) => {
          const newMap = new Map(prev)
          const events = newMap.get(toolCallId) || []
          newMap.set(toolCallId, [...events, event])
          return newMap
        })

        // Track invocation counts for external_* calls
        if (eventType === 'code_mode:external_call') {
          const functionName = (data as { function?: string })?.function
          if (functionName) {
            setToolInvocationCounts((prev) => {
              const newMap = new Map(prev)
              newMap.set(functionName, (prev.get(functionName) || 0) + 1)
              return newMap
            })
          }
        }
      }
    },
    [resolveRequest],
  )

  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/audio'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  const [input, setInput] = useState('')

  // Handle file upload
  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      try {
        const result = await audioManager.loadAudioFile(file)
        // Store the audio with the file name
        const name = file.name.replace(/\.[^/.]+$/, '')
        audioManager.storeAudio(name, result.samples, result.sampleRate)
        console.log(`[Audio] Loaded and stored "${name}"`)
      } catch (err) {
        console.error('[Audio] Failed to load file:', err)
      }

      // Reset input
      e.target.value = ''
    },
    [audioManager],
  )

  // Manual file upload button
  const handleManualUpload = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const result = await audioManager.loadAudioFile(file)
        const name = file.name.replace(/\.[^/.]+$/, '')
        audioManager.storeAudio(name, result.samples, result.sampleRate)
      } catch (err) {
        console.error('Failed to load audio:', err)
      }
    }
    input.click()
  }, [audioManager])

  // Manual recording
  const handleManualRecord = useCallback(async () => {
    setIsRecording(true)
    try {
      const result = await audioManager.recordFromMicrophone(5)
      const name = `recording_${Date.now()}`
      audioManager.storeAudio(name, result.samples, result.sampleRate)
    } catch (err) {
      console.error('Failed to record:', err)
    } finally {
      setIsRecording(false)
    }
  }, [audioManager])

  // Compute LLM tool call counts from messages
  const llmToolCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          counts.set(part.name, (counts.get(part.name) || 0) + 1)
        }
      }
    }
    return counts
  }, [messages])

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <Header>
        {/* Model Selector */}
        <select
          value={MODEL_OPTIONS.findIndex(
            (opt) =>
              opt.provider === selectedModel.provider &&
              opt.model === selectedModel.model,
          )}
          onChange={(e) =>
            setSelectedModel(MODEL_OPTIONS[parseInt(e.target.value)])
          }
          disabled={isLoading}
          className="rounded-lg border border-cyan-500/20 bg-gray-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
        >
          {MODEL_OPTIONS.map((option, index) => (
            <option key={index} value={index}>
              {option.label}
            </option>
          ))}
        </select>

        {isRecording && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-300">Recording...</span>
          </div>
        )}
      </Header>

      {/* Hidden file input for async requests */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Tool Sidebar with Audio Files */}
        <ToolSidebar
        selectedVM={selectedVM}
        onVMChange={setSelectedVM}
        toolInvocationCounts={toolInvocationCounts}
        llmToolCounts={llmToolCounts}
        llmTools={AUDIO_LLM_TOOLS}
        vmTools={AUDIO_ISOLATE_VM_TOOLS}
        categoryConfig={AUDIO_CATEGORY_CONFIG}
        llmToolsDefaultOpen={false}
        isolateVMDefaultOpen={false}
        vmToolsDefaultOpen={false}
        className="w-80"
      >
        {/* Audio Files Section - First and open by default */}
        <CollapsibleSection
          title="Audio Files"
          icon={<Music className="w-4 h-4" />}
          iconColorClass="text-cyan-400"
          titleColorClass="text-cyan-300"
          defaultOpen={true}
          badge={
            <div className="ml-auto flex gap-1">
              <button
                onClick={handleManualUpload}
                className="p-1.5 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                title="Upload audio file"
              >
                <Upload className="w-3 h-3" />
              </button>
              <button
                onClick={handleManualRecord}
                disabled={isRecording}
                className="p-1.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                title={isRecording ? 'Recording...' : 'Record from mic (5s)'}
              >
                {isRecording ? (
                  <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Mic className="w-3 h-3" />
                )}
              </button>
            </div>
          }
        >
          <AudioFileList
            files={audioManager.listAudio()}
            onPlay={async (name) => {
              setPlayingAudio(name)
              try {
                await audioManager.playAudio(name)
              } finally {
                setPlayingAudio(null)
              }
            }}
            onDelete={(name) => audioManager.deleteAudio(name)}
            playingName={playingAudio ?? undefined}
          />
        </CollapsibleSection>

        {/* Monitor Status Section */}
        {(audioManager.monitorState.active ||
          audioManager.monitorState.plugins.length > 0) && (
          <CollapsibleSection
            title="Monitor"
            icon={<Activity className="w-4 h-4" />}
            iconColorClass="text-green-400"
            titleColorClass="text-green-300"
            defaultOpen={true}
          >
            <MonitorStatus
              active={audioManager.monitorState.active}
              plugins={audioManager.monitorState.plugins}
              onStop={() => audioManager.stopMonitor()}
            />
          </CollapsibleSection>
        )}

        </ToolSidebar>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
            {/* Messages */}
          <Messages
            messages={messages}
            toolCallEvents={toolCallEvents}
            plotsByToolCall={plotsByToolCall}
          />

          {/* Input area */}
          <div className="border-t border-cyan-500/10 bg-gray-900/80 backdrop-blur-sm">
            <div className="max-w-4xl mx-auto px-4 py-3 space-y-3">
              {isLoading && (
                <div className="flex items-center justify-center">
                  <button
                    onClick={stop}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    Stop
                  </button>
                </div>
              )}

              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your audio: analyze spectrum, find issues, apply EQ..."
                  className="w-full rounded-lg border border-cyan-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
                  rows={2}
                  disabled={isLoading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                      e.preventDefault()
                      sendMessage(input)
                      setInput('')
                      setPlotsByToolCall(new Map()) // Clear old plots
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (input.trim()) {
                      sendMessage(input)
                      setInput('')
                      setPlotsByToolCall(new Map())
                    }
                  }}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 bottom-3 p-2 text-cyan-500 hover:text-cyan-400 disabled:text-gray-500 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>

              {/* Suggestions */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Sparkles className="w-3 h-3" />
                  <span>Try:</span>
                </div>
                {PROMPT_SUGGESTIONS.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      if (!isLoading) {
                        sendMessage(suggestion.prompt)
                        setPlotsByToolCall(new Map())
                      }
                    }}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 border border-cyan-500/20 hover:border-cyan-500/40 text-gray-300 rounded-full transition-all disabled:opacity-50"
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Messages component
function Messages({
  messages,
  toolCallEvents,
  plotsByToolCall,
}: {
  messages: Array<UIMessage>
  toolCallEvents: Map<string, Array<VMEvent>>
  plotsByToolCall: Map<string, Array<PlotData>>
}) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [messages, plotsByToolCall])

  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Volume2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">Audio Workbench</p>
          <p className="text-sm">
            Upload audio or record from your mic, then ask questions about it
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(75, 85, 99, 0.5) transparent',
      }}
    >
      {messages.map((message) => {
        const toolResults = new Map<
          string,
          { content: string; state: string; error?: string }
        >()
        for (const p of message.parts) {
          if (p.type === 'tool-result') {
            toolResults.set(p.toolCallId, {
              content: p.content,
              state: p.state,
              error: p.error,
            })
          }
        }

        return (
          <div
            key={message.id}
            className={`p-4 rounded-lg mb-2 ${
              message.role === 'assistant'
                ? 'bg-linear-to-r from-cyan-500/5 to-blue-600/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4">
              {message.role === 'assistant' ? (
                <div className="w-8 h-8 rounded-lg bg-linear-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  AI
                </div>
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  U
                </div>
              )}
              <div className="flex-1 min-w-0">
                {message.parts.map((part, index) => {
                  if (part.type === 'text' && part.content) {
                    return (
                      <div key={`text-${index}`} className="markdown-content">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[
                            rehypeRaw,
                            rehypeSanitize,
                            rehypeHighlight,
                          ]}
                        >
                          {part.content}
                        </ReactMarkdown>
                      </div>
                    )
                  }

                  if (
                    part.type === 'tool-call' &&
                    part.name === 'execute_typescript'
                  ) {
                    let code = ''
                    const parsedArgs = parsePartialJSON(part.arguments)
                    if (parsedArgs?.typescriptCode) {
                      code = parsedArgs.typescriptCode
                    }

                    const toolResult = toolResults.get(part.id)
                    const hasOutput =
                      part.output !== undefined || toolResult !== undefined

                    let parsedOutput = part.output
                    if (!parsedOutput && toolResult?.content) {
                      try {
                        parsedOutput = JSON.parse(toolResult.content)
                      } catch {
                        parsedOutput = { result: toolResult.content }
                      }
                    }

                    const isInputStreaming = part.state === 'input-streaming'
                    const isInputComplete = part.state === 'input-complete'
                    const isStillGenerating =
                      part.state === 'awaiting-input' || isInputStreaming
                    const isExecuting = isInputComplete && !hasOutput
                    const hasError =
                      parsedOutput?.success === false ||
                      toolResult?.error !== undefined

                    const codeStatus =
                      isStillGenerating || isExecuting
                        ? 'running'
                        : hasError
                          ? 'error'
                          : 'success'
                    const executionStatus = isExecuting
                      ? 'running'
                      : hasError
                        ? 'error'
                        : 'success'

                    const events = toolCallEvents.get(part.id) || []

                    return (
                      <div key={part.id} className="mt-3 space-y-2">
                        {!code && isStillGenerating ? (
                          <div className="rounded-lg border border-blue-700 bg-blue-900/30 overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3">
                              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                              <span className="text-blue-300 font-medium">
                                Generating code...
                              </span>
                            </div>
                          </div>
                        ) : (
                          <CodeBlock code={code} status={codeStatus} />
                        )}
                        {isInputComplete &&
                          (events.length > 0 || isExecuting) && (
                            <JavaScriptVM
                              events={events}
                              isExecuting={isExecuting}
                            />
                          )}
                        {isInputComplete && (
                          <ExecutionResult
                            status={executionStatus}
                            result={parsedOutput?.result}
                            error={
                              parsedOutput?.error?.message || toolResult?.error
                            }
                            logs={parsedOutput?.logs}
                          />
                        )}
                        {/* Render plots inline for this tool call */}
                        {plotsByToolCall.get(part.id)?.map((plot) => (
                          <PlotRenderer key={plot.plotId} plot={plot} />
                        ))}
                      </div>
                    )
                  }

                  if (part.type === 'tool-result') {
                    return null
                  }

                  return null
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
