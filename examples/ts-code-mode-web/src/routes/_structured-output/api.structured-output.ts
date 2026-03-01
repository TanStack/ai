import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { createCodeModeToolAndPrompt } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import type { AnyTextAdapter } from '@tanstack/ai'
import { allTools } from '@/lib/tools'
import { CODE_MODE_SYSTEM_PROMPT } from '@/lib/prompts'
import {
  getSchemaForFormat,
  getFormatPromptAddition,
  type OutputFormat,
} from '@/lib/structured-output-types'

type Provider = 'anthropic' | 'openai' | 'gemini'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText(
        (model || 'claude-sonnet-4-5') as 'claude-sonnet-4-5',
      )
  }
}

// Lazy initialization to avoid loading native modules at module load time
let codeModeCache: { tool: ReturnType<typeof createCodeModeToolAndPrompt>['tool']; systemPrompt: string } | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createNodeIsolateDriver } = await import('@tanstack/ai-isolate-node')
    const { tool, systemPrompt } = createCodeModeToolAndPrompt({
      driver: createNodeIsolateDriver(),
      tools: allTools,
      timeout: 60000,
      memoryLimit: 128,
    })
    codeModeCache = { tool, systemPrompt }
  }
  return codeModeCache
}

export const Route = createFileRoute('/_structured-output/api/structured-output')({
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
        const outputFormat: OutputFormat = data?.outputFormat || 'blog'

        const adapter = getAdapter(provider, model)
        const outputSchema = getSchemaForFormat(outputFormat)
        const formatPromptAddition = getFormatPromptAddition(outputFormat)

        // Enhanced system prompt with format-specific instructions
        const structuredOutputSystemPrompt = `${CODE_MODE_SYSTEM_PROMPT}

## Output Format Instructions

${formatPromptAddition}

IMPORTANT: After completing your analysis using execute_typescript, your final structured output will be extracted automatically. Focus on thorough analysis first, then the system will format your insights according to the selected format.`

        try {
          const { tool, systemPrompt } = await getCodeModeTools()

          // Phase 1: Run the agentic loop with Code Mode (streaming)
          // Phase 2: Get structured output (non-streaming, appended at end)

          // Create a custom stream that handles both phases
          const combinedStream = createTwoPhaseStream({
            adapter,
            messages,
            systemPrompts: [structuredOutputSystemPrompt, systemPrompt],
            tools: [tool],
            outputSchema,
            outputFormat,
            abortController,
          })

          const sseStream = toServerSentEventsStream(combinedStream, abortController)

          return new Response(sseStream, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
          })
        } catch (error: unknown) {
          console.error('[Structured Output API] Error:', error)

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

interface TwoPhaseStreamOptions {
  adapter: AnyTextAdapter
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>
  systemPrompts: Array<string>
  tools: Array<ReturnType<typeof createCodeModeToolAndPrompt>['tool']>
  outputSchema: ReturnType<typeof getSchemaForFormat>
  outputFormat: OutputFormat
  abortController: AbortController
}

async function* createTwoPhaseStream(
  options: TwoPhaseStreamOptions,
): AsyncIterable<StreamChunk> {
  const {
    adapter,
    messages,
    systemPrompts,
    tools,
    outputSchema,
    outputFormat,
    abortController,
  } = options

  // Phase 1: Run the agentic Code Mode analysis (streaming)
  const analysisStream = chat({
    adapter,
    messages,
    tools,
    systemPrompts,
    agentLoopStrategy: maxIterations(15),
    abortController,
    maxTokens: 8192,
  })

  // Collect messages for phase 2 while streaming phase 1
  const collectedMessages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }> = [...messages]
  let currentAssistantContent = ''

  for await (const chunk of analysisStream) {
    yield chunk

    // Collect text content for phase 2
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      currentAssistantContent += chunk.delta
    }

    // When we get a RUN_FINISHED chunk, save the assistant message
    if (chunk.type === 'RUN_FINISHED') {
      if (currentAssistantContent) {
        collectedMessages.push({
          role: 'assistant',
          content: currentAssistantContent,
        })
      }
    }
  }

  // Phase 2: Get structured output using the conversation context
  // Add a user message explicitly specifying the format
  const formatNames: Record<OutputFormat, string> = {
    blog: 'a professional blog post',
    scifi: 'a three-act science fiction story',
    gameshow: 'a TV game show pitch',
    country: 'a country song with verses, chorus, and bridge',
    trivia: 'a trivia quiz with multiple choice questions',
  }
  
  const structuredRequestMessages = [
    ...collectedMessages,
    {
      role: 'user' as const,
      content: `Now, based on your analysis above, transform the results into ${formatNames[outputFormat]}. Use the actual data and insights you gathered. Be creative and engaging while staying true to the numbers.`,
    },
  ]

  try {
    const structuredResult = await chat({
      adapter,
      messages: structuredRequestMessages,
      systemPrompts,
      outputSchema,
      maxTokens: 8192,
    })

    // Emit a custom event with the structured output
    yield {
      type: 'CUSTOM',
      model: adapter.model,
      timestamp: Date.now(),
      name: 'structured_output:result',
      value: {
        format: outputFormat,
        result: structuredResult,
      },
    }

    // Emit final done chunk
    yield {
      type: 'RUN_FINISHED',
      runId: `done-structured-${Date.now()}`,
      model: adapter.model,
      timestamp: Date.now(),
      finishReason: 'stop',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    } as StreamChunk
  } catch (error) {
    console.error('[Structured Output] Phase 2 error:', error)
    
    // Emit error as custom event
    yield {
      type: 'CUSTOM',
      model: adapter.model,
      timestamp: Date.now(),
      name: 'structured_output:error',
      value: {
        format: outputFormat,
        error: error instanceof Error ? error.message : 'Failed to generate structured output',
      },
    }
  }
}

