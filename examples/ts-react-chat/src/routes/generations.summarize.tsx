import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useSummarize } from '@tanstack/ai-react'
import type { UseSummarizeReturn } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { summarizeFn, summarizeStreamFn } from '../lib/server-fns'

const SAMPLE_TEXT = `Artificial intelligence (AI) has rapidly transformed from a niche academic pursuit into one of the most influential technologies of the 21st century. The development of large language models, in particular, has demonstrated capabilities that were previously thought to be decades away. These models can generate human-like text, translate languages, write code, and even engage in complex reasoning tasks.

The implications of this technology are far-reaching. In healthcare, AI systems are being used to analyze medical images, predict patient outcomes, and accelerate drug discovery. In education, personalized learning systems adapt to individual student needs. In creative fields, AI tools are being used to generate art, music, and literature, raising profound questions about authorship and creativity.

However, the rapid advancement of AI also raises significant concerns. Issues of bias in training data, the environmental cost of training large models, the potential for misuse in generating disinformation, and the impact on employment are all active areas of debate. Researchers and policymakers are working to develop frameworks for responsible AI development that balance innovation with safety and ethical considerations.`

function StreamingSummarize() {
  const [text, setText] = useState('')
  const [style, setStyle] = useState<'concise' | 'bullet-points' | 'paragraph'>(
    'concise',
  )

  const hookReturn = useSummarize({
    connection: fetchServerSentEvents('/api/summarize'),
  })

  return (
    <SummarizeUI
      {...hookReturn}
      text={text}
      setText={setText}
      style={style}
      setStyle={setStyle}
    />
  )
}

function DirectSummarize() {
  const [text, setText] = useState('')
  const [style, setStyle] = useState<'concise' | 'bullet-points' | 'paragraph'>(
    'concise',
  )

  const hookReturn = useSummarize({
    fetcher: (input) => summarizeFn({ data: input }),
  })

  return (
    <SummarizeUI
      {...hookReturn}
      text={text}
      setText={setText}
      style={style}
      setStyle={setStyle}
    />
  )
}

function ServerFnSummarize() {
  const [text, setText] = useState('')
  const [style, setStyle] = useState<'concise' | 'bullet-points' | 'paragraph'>(
    'concise',
  )

  const hookReturn = useSummarize({
    fetcher: (input) => summarizeStreamFn({ data: input }),
  })

  return (
    <SummarizeUI
      {...hookReturn}
      text={text}
      setText={setText}
      style={style}
      setStyle={setStyle}
    />
  )
}

function SummarizeUI({
  text,
  setText,
  style,
  setStyle,
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
}) {
  const handleSummarize = () => {
    if (!text.trim()) return
    generate({ text: text.trim(), style, maxLength: 200 })
  }

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

      {result && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
          <p className="text-sm text-gray-400 mb-3">Summary</p>
          <p className="text-white whitespace-pre-wrap">{result.summary}</p>
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
