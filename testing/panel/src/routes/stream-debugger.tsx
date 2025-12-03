import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  FastForward,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Upload,
} from 'lucide-react'
import { StreamProcessor, uiMessageToModelMessages } from '@tanstack/ai'

import type {
  ChunkRecording,
  ProcessorResult,
  StreamChunk,
  UIMessage,
} from '@tanstack/ai'

// Import sample traces
import * as sampleTraces from '@/traces'

export const Route = createFileRoute('/stream-debugger')({
  component: TestPanel,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      trace: (search.trace as string) || undefined,
    }
  },
})

interface RecordedTrace {
  id: string
  filename: string
  timestamp: string
  provider: string
  model: string
  size: number
  chunkCount: number
}

function TestPanel() {
  const searchParams = useSearch({ from: '/stream-debugger' })
  const [recording, setRecording] = useState<ChunkRecording | null>(null)
  const [currentChunkIndex, setCurrentChunkIndex] = useState(-1)
  const [uiMessage, setUIMessage] = useState<UIMessage | null>(null)
  const [result, setResult] = useState<ProcessorResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedSample, setSelectedSample] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [recordedTraces, setRecordedTraces] = useState<Array<RecordedTrace>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Processor ref for step-through mode
  const processorRef = useRef<StreamProcessor | null>(null)

  const sampleOptions = useMemo(() => Object.keys(sampleTraces), [])

  // Function to fetch recorded traces
  const fetchRecordedTraces = useCallback(() => {
    fetch('/api/list-traces')
      .then((res) => res.json())
      .then((data) => {
        if (data.traces) {
          setRecordedTraces(data.traces)
        }
      })
      .catch((error) => {
        console.error('[TestPanel] Failed to load trace list:', error)
      })
  }, [])

  // Fetch recorded traces on mount
  useEffect(() => {
    fetchRecordedTraces()
  }, [fetchRecordedTraces])

  const resetState = useCallback(() => {
    setCurrentChunkIndex(-1)
    setUIMessage(null)
    setResult(null)
    processorRef.current = null
  }, [])

  const createProcessor = useCallback(() => {
    const processor = new StreamProcessor({
      events: {
        onMessagesChange: (messages: Array<UIMessage>) => {
          // Get the assistant message (should be the last one)
          const assistantMessage = messages.find((m) => m.role === 'assistant')
          if (assistantMessage) {
            setUIMessage(assistantMessage)
          }
        },
        onStreamEnd: (message: UIMessage) => {
          // Get text content from parts
          const textParts = message.parts.filter((p) => p.type === 'text')
          const content = textParts.map((p) => (p as any).content).join('')

          // Get tool calls from parts
          const toolCallParts = message.parts.filter(
            (p) => p.type === 'tool-call',
          )
          const toolCalls =
            toolCallParts.length > 0
              ? toolCallParts.map((p: any) => ({
                  id: p.id,
                  type: 'function' as const,
                  function: {
                    name: p.name,
                    arguments: p.arguments,
                  },
                }))
              : undefined

          setResult({
            content,
            toolCalls,
            finishReason: null,
          })
        },
      },
    })

    // Start an assistant message using the new API
    processor.startAssistantMessage()

    processorRef.current = processor
    return processor
  }, [])

  const loadRecording = useCallback(
    (rec: ChunkRecording) => {
      setRecording(rec)
      resetState()
    },
    [resetState],
  )

  const handleFileUpload = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string) as ChunkRecording
          loadRecording(data)
          setSelectedSample('')
        } catch (err) {
          console.error('Failed to parse JSON:', err)
          alert('Invalid JSON file')
        }
      }
      reader.readAsText(file)
    },
    [loadRecording],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && file.type === 'application/json') {
        handleFileUpload(file)
      }
    },
    [handleFileUpload],
  )

  const handleSampleSelect = useCallback(
    (value: string) => {
      setSelectedSample(value)

      if (!value) return

      // Check if it's a recorded trace (trace:id) or sample trace (sample:name)
      if (value.startsWith('trace:')) {
        const traceId = value.substring(6) // Remove "trace:" prefix

        // Load the trace from API
        fetch(`/api/load-trace?id=${traceId}`)
          .then((res) => {
            if (!res.ok) {
              throw new Error(`Failed to load trace: ${res.statusText}`)
            }
            return res.json()
          })
          .then((traceData) => {
            const chunkRecording: ChunkRecording = {
              id: traceData.id,
              timestamp: traceData.timestamp,
              metadata: {
                provider: traceData.provider,
                model: traceData.model,
                messages: traceData.messages,
              },
              chunks: traceData.chunks,
            }
            loadRecording(chunkRecording)
          })
          .catch((error) => {
            console.error('[TestPanel] Failed to load trace:', error)
            alert(`Failed to load trace: ${error.message}`)
          })
      } else if (value.startsWith('sample:')) {
        const sampleName = value.substring(7) // Remove "sample:" prefix
        if (sampleTraces[sampleName as keyof typeof sampleTraces]) {
          loadRecording(
            sampleTraces[
              sampleName as keyof typeof sampleTraces
            ] as ChunkRecording,
          )
        }
      }
    },
    [loadRecording],
  )

  const stepForward = useCallback(() => {
    if (!recording) return

    const nextIndex = currentChunkIndex + 1
    if (nextIndex >= recording.chunks.length) return

    if (!processorRef.current) {
      createProcessor()
    }

    const chunk = recording.chunks[nextIndex]?.chunk
    if (chunk) {
      processorRef.current?.processChunk(chunk)
      setCurrentChunkIndex(nextIndex)

      // Update result with current processor state
      const state = processorRef.current.getState()

      // Convert toolCalls Map to array
      const toolCallsArray = Array.from(state.toolCalls.values()).map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      }))

      setResult({
        content: state.content,
        toolCalls: toolCallsArray.length > 0 ? toolCallsArray : undefined,
        finishReason: null,
      })
    }
  }, [recording, currentChunkIndex, createProcessor])

  const stepBackward = useCallback(() => {
    if (!recording || currentChunkIndex < 0) return

    // Replay from start to currentChunkIndex - 1
    const targetIndex = currentChunkIndex - 1
    resetState()

    if (targetIndex < 0) return

    const processor = createProcessor()
    for (let i = 0; i <= targetIndex; i++) {
      const chunk = recording.chunks[i]?.chunk
      if (chunk) {
        processor.processChunk(chunk)
      }
    }
    setCurrentChunkIndex(targetIndex)

    // Update result with current processor state
    const state = processor.getState()

    // Convert toolCalls Map to array
    const toolCallsArray = Array.from(state.toolCalls.values()).map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: tc.arguments,
      },
    }))

    setResult({
      content: state.content,
      toolCalls: toolCallsArray.length > 0 ? toolCallsArray : undefined,
      finishReason: null,
    })
  }, [recording, currentChunkIndex, createProcessor, resetState])

  const runAll = useCallback(async () => {
    if (!recording) return

    resetState()
    const processor = createProcessor()

    for (let i = 0; i < recording.chunks.length; i++) {
      const chunk = recording.chunks[i]?.chunk
      if (chunk) {
        processor.processChunk(chunk)
        setCurrentChunkIndex(i)

        // Update result with current processor state
        const state = processor.getState()

        // Convert toolCalls Map to array
        const toolCallsArray = Array.from(state.toolCalls.values()).map(
          (tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }),
        )

        setResult({
          content: state.content,
          toolCalls: toolCallsArray.length > 0 ? toolCallsArray : undefined,
          finishReason: null,
        })

        // Small delay for visual effect
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
  }, [recording, createProcessor, resetState])

  const reset = useCallback(() => {
    resetState()
  }, [resetState])

  const copyForIDE = useCallback(() => {
    if (!recording) return

    const report = {
      sample: selectedSample || 'custom',
      currentChunkIndex,
      totalChunks: recording.chunks.length,
      chunks: recording.chunks
        .slice(0, currentChunkIndex + 1)
        .map(({ chunk, index }) => ({
          index,
          type: chunk.type,
          chunk,
        })),
      uiMessage,
      modelMessage: uiMessage ? convertToModelMessage(uiMessage) : null,
      processorState: processorRef.current?.getState(),
    }

    const formatted = `## Stream Processing Debug Report

**Sample:** ${report.sample}
**Progress:** ${currentChunkIndex + 1}/${report.totalChunks} chunks processed

### Chunks Processed
\`\`\`json
${JSON.stringify(report.chunks, null, 2)}
\`\`\`

### UIMessage (Parsed)
\`\`\`json
${JSON.stringify(report.uiMessage, null, 2)}
\`\`\`

### ModelMessage (for server)
\`\`\`json
${JSON.stringify(report.modelMessage, null, 2)}
\`\`\`

### Raw Processor State
\`\`\`json
${JSON.stringify(report.processorState, null, 2)}
\`\`\`
`

    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [recording, selectedSample, currentChunkIndex, uiMessage, result])

  // Load trace from query param
  useEffect(() => {
    if (searchParams.trace) {
      // Reset state first
      setCurrentChunkIndex(-1)
      setUIMessage(null)
      setResult(null)
      processorRef.current = null

      // Set the dropdown to show this trace
      setSelectedSample(`trace:${searchParams.trace}`)

      // Then load the trace
      fetch(`/api/load-trace?id=${searchParams.trace}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to load trace: ${res.statusText}`)
          }
          return res.json()
        })
        .then((traceData) => {
          // Convert trace data to ChunkRecording format
          const chunkRecording: ChunkRecording = {
            id: traceData.id,
            timestamp: traceData.timestamp,
            metadata: {
              provider: traceData.provider,
              model: traceData.model,
              messages: traceData.messages,
            },
            chunks: traceData.chunks,
          }
          setRecording(chunkRecording)
        })
        .catch((error) => {
          console.error('[TestPanel] Failed to load trace:', error)
          alert(`Failed to load trace: ${error.message}`)
        })
    }
  }, [searchParams.trace])

  return (
    <div className="p-6 flex flex-col gap-6 h-[calc(100vh-88px)] bg-gray-900">
      {/* Controls Row */}
      <div className="flex gap-4 items-center">
        {/* File Upload / Drop Zone */}
        <div
          className={`flex-1 border-2 border-dashed rounded-lg p-4 transition-all cursor-pointer
            ${
              isDragging
                ? 'border-orange-500 bg-orange-500/20'
                : 'border-gray-700 hover:border-gray-500'
            }`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex items-center gap-3 text-gray-400">
            <Upload className="w-5 h-5" />
            <span>Drop trace JSON file or click to upload</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) =>
              e.target.files?.[0] && handleFileUpload(e.target.files[0])
            }
          />
        </div>

        {/* Sample Selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Load Trace:</label>
          <select
            value={selectedSample}
            onChange={(e) => handleSampleSelect(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white min-w-[280px] focus:outline-none focus:ring-2 focus:ring-orange-500/50 hover:border-gray-600 transition-colors"
          >
            <option value="">Select a trace...</option>
            {recordedTraces.length > 0 && (
              <optgroup label="Recorded Traces">
                {recordedTraces.map((trace) => (
                  <option key={trace.id} value={`trace:${trace.id}`}>
                    {trace.id} - {trace.provider}/{trace.model} (
                    {trace.chunkCount} chunks)
                  </option>
                ))}
              </optgroup>
            )}
            {sampleOptions.length > 0 && (
              <optgroup label="Sample Traces">
                {sampleOptions.map((name) => (
                  <option key={name} value={`sample:${name}`}>
                    {name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button
            onClick={fetchRecordedTraces}
            className="p-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-white transition-colors"
            title="Refresh trace list"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Copy For IDE Button */}
        <button
          onClick={copyForIDE}
          disabled={!recording || currentChunkIndex < 0}
          className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>Copy For IDE</span>
            </>
          )}
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
        {/* Left Panel - Raw Chunks */}
        <div className="flex flex-col bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-white">
              Raw Chunks {recording && `(${recording.chunks.length})`}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={stepBackward}
                disabled={!recording || currentChunkIndex < 0}
                className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors"
                title="Step Back"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={stepForward}
                disabled={
                  !recording ||
                  currentChunkIndex >= (recording?.chunks.length ?? 0) - 1
                }
                className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors"
                title="Step Forward"
              >
                <SkipForward className="w-4 h-4" />
              </button>
              <button
                onClick={runAll}
                disabled={!recording}
                className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors"
                title="Run All"
              >
                <FastForward className="w-4 h-4" />
              </button>
              <button
                onClick={reset}
                disabled={!recording}
                className="p-2 rounded-lg hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300 hover:text-white transition-colors"
                title="Reset"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 scrollbar-thin">
            {recording ? (
              <div className="space-y-2">
                {recording.chunks.map(({ chunk }, arrayIndex) => (
                  <ChunkItem
                    key={arrayIndex}
                    chunk={chunk}
                    index={arrayIndex}
                    isActive={arrayIndex === currentChunkIndex}
                    isProcessed={arrayIndex <= currentChunkIndex}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-12">
                Load a trace file to see chunks
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Parsed Output */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* UIMessage */}
          <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700">
              <h2 className="font-semibold text-white">UIMessage (Parsed)</h2>
            </div>
            <div className="flex-1 overflow-auto p-4 scrollbar-thin">
              {uiMessage ? (
                <JsonView data={uiMessage} />
              ) : (
                <div className="text-center text-gray-500 py-12">
                  Process chunks to see UIMessage
                </div>
              )}
            </div>
          </div>

          {/* ModelMessage */}
          <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700">
              <h2 className="font-semibold text-white">
                ModelMessage (for server)
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4 scrollbar-thin">
              {uiMessage ? (
                <JsonView data={convertToModelMessage(uiMessage)} />
              ) : (
                <div className="text-center text-gray-500 py-12">
                  Process chunks to see ModelMessage
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChunkItem({
  chunk,
  index,
  isActive,
  isProcessed,
}: {
  chunk: StreamChunk
  index: number
  isActive: boolean
  isProcessed: boolean
}) {
  const typeColors: Record<string, string> = {
    content: 'text-green-400',
    tool_call: 'text-blue-400',
    tool_result: 'text-purple-400',
    done: 'text-yellow-400',
    error: 'text-red-400',
    thinking: 'text-cyan-400',
    'approval-requested': 'text-orange-400',
    'tool-input-available': 'text-pink-400',
  }

  const getSummary = (chunk: StreamChunk): string => {
    switch (chunk.type) {
      case 'content':
        return `δ="${chunk.delta?.slice(0, 30) ?? ''}${(chunk.delta?.length ?? 0) > 30 ? '...' : ''}"`
      case 'tool_call':
        return `${chunk.toolCall.function.name}[${chunk.index}]`
      case 'tool_result':
        return `${chunk.toolCallId}`
      case 'done':
        return `${chunk.finishReason}`
      case 'thinking':
        return `δ="${chunk.delta?.slice(0, 20) ?? ''}..."`
      case 'error':
        return chunk.error.message.slice(0, 30)
      default:
        return ''
    }
  }

  return (
    <div
      className={`p-2 rounded-lg text-sm font-mono transition-all ${
        isActive
          ? 'bg-orange-500/20 border border-orange-500'
          : isProcessed
            ? 'bg-gray-700 opacity-60'
            : 'bg-gray-900'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-gray-500 w-6">{index}</span>
        <span className={typeColors[chunk.type] || 'text-gray-400'}>
          {chunk.type}
        </span>
        <span className="text-gray-400 truncate">{getSummary(chunk)}</span>
      </div>
    </div>
  )
}

function JsonView({ data }: { data: any }) {
  const formatValue = (value: any, indent: number = 0): React.ReactNode => {
    const spaces = '  '.repeat(indent)

    if (value === null) {
      return <span className="json-null">null</span>
    }
    if (typeof value === 'boolean') {
      return <span className="json-boolean">{String(value)}</span>
    }
    if (typeof value === 'number') {
      return <span className="json-number">{value}</span>
    }
    if (typeof value === 'string') {
      const escaped = value.replace(/"/g, '\\"').replace(/\n/g, '\\n')
      return <span className="json-string">"{escaped}"</span>
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]'
      return (
        <>
          {'[\n'}
          {value.map((item, i) => (
            <span key={i}>
              {spaces} {formatValue(item, indent + 1)}
              {i < value.length - 1 ? ',' : ''}
              {'\n'}
            </span>
          ))}
          {spaces}]
        </>
      )
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value)
      if (keys.length === 0) return '{}'
      return (
        <>
          {'{\n'}
          {keys.map((key, i) => (
            <span key={key}>
              {spaces} <span className="json-key">"{key}"</span>:{' '}
              {formatValue(value[key], indent + 1)}
              {i < keys.length - 1 ? ',' : ''}
              {'\n'}
            </span>
          ))}
          {spaces}
          {'}'}
        </>
      )
    }
    return String(value)
  }

  return (
    <pre className="text-sm whitespace-pre-wrap break-all text-gray-100 font-mono">
      {formatValue(data)}
    </pre>
  )
}

function convertToModelMessage(uiMessage: UIMessage): any {
  // Use the actual uiMessageToModelMessages utility from @tanstack/ai-client
  const modelMessages = uiMessageToModelMessages(uiMessage)
  // Return the first message (the assistant message)
  return modelMessages[0] || null
}
