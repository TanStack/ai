import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSummarize } from '@tanstack/ai-react'
import type { UseSummarizeReturn } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { summarizeFn, summarizeStreamFn } from '../lib/server-fns'
import type { StreamChunk } from '@tanstack/ai'

const SAMPLE_TEXT = `Artificial intelligence (AI) has rapidly transformed from a niche academic pursuit into one of the most influential technologies of the 21st century. The development of large language models, in particular, has demonstrated capabilities that were previously thought to be decades away. These models can generate human-like text, translate languages, write code, and even engage in complex reasoning tasks.

The implications of this technology are far-reaching. In healthcare, AI systems are being used to analyze medical images, predict patient outcomes, and accelerate drug discovery. In education, personalized learning systems adapt to individual student needs. In creative fields, AI tools are being used to generate art, music, and literature, raising profound questions about authorship and creativity.

However, the rapid advancement of AI also raises significant concerns. Issues of bias in training data, the environmental cost of training large models, the potential for misuse in generating disinformation, and the impact on employment are all active areas of debate. Researchers and policymakers are working to develop frameworks for responsible AI development that balance innovation with safety and ethical considerations.`

const MODELS: Array<{ value: string; label: string }> = [
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast, cheap)' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5.1', label: 'GPT-5.1' },
  { value: 'gpt-5.2', label: 'GPT-5.2 (frontier)' },
]

// Accumulate TEXT_MESSAGE_CONTENT deltas (or the absolute `content`) from a
// streaming chunk so we can render the summary token-by-token instead of
// waiting for the terminal `generation:result` event.
function consumeStreamingChunk(
  chunk: StreamChunk,
  prev: string,
): string | undefined {
  if (chunk.type !== 'TEXT_MESSAGE_CONTENT') return undefined
  const c = chunk as StreamChunk & { content?: string; delta?: string }
  if (typeof c.content === 'string' && c.content.length > 0) return c.content
  if (typeof c.delta === 'string' && c.delta.length > 0) return prev + c.delta
  return undefined
}

function StreamingSummarize() {
  const [text, setText] = useState('')
  const [style, setStyle] = useState<'concise' | 'bullet-points' | 'paragraph'>(
    'concise',
  )
  const [model, setModel] = useState<string>(MODELS[0].value)
  const [streamingText, setStreamingText] = useState('')

  // The connect adapter merges `body` into every request payload; the API
  // route reads `model` from `body.data` to pick the openaiSummarize variant.
  const hookReturn = useSummarize({
    connection: fetchServerSentEvents('/api/summarize'),
    body: { model },
    onChunk: (chunk) =>
      setStreamingText((prev) => consumeStreamingChunk(chunk, prev) ?? prev),
  })

  return (
    <SummarizeUI
      {...hookReturn}
      text={text}
      setText={setText}
      style={style}
      setStyle={setStyle}
      model={model}
      setModel={setModel}
      streamingText={streamingText}
      onBeforeGenerate={() => setStreamingText('')}
    />
  )
}

function DirectSummarize() {
  const [text, setText] = useState('')
  const [style, setStyle] = useState<'concise' | 'bullet-points' | 'paragraph'>(
    'concise',
  )
  const [model, setModel] = useState<string>(MODELS[0].value)

  // Fetcher path: GenerationClient passes `input` straight to the fetcher
  // (no `body` merge), so we inject `model` into the payload here. Direct
  // mode is non-streaming — the result appears all at once when the
  // server-fn resolves.
  const hookReturn = useSummarize({
    fetcher: (input) => summarizeFn({ data: { ...input, model } }),
  })

  return (
    <SummarizeUI
      {...hookReturn}
      text={text}
      setText={setText}
      style={style}
      setStyle={setStyle}
      model={model}
      setModel={setModel}
    />
  )
}

function ServerFnSummarize() {
  const [text, setText] = useState('')
  const [style, setStyle] = useState<'concise' | 'bullet-points' | 'paragraph'>(
    'concise',
  )
  const [model, setModel] = useState<string>(MODELS[0].value)
  const [streamingText, setStreamingText] = useState('')

  // The server-fn returns an SSE Response; GenerationClient parses it and
  // routes chunks through `onChunk` exactly like the connect-adapter path.
  const hookReturn = useSummarize({
    fetcher: (input) => summarizeStreamFn({ data: { ...input, model } }),
    onChunk: (chunk) =>
      setStreamingText((prev) => consumeStreamingChunk(chunk, prev) ?? prev),
  })

  return (
    <SummarizeUI
      {...hookReturn}
      text={text}
      setText={setText}
      style={style}
      setStyle={setStyle}
      model={model}
      setModel={setModel}
      streamingText={streamingText}
      onBeforeGenerate={() => setStreamingText('')}
    />
  )
}

function SummarizeUI({
  text,
  setText,
  style,
  setStyle,
  model,
  setModel,
  streamingText,
  onBeforeGenerate,
  generate,
  result,
  isLoading,
  error,
  reset,
}: UseSummarizeReturn & {
  text: string
  setText: (v: string) => void
  style: 'concise' | 'bullet-points' | 'paragraph'
  setStyle: (v: 'concise' | 'bullet-points' | 'paragraph') => void
  model: string
  setModel: (v: string) => void
  /** Token-by-token accumulated text from streaming chunks (undefined in
   *  direct/non-streaming mode). */
  streamingText?: string
  /** Called just before `generate()` so streaming variants can clear local
   *  accumulator state. */
  onBeforeGenerate?: () => void
}) {
  const handleSummarize = () => {
    if (!text.trim()) return
    onBeforeGenerate?.()
    // Intentionally no `maxLength` — for the OpenAI Responses API,
    // `maxLength` is mapped to `max_output_tokens`, which on GPT-5.x
    // reasoning models is the budget for BOTH hidden reasoning AND visible
    // output. A tight cap (e.g. 200) gets the whole budget consumed by
    // reasoning, leaving the response truncated with `finishReason: 'length'`
    // and no visible summary. The selected `style` already drives length.
    generate({ text: text.trim(), style })
  }

  // Prefer the live streaming text while generating, fall back to the final
  // result once the run completes. Direct mode never has streamingText so it
  // jumps straight to result.
  const displaySummary = streamingText || result?.summary || ''

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm text-gray-400">Text to Summarize</label>
          <button
            onClick={() => setText(SAMPLE_TEXT)}
            className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
          >
            Use sample text
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type text to summarize..."
          className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
          rows={8}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm text-gray-400">Model</label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
        >
          {MODELS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <label className="text-sm text-gray-400">Style</label>
        <div className="flex flex-wrap gap-2">
          {(['concise', 'bullet-points', 'paragraph'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                style === s
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSummarize}
          disabled={!text.trim() || isLoading}
          className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? 'Summarizing...' : 'Summarize'}
        </button>
        {result && (
          <button
            onClick={reset}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      {displaySummary && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
          <p className="text-sm text-gray-400 mb-3">
            Summary
            {isLoading && streamingText && (
              <span className="ml-2 text-orange-400 animate-pulse">
                streaming…
              </span>
            )}
          </p>
          <p className="text-white whitespace-pre-wrap">{displaySummary}</p>
        </div>
      )}
    </div>
  )
}

function SummarizePage() {
  const [mode, setMode] = useState<'streaming' | 'direct' | 'server-fn'>(
    'streaming',
  )

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Text Summarization</h2>
            <p className="text-sm text-gray-400 mt-1">
              Summarize text using OpenAI models
            </p>
          </div>
          <div className="flex gap-1 bg-gray-900/50 rounded-lg p-1">
            <button
              onClick={() => setMode('streaming')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'streaming'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Streaming
            </button>
            <button
              onClick={() => setMode('direct')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'direct'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Direct
            </button>
            <button
              onClick={() => setMode('server-fn')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'server-fn'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Server Fn
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {mode === 'streaming' ? (
            <StreamingSummarize key="streaming" />
          ) : mode === 'direct' ? (
            <DirectSummarize key="direct" />
          ) : (
            <ServerFnSummarize key="server-fn" />
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/summarize')({
  component: SummarizePage,
})
