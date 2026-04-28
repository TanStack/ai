import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import { zaiText } from '@tanstack/ai-zai'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import { allTools } from '@/lib/tools'
import { CODE_MODE_SYSTEM_PROMPT } from '@/lib/prompts'
import { exportConversationToPdfTool } from '@/lib/tools/export-pdf-tool'

type Provider = 'anthropic' | 'openai' | 'gemini' | 'zai'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'zai':
      return zaiText((model || 'glm-4.7') as 'glm-4.7')
    case 'anthropic':
    default:
      return anthropicText((model || 'claude-haiku-4-5') as 'claude-haiku-4-5')
  }
}

import {
  createIsolateDriver,
  type IsolateVM,
} from '@/lib/create-isolate-driver'

type CodeModeEntry = {
  tool: ReturnType<typeof createCodeMode>['tool']
  systemPrompt: string
}
const codeModeCacheByVM = new Map<IsolateVM, CodeModeEntry>()

async function getCodeModeTools(vm: IsolateVM = 'node') {
  let entry = codeModeCacheByVM.get(vm)
  if (!entry) {
    const driver = await createIsolateDriver(vm)
    const { tool, systemPrompt } = createCodeMode({
      driver,
      tools: allTools,
      timeout: 60000,
      memoryLimit: 128,
    })
    entry = { tool, systemPrompt }
    codeModeCacheByVM.set(vm, entry)
  }
  return entry
}

export const Route = createFileRoute('/_npm-github-chat/api/codemode')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal
        if (requestSignal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'anthropic'
        const model: string | undefined = data?.model
        const vm: IsolateVM = data?.vm || 'node'

        const adapter = getAdapter(provider, model)
        const baseChatStream = adapter.chatStream.bind(adapter)
        let llmCallCount = 0
        let totalContextBytes = 0
        const textEncoder = new TextEncoder()
        const instrumentedAdapter: AnyTextAdapter = {
          ...adapter,
          chatStream: (options) => {
            llmCallCount += 1
            let contextBytes = 0
            try {
              contextBytes = textEncoder.encode(
                JSON.stringify(options.messages ?? []),
              ).length
            } catch {
              contextBytes = 0
            }
            totalContextBytes += contextBytes
            const averageContextBytes =
              llmCallCount > 0
                ? Math.round(totalContextBytes / llmCallCount)
                : 0
            const stream = baseChatStream(options)
            async function* instrumentedStream(): AsyncGenerator<StreamChunk> {
              yield {
                type: 'CUSTOM',
                model: adapter.model,
                timestamp: Date.now(),
                name: 'code_mode:llm_call',
                data: {
                  count: llmCallCount,
                  contextBytes,
                  totalContextBytes,
                  averageContextBytes,
                },
              } as StreamChunk
              for await (const chunk of stream) {
                yield chunk
              }
            }
            return instrumentedStream()
          },
        }
        const { tool, systemPrompt } = await getCodeModeTools(vm)

        try {
          const stream = chat({
            adapter: instrumentedAdapter,
            messages,
            tools: [tool, exportConversationToPdfTool],
            systemPrompts: [CODE_MODE_SYSTEM_PROMPT, systemPrompt],
            agentLoopStrategy: maxIterations(15),
            abortController,
            // Increase max tokens to allow for complex code generation
            maxTokens: 8192,
          })

          const requestStartTimeMs = Date.now()
          const instrumentedStream =
            (async function* (): AsyncGenerator<StreamChunk> {
              yield {
                type: 'CUSTOM',
                model: adapter.model,
                timestamp: requestStartTimeMs,
                name: 'code_mode:chat_start',
                data: { startTimeMs: requestStartTimeMs },
              } as StreamChunk
              for await (const chunk of stream) {
                if (chunk.type === 'RUN_FINISHED') {
                  const endTimeMs = Date.now()
                  yield {
                    type: 'CUSTOM',
                    model: adapter.model,
                    timestamp: endTimeMs,
                    name: 'code_mode:chat_end',
                    data: {
                      endTimeMs,
                      durationMs: endTimeMs - requestStartTimeMs,
                    },
                  } as StreamChunk
                }
                yield chunk
              }
            })()

          const sseStream = toServerSentEventsStream(
            instrumentedStream,
            abortController,
          )

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error: unknown) {
          console.error('[API Route] Error:', error)

          if (
            (error instanceof Error && error.name === 'AbortError') ||
            abortController.signal.aborted
          ) {
            return new Response(null, { status: 499 })
          }

          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
