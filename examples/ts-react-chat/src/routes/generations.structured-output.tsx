import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { parsePartialJSON } from '@tanstack/ai'

const SAMPLE_PROMPT =
  'I play indie rock and have a $1500 budget. Recommend two electric guitars and one acoustic to round out my rig.'

type Provider =
  | 'openai'
  | 'openai-chat'
  | 'grok'
  | 'groq'
  | 'openrouter'
  | 'openrouter-responses'

const PROVIDER_MODELS: Record<
  Provider,
  Array<{ value: string; label: string }>
> = {
  openai: [
    { value: 'gpt-5.2', label: 'GPT-5.2 (frontier)' },
    { value: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
    { value: 'gpt-5.1', label: 'GPT-5.1' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
  ],
  // OpenAI Chat Completions: same model surface, older `/v1/chat/completions`
  // wire format. The reasoning-summary opt-in isn't available here, so
  // streaming reasoning won't be surfaced for gpt-5.x even though the model
  // is still doing it under the hood.
  'openai-chat': [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5.1', label: 'GPT-5.1' },
    { value: 'gpt-5.2', label: 'GPT-5.2 (frontier)' },
  ],
  grok: [
    { value: 'grok-4-1-fast-reasoning', label: 'Grok 4.1 Fast (reasoning)' },
    {
      value: 'grok-4-1-fast-non-reasoning',
      label: 'Grok 4.1 Fast (non-reasoning)',
    },
    { value: 'grok-4', label: 'Grok 4' },
    { value: 'grok-3', label: 'Grok 3' },
  ],
  groq: [
    {
      value: 'meta-llama/llama-4-maverick-17b-128e-instruct',
      label: 'Llama 4 Maverick 17B',
    },
    {
      value: 'meta-llama/llama-4-scout-17b-16e-instruct',
      label: 'Llama 4 Scout 17B',
    },
    {
      value: 'moonshotai/kimi-k2-instruct-0905',
      label: 'Kimi K2 Instruct',
    },
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
    { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
  ],
  openrouter: [
    { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
    { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { value: 'openai/gpt-5.2', label: 'GPT-5.2 (via OpenRouter)' },
    { value: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast (via OpenRouter)' },
  ],
  // OpenRouter Responses (beta) endpoint — same upstream models, but the
  // request/response uses the Responses API wire format. Useful to compare
  // streaming behaviour against the chat-completions adapter above.
  'openrouter-responses': [
    { value: 'anthropic/claude-opus-4.6', label: 'Claude Opus 4.6' },
    { value: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { value: 'openai/gpt-5.2', label: 'GPT-5.2 (via OpenRouter)' },
    { value: 'x-ai/grok-4.1-fast', label: 'Grok 4.1 Fast (via OpenRouter)' },
  ],
}

interface PartialRecommendation {
  name?: string
  brand?: string
  type?: 'acoustic' | 'electric' | 'bass' | 'classical' | string
  priceRangeUsd?: { min?: number; max?: number }
  reason?: string
}

interface PartialResult {
  title?: string
  summary?: string
  recommendations?: Array<PartialRecommendation>
  nextSteps?: Array<string>
}

interface StreamChunkPayload {
  type: string
  delta?: string
  content?: string
  name?: string
  value?: { object?: unknown; raw?: string; reasoning?: string }
  message?: string
}

// Pick the last meaningful sentence/line out of an accumulating reasoning
// stream so the UI can render a single rolling line of "what it's thinking
// right now" rather than a growing wall of text.
function latestThought(reasoning: string): string {
  const trimmed = reasoning.trimEnd()
  if (!trimmed) return ''
  // Prefer the last sentence; fall back to the last newline-delimited line.
  const sentenceMatch = trimmed.match(/[^.!?\n]+[.!?]?\s*$/)
  const candidate = sentenceMatch ? sentenceMatch[0] : trimmed
  const last = candidate.split('\n').filter(Boolean).pop() ?? candidate
  return last.trim()
}

function StructuredOutputPage() {
  const providerId = 'structured-output-provider'
  const modelId = 'structured-output-model'
  const promptId = 'structured-output-prompt'
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT)
  const [provider, setProvider] = useState<Provider>('openai')
  const [model, setModel] = useState<string>(PROVIDER_MODELS.openai[0].value)
  const [stream, setStream] = useState(true)
  const [result, setResult] = useState<PartialResult | null>(null)
  const [rawJson, setRawJson] = useState<string>('')
  const [deltaCount, setDeltaCount] = useState(0)
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasFinalResult, setHasFinalResult] = useState(false)
  const [reasoningLine, setReasoningLine] = useState<string>('')
  const [reasoningFull, setReasoningFull] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const onProviderChange = (next: Provider) => {
    setProvider(next)
    setModel(PROVIDER_MODELS[next][0].value)
  }

  const reset = () => {
    setResult(null)
    setRawJson('')
    setDeltaCount(0)
    setHasFinalResult(false)
    setReasoningLine('')
    setReasoningFull('')
    setError(null)
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setIsLoading(true)
    reset()
    setIsStreaming(stream)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/structured-output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          provider,
          model,
          stream,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}))
        throw new Error(
          errPayload.error || `Request failed (${response.status})`,
        )
      }

      if (!stream) {
        const payload = await response.json()
        setResult(payload.data as PartialResult)
        setHasFinalResult(true)
        return
      }

      // Streaming path — parse SSE, accumulate raw JSON, render the partially
      // parsed object live, snap to the validated terminal payload.
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let reasoning = ''
      let deltas = 0
      let sawComplete = false

      const processBuffer = () => {
        let sepIdx = buffer.indexOf('\n\n')
        while (sepIdx !== -1) {
          const frame = buffer.slice(0, sepIdx)
          buffer = buffer.slice(sepIdx + 2)
          sepIdx = buffer.indexOf('\n\n')

          for (const line of frame.split('\n')) {
            if (!line.startsWith('data: ')) continue
            const json = line.slice(6).trim()
            if (!json) continue
            let chunk: StreamChunkPayload
            try {
              chunk = JSON.parse(json) as StreamChunkPayload
            } catch {
              continue
            }

            if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
              accumulated += chunk.delta
              deltas += 1
              setRawJson(accumulated)
              setDeltaCount(deltas)
              // partial-json tolerates incomplete JSON — it returns whatever
              // structure can be inferred. Render it directly so the UI fills
              // in field by field as the model produces them.
              const partial = parsePartialJSON(accumulated) as
                | PartialResult
                | undefined
              if (partial && typeof partial === 'object') {
                setResult(partial)
              }
            } else if (
              chunk.type === 'REASONING_MESSAGE_CONTENT' &&
              chunk.delta
            ) {
              reasoning += chunk.delta
              setReasoningFull(reasoning)
              // One-liner: take the last non-empty line/sentence so consumers
              // see "what it's thinking right now" without a wall of text.
              setReasoningLine(latestThought(reasoning))
            } else if (
              chunk.type === 'CUSTOM' &&
              chunk.name === 'structured-output.complete' &&
              chunk.value?.object
            ) {
              sawComplete = true
              setResult(chunk.value.object as PartialResult)
              setHasFinalResult(true)
              if (
                typeof (chunk.value as { reasoning?: string }).reasoning ===
                'string'
              ) {
                const finalReasoning = (chunk.value as { reasoning: string })
                  .reasoning
                setReasoningFull(finalReasoning)
                setReasoningLine(latestThought(finalReasoning))
              }
            } else if (chunk.type === 'RUN_ERROR') {
              throw new Error(chunk.message || 'Stream failed')
            }
          }
        }
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        processBuffer()
      }

      // Flush any buffered bytes from incomplete multi-byte UTF-8 sequences
      // so the final SSE frame isn't dropped.
      buffer += decoder.decode()
      processBuffer()

      if (!sawComplete) {
        throw new Error('Stream ended before structured-output.complete')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Aborted')
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const handleAbort = () => abortRef.current?.abort()

  const renderingPartial = isStreaming && !hasFinalResult
  const recommendations = result?.recommendations ?? []
  const nextSteps = result?.nextSteps ?? []

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <h2 className="text-xl font-semibold">Structured Output</h2>
        <p className="text-sm text-gray-400 mt-1">
          Calls <code className="text-orange-400">chat()</code> with an{' '}
          <code className="text-orange-400">outputSchema</code>. Toggle{' '}
          <code className="text-orange-400">stream</code> to exercise{' '}
          <code className="text-orange-400">structuredOutputStream</code> on the
          selected provider; the UI fills in progressively via{' '}
          <code className="text-orange-400">parsePartialJSON</code>, then snaps
          to the validated payload from the terminal{' '}
          <code className="text-orange-400">structured-output.complete</code>{' '}
          event. Reasoning models surface a live thinking strip from{' '}
          <code className="text-orange-400">REASONING_MESSAGE_CONTENT</code>{' '}
          deltas — openai (Responses API), openrouter, xAI (
          <code className="text-orange-400">delta.reasoning_content</code>), and
          Groq (<code className="text-orange-400">delta.reasoning</code>) all
          stream chain-of-thought.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label htmlFor={providerId} className="text-sm text-gray-400">
                Provider
              </label>
              <select
                id={providerId}
                value={provider}
                onChange={(e) => onProviderChange(e.target.value as Provider)}
                disabled={isLoading}
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
              >
                <option value="openai">OpenAI (Responses)</option>
                <option value="openai-chat">OpenAI (Chat Completions)</option>
                <option value="grok">Grok (xAI)</option>
                <option value="groq">Groq</option>
                <option value="openrouter">
                  OpenRouter (Chat Completions)
                </option>
                <option value="openrouter-responses">
                  OpenRouter (Responses beta)
                </option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor={modelId} className="text-sm text-gray-400">
                Model
              </label>
              <select
                id={modelId}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
              >
                {PROVIDER_MODELS[provider].map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={stream}
              onChange={(e) => setStream(e.target.checked)}
              disabled={isLoading}
              className="accent-orange-500"
            />
            Stream (single-request{' '}
            <code className="text-orange-400">stream: true</code> +{' '}
            <code className="text-orange-400">
              response_format: json_schema
            </code>
            )
          </label>

          <div className="space-y-3">
            <label htmlFor={promptId} className="text-sm text-gray-400">
              Prompt
            </label>
            <textarea
              id={promptId}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want recommendations for..."
              className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              rows={6}
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isLoading}
              className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {isLoading
                ? stream
                  ? 'Streaming...'
                  : 'Generating...'
                : 'Generate'}
            </button>
            {isLoading && stream && (
              <button
                onClick={handleAbort}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Abort
              </button>
            )}
            {(result || rawJson) && !isLoading && (
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
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {(reasoningLine || reasoningFull) && (
            <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
              <div className="flex items-center gap-2 text-xs text-purple-300/80">
                <span className="uppercase tracking-wider">Thinking</span>
                {isStreaming && !hasFinalResult && (
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                )}
              </div>
              <p
                className="text-sm text-purple-100/90 mt-1 truncate"
                title={reasoningFull}
              >
                {reasoningLine ||
                  reasoningFull.split('\n').filter(Boolean).slice(-1)[0] ||
                  '…'}
              </p>
              {reasoningFull && reasoningFull !== reasoningLine && (
                <details className="mt-2">
                  <summary className="text-xs text-purple-300/60 cursor-pointer">
                    Full reasoning ({reasoningFull.length} chars)
                  </summary>
                  <pre className="text-xs text-purple-100/70 mt-2 whitespace-pre-wrap wrap-break-word">
                    {reasoningFull}
                  </pre>
                </details>
              )}
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {stream && deltaCount > 0 && (
                <p className="text-xs text-gray-500">
                  {hasFinalResult ? 'Final result' : 'Streaming'} — {deltaCount}{' '}
                  deltas received
                  {renderingPartial && (
                    <span className="ml-1 inline-block w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  )}
                </p>
              )}

              {(result.title || renderingPartial) && (
                <div
                  className={`p-4 bg-gray-800/50 border border-gray-700 rounded-lg transition-colors ${
                    renderingPartial && !result.summary
                      ? 'border-orange-500/30'
                      : ''
                  }`}
                >
                  <h3 className="text-lg font-semibold text-white">
                    {result.title || (
                      <span className="text-gray-500 italic">
                        Generating title…
                      </span>
                    )}
                    {renderingPartial && result.title && !result.summary && (
                      <span className="ml-1 inline-block w-1.5 h-4 align-middle bg-orange-400 animate-pulse" />
                    )}
                  </h3>
                  {(result.summary || renderingPartial) && (
                    <p className="text-gray-300 mt-2 text-sm">
                      {result.summary || (
                        <span className="text-gray-500 italic">
                          Generating summary…
                        </span>
                      )}
                    </p>
                  )}
                </div>
              )}

              {recommendations.length > 0 && (
                <div className="space-y-3">
                  {recommendations.map((rec, i) => {
                    const isLastWhileStreaming =
                      renderingPartial && i === recommendations.length - 1
                    return (
                      <div
                        key={i}
                        className={`p-4 bg-gray-800/50 border rounded-lg transition-colors ${
                          isLastWhileStreaming
                            ? 'border-orange-500/30'
                            : 'border-gray-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-white font-medium">
                              {[rec.brand, rec.name]
                                .filter(Boolean)
                                .join(' ') || (
                                <span className="text-gray-500 italic">
                                  Loading…
                                </span>
                              )}
                            </p>
                            {rec.type && (
                              <p className="text-xs text-orange-400 uppercase tracking-wider mt-0.5">
                                {rec.type}
                              </p>
                            )}
                          </div>
                          {rec.priceRangeUsd?.min != null &&
                            rec.priceRangeUsd.max != null && (
                              <p className="text-sm text-gray-400 whitespace-nowrap">
                                ${rec.priceRangeUsd.min} – $
                                {rec.priceRangeUsd.max}
                              </p>
                            )}
                        </div>
                        {rec.reason && (
                          <p className="text-sm text-gray-300 mt-2">
                            {rec.reason}
                            {isLastWhileStreaming && (
                              <span className="ml-1 inline-block w-1.5 h-4 align-middle bg-orange-400 animate-pulse" />
                            )}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {nextSteps.length > 0 && (
                <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                  <p className="text-sm text-gray-400 mb-2">Next Steps</p>
                  <ul className="list-disc list-inside text-sm text-gray-200 space-y-1">
                    {nextSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rawJson && (
                <details className="p-4 bg-gray-800/30 border border-gray-700/50 rounded-lg">
                  <summary className="text-sm text-gray-400 cursor-pointer">
                    Raw JSON ({rawJson.length} chars)
                  </summary>
                  <pre className="text-xs text-gray-300 mt-3 overflow-x-auto wrap-break-word whitespace-pre-wrap">
                    {rawJson}
                  </pre>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/structured-output')({
  component: StructuredOutputPage,
})
