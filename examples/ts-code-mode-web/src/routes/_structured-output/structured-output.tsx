import { useCallback, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Code, Play, Square, Sparkles } from 'lucide-react'
import { parsePartialJSON } from '@tanstack/ai'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { CodeBlock, ExecutionResult, Header } from '@/components'

export const Route = createFileRoute('/_structured-output/structured-output')({
  component: StructuredOutputPage,
})

const FIXED_PROMPT =
  'Use city tools to compare Tokyo and Barcelona. Then produce a concise travel recommendation report with key findings and practical next steps.'

function MessageList({
  messages,
  isLoading,
}: {
  messages: Array<UIMessage>
  isLoading: boolean
}) {
  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 px-8">
        <div className="max-w-2xl text-center space-y-3">
          <Sparkles className="w-10 h-10 mx-auto text-pink-400/80" />
          <p className="text-lg font-medium">Minimal Structured Output Demo</p>
          <p className="text-sm text-gray-500">
            Click Run Demo. The model will use Code Mode tools, then emit fixed
            structured JSON at the end.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.map((message) => {
        const toolResults = new Map<string, { content: string; error?: string }>()
        for (const part of message.parts) {
          if (part.type === 'tool-result') {
            toolResults.set(part.toolCallId, {
              content: part.content,
              error: part.error,
            })
          }
        }

        return (
          <div
            key={message.id}
            className={`rounded-lg p-4 ${
              message.role === 'assistant'
                ? 'bg-pink-500/10 border border-pink-500/20'
                : 'bg-gray-800 border border-gray-700'
            }`}
          >
            <div className="text-xs uppercase tracking-wider text-gray-400 mb-2">
              {message.role}
            </div>

            <div className="space-y-3">
              {message.parts.map((part, idx) => {
                if (part.type === 'text' && part.content) {
                  return (
                    <p key={`text-${idx}`} className="text-sm text-gray-100 whitespace-pre-wrap">
                      {part.content}
                    </p>
                  )
                }

                if (
                  part.type === 'tool-call' &&
                  part.name === 'execute_typescript'
                ) {
                  const parsedArgs = parsePartialJSON(part.arguments)
                  const code =
                    parsedArgs &&
                    typeof parsedArgs === 'object' &&
                    'typescriptCode' in parsedArgs &&
                    typeof parsedArgs.typescriptCode === 'string'
                      ? parsedArgs.typescriptCode
                      : ''

                  const toolResult = toolResults.get(part.id)
                  let parsedOutput = part.output
                  if (!parsedOutput && toolResult?.content) {
                    try {
                      parsedOutput = JSON.parse(toolResult.content)
                    } catch {
                      parsedOutput = { result: toolResult.content }
                    }
                  }

                  const hasOutput =
                    part.output !== undefined || toolResult !== undefined
                  const isInputStreaming = part.state === 'input-streaming'
                  const isInputComplete = part.state === 'input-complete'
                  const isExecuting = isInputComplete && !hasOutput
                  const hasError =
                    (parsedOutput &&
                      typeof parsedOutput === 'object' &&
                      'success' in parsedOutput &&
                      parsedOutput.success === false) ||
                    toolResult?.error !== undefined

                  const codeStatus =
                    isInputStreaming || isExecuting
                      ? 'running'
                      : hasError
                        ? 'error'
                        : 'success'
                  const executionStatus = isExecuting
                    ? 'running'
                    : hasError
                      ? 'error'
                      : 'success'

                  return (
                    <div key={part.id} className="space-y-2">
                      <CodeBlock code={code} status={codeStatus} />
                      {isInputComplete && (
                        <ExecutionResult
                          status={executionStatus}
                          result={
                            parsedOutput &&
                            typeof parsedOutput === 'object' &&
                            'result' in parsedOutput
                              ? parsedOutput.result
                              : undefined
                          }
                          error={
                            parsedOutput &&
                            typeof parsedOutput === 'object' &&
                            'error' in parsedOutput &&
                            parsedOutput.error &&
                            typeof parsedOutput.error === 'object' &&
                            'message' in parsedOutput.error &&
                            typeof parsedOutput.error.message === 'string'
                              ? parsedOutput.error.message
                              : toolResult?.error
                          }
                          logs={
                            parsedOutput &&
                            typeof parsedOutput === 'object' &&
                            'logs' in parsedOutput &&
                            Array.isArray(parsedOutput.logs)
                              ? parsedOutput.logs
                              : undefined
                          }
                        />
                      )}
                    </div>
                  )
                }

                return null
              })}
            </div>
          </div>
        )
      })}

      {isLoading && (
        <div className="text-sm text-pink-300 animate-pulse">
          Running Code Mode and generating structured output...
        </div>
      )}
    </div>
  )
}

function StructuredOutputPage() {
  const [structuredResult, setStructuredResult] = useState<unknown>(null)
  const [structuredError, setStructuredError] = useState<string | null>(null)

  const body = useMemo(
    () => ({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
    }),
    [],
  )

  const handleCustomEvent = useCallback((eventType: string, data: unknown) => {
    if (eventType === 'structured_output:result') {
      const resultData = data as { result: unknown }
      setStructuredResult(resultData.result)
      setStructuredError(null)
      return
    }

    if (eventType === 'structured_output:error') {
      const errorData = data as { error?: string; raw?: string }
      const msg = errorData.error || 'Failed to generate structured output'
      setStructuredError(
        errorData.raw ? `${msg}\n\nRaw output (first 500 chars):\n${errorData.raw}` : msg,
      )
      return
    }
  }, [])

  const { messages, sendMessage, isLoading, stop } = useChat({
    id: 'structured-output-minimal',
    connection: fetchServerSentEvents('/api/structured-output'),
    body,
    onCustomEvent: handleCustomEvent,
  })

  const runDemo = useCallback(() => {
    setStructuredResult(null)
    setStructuredError(null)
    sendMessage(FIXED_PROMPT)
  }, [sendMessage])

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <Header />

      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
        <div className="border-b border-pink-500/20 bg-gray-800 p-4 space-y-3">
          <p className="text-sm text-gray-400">Fixed prompt:</p>
          <p className="text-sm text-gray-100 bg-gray-900 border border-gray-700 rounded-lg p-3">
            {FIXED_PROMPT}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={runDemo}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-medium disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              Run Demo
            </button>
            <button
              onClick={stop}
              disabled={!isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium disabled:opacity-50"
            >
              <Square className="w-4 h-4 fill-current" />
              Stop
            </button>
          </div>
        </div>

        <MessageList messages={messages} isLoading={isLoading} />

        <div className="border-t border-pink-500/20 bg-gray-800 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm text-pink-300">
            <Code className="w-4 h-4" />
            Structured JSON Output
          </div>

          {structuredError && (
            <div className="text-sm text-red-300 border border-red-500/30 bg-red-900/20 rounded-lg p-3">
              {structuredError}
            </div>
          )}

          {structuredResult ? (
            <pre className="text-xs text-gray-100 bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-x-auto max-h-72">
              {JSON.stringify(structuredResult, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-gray-500">
              Run the demo to produce the final structured JSON result.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
