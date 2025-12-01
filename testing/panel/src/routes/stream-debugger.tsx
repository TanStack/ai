import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Check,
  Copy,
  FastForward,
  RotateCcw,
  SkipBack,
  SkipForward,
  Upload,
} from 'lucide-react'
import { StreamProcessor } from '@tanstack/ai'

import type {
  ChunkRecording,
  ProcessorResult,
  StreamChunk,
  ToolCallState,
  ToolResultState,
} from '@tanstack/ai'

// Import sample traces
import * as sampleTraces from '@/traces'

export const Route = createFileRoute('/stream-debugger')({
  component: TestPanel,
})

interface UIMessagePart {
  type: 'text' | 'tool-call' | 'tool-result' | 'thinking'
  content?: string
  id?: string
  name?: string
  arguments?: string
  state?: ToolCallState | ToolResultState
  toolCallId?: string
}
interface UIMessage {
  role: 'assistant'
  parts: Array<UIMessagePart>
}

function TestPanel() {
  const [recording, setRecording] = useState<ChunkRecording | null>(null)
  const [currentChunkIndex, setCurrentChunkIndex] = useState(-1)
  const [uiMessage, setUIMessage] = useState<UIMessage | null>(null)
  const [result, setResult] = useState<ProcessorResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedSample, setSelectedSample] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Processor ref for step-through mode
  const processorRef = useRef<StreamProcessor | null>(null)
  const partsRef = useRef<UIMessagePart[]>([])

  const sampleOptions = useMemo(() => Object.keys(sampleTraces), [])

  const resetState = useCallback(() => {
    setCurrentChunkIndex(-1)
    setUIMessage(null)
    setResult(null)
    partsRef.current = []
    processorRef.current = null
  }, [])

  const createProcessor = useCallback(() => {
    partsRef.current = []

    const processor = new StreamProcessor({
      handlers: {
        onTextUpdate: (content) => {
          // Find or create text part
          const textPartIndex = partsRef.current.findIndex(
            (p) => p.type === 'text',
          )
          if (textPartIndex >= 0) {
            partsRef.current[textPartIndex] = { type: 'text', content }
          } else {
            partsRef.current.push({ type: 'text', content })
          }
          setUIMessage({ role: 'assistant', parts: [...partsRef.current] })
        },
        onThinkingUpdate: (content) => {
          const thinkingPartIndex = partsRef.current.findIndex(
            (p) => p.type === 'thinking',
          )
          if (thinkingPartIndex >= 0) {
            partsRef.current[thinkingPartIndex] = { type: 'thinking', content }
          } else {
            // Insert thinking before text
            partsRef.current.unshift({ type: 'thinking', content })
          }
          setUIMessage({ role: 'assistant', parts: [...partsRef.current] })
        },
        onToolCallStateChange: (_index, id, name, state, args) => {
          const toolCallIndex = partsRef.current.findIndex(
            (p) => p.type === 'tool-call' && p.id === id,
          )
          const toolCallPart: UIMessagePart = {
            type: 'tool-call',
            id,
            name,
            arguments: args,
            state,
          }
          if (toolCallIndex >= 0) {
            partsRef.current[toolCallIndex] = toolCallPart
          } else {
            partsRef.current.push(toolCallPart)
          }
          setUIMessage({ role: 'assistant', parts: [...partsRef.current] })
        },
        onToolResultStateChange: (toolCallId, content, state) => {
          const toolResultIndex = partsRef.current.findIndex(
            (p) => p.type === 'tool-result' && p.toolCallId === toolCallId,
          )
          const toolResultPart: UIMessagePart = {
            type: 'tool-result',
            toolCallId,
            content,
            state,
          }
          if (toolResultIndex >= 0) {
            partsRef.current[toolResultIndex] = toolResultPart
          } else {
            partsRef.current.push(toolResultPart)
          }
          setUIMessage({ role: 'assistant', parts: [...partsRef.current] })
        },
        onStreamEnd: (content, toolCalls) => {
          setResult({
            content,
            toolCalls,
            finishReason: null,
          })
        },
      },
    })

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
    (name: string) => {
      setSelectedSample(name)
      if (name && sampleTraces[name as keyof typeof sampleTraces]) {
        loadRecording(
          sampleTraces[name as keyof typeof sampleTraces] as ChunkRecording,
        )
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
        content: state.textContent,
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
      content: state.textContent,
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
          content: state.textContent,
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
      modelMessage: result ? convertToModelMessage(result) : null,
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

  return (
    <div className="p-6 flex flex-col gap-6 h-[calc(100vh-88px)]">
      {/* Controls Row */}
      <div className="flex gap-4 items-center">
        {/* File Upload / Drop Zone */}
        <div
          className={`flex-1 border-2 border-dashed rounded-lg p-4 transition-all cursor-pointer
            ${
              isDragging
                ? 'border-[var(--accent)] bg-[var(--accent-dim)] drop-zone-active'
                : 'border-[var(--border-color)] hover:border-[var(--text-muted)]'
            }`}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex items-center gap-3 text-[var(--text-secondary)]">
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
          <label className="text-sm text-[var(--text-muted)]">Sample:</label>
          <select
            value={selectedSample}
            onChange={(e) => handleSampleSelect(e.target.value)}
            className="bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm text-[var(--text-primary)] min-w-[200px]"
          >
            <option value="">Select a sample...</option>
            {sampleOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* Copy For IDE Button */}
        <button
          onClick={copyForIDE}
          disabled={!recording || currentChunkIndex < 0}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
        <div className="flex flex-col bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between">
            <h2 className="font-semibold text-[var(--text-primary)]">
              Raw Chunks {recording && `(${recording.chunks.length})`}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={stepBackward}
                disabled={!recording || currentChunkIndex < 0}
                className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed"
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
                className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed"
                title="Step Forward"
              >
                <SkipForward className="w-4 h-4" />
              </button>
              <button
                onClick={runAll}
                disabled={!recording}
                className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed"
                title="Run All"
              >
                <FastForward className="w-4 h-4" />
              </button>
              <button
                onClick={reset}
                disabled={!recording}
                className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:cursor-not-allowed"
                title="Reset"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {recording ? (
              <div className="space-y-2">
                {recording.chunks.map(({ chunk, index }) => (
                  <ChunkItem
                    key={index}
                    chunk={chunk}
                    index={index}
                    isActive={index === currentChunkIndex}
                    isProcessed={index <= currentChunkIndex}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center text-[var(--text-muted)] py-12">
                Load a trace file to see chunks
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Parsed Output */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* UIMessage */}
          <div className="flex-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--border-color)]">
              <h2 className="font-semibold text-[var(--text-primary)]">
                UIMessage (Parsed)
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {uiMessage ? (
                <JsonView data={uiMessage} />
              ) : (
                <div className="text-center text-[var(--text-muted)] py-12">
                  Process chunks to see UIMessage
                </div>
              )}
            </div>
          </div>

          {/* ModelMessage */}
          <div className="flex-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-[var(--border-color)]">
              <h2 className="font-semibold text-[var(--text-primary)]">
                ModelMessage (for server)
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {result ? (
                <JsonView data={convertToModelMessage(result)} />
              ) : (
                <div className="text-center text-[var(--text-muted)] py-12">
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
      className={`p-2 rounded text-sm font-mono transition-all ${
        isActive
          ? 'bg-[var(--accent-dim)] border border-[var(--accent)]'
          : isProcessed
            ? 'bg-[var(--bg-tertiary)] opacity-60'
            : 'bg-[var(--bg-primary)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[var(--text-muted)] w-6">{index}</span>
        <span className={typeColors[chunk.type] || 'text-gray-400'}>
          {chunk.type}
        </span>
        <span className="text-[var(--text-secondary)] truncate">
          {getSummary(chunk)}
        </span>
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
    <pre className="text-sm whitespace-pre-wrap break-all">
      {formatValue(data)}
    </pre>
  )
}

function convertToModelMessage(result: ProcessorResult): any {
  const message: any = {
    role: 'assistant',
    content: result.content || null,
  }

  if (result.toolCalls && result.toolCalls.length > 0) {
    message.toolCalls = result.toolCalls
  }

  return message
}
