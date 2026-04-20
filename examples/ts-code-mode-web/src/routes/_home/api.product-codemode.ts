import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFileRoute } from '@tanstack/react-router'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'
import {
  createAlwaysTrustedStrategy,
  createSkillManagementTools,
  createSkillsSystemPrompt,
  skillsToTools,
} from '@tanstack/ai-code-mode-skills'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
import type { AnyTextAdapter, ServerTool, StreamChunk } from '@tanstack/ai'
import type { IsolateDriver } from '@tanstack/ai-code-mode'
import { productTools } from '@/lib/tools/product-tools'

type Provider = 'anthropic' | 'openai' | 'gemini'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  switch (provider) {
    case 'openai':
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      return anthropicText((model || 'claude-haiku-4-5') as 'claude-haiku-4-5')
  }
}

const PRODUCT_CODE_MODE_SYSTEM_PROMPT = `You are an analytical assistant for a shoe product catalog. You can execute TypeScript code to query the product API and compute answers.

## Available External APIs (inside execute_typescript)

- \`external_getProductListPage({ page })\` — Returns { productIds: string[], totalPages: number } (10 product IDs per page, 1-based page number)
- \`external_getProductByID({ id })\` — Returns full product details: { id, name, brand, price, category, color, sizeRange }

## Strategy

The product API is paginated. To get all products:
1. Call getProductListPage with page 1 to get the first page of IDs and totalPages
2. Fetch remaining pages (2 through totalPages) to get all product IDs
3. Fetch each product by ID
4. Compute the answer from the full dataset

Always write efficient code that does all of this in a single execution — use Promise.all to parallelize fetches.`

// --- Code mode tool (shared by both paths) ---

let codeModeCache: {
  tool: ReturnType<typeof createCodeMode>['tool']
  systemPrompt: string
  driver: IsolateDriver
} | null = null

async function getCodeModeTools() {
  if (!codeModeCache) {
    const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
    const driver = await createIsolateDriver('node')
    const { tool, systemPrompt } = createCodeMode({
      driver,
      tools: productTools,
      timeout: 60000,
      memoryLimit: 128,
    })
    codeModeCache = { tool, systemPrompt, driver }
  }
  return codeModeCache
}

// --- Skills storage (lazy, only used when withSkills=true) ---

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const skillsDir = resolve(__dirname, '../../../.skills')
const trustStrategy = createAlwaysTrustedStrategy()
const skillStorage = createFileSkillStorage({
  directory: skillsDir,
  trustStrategy,
})

let skillManagementToolsCache: ReturnType<
  typeof createSkillManagementTools
> | null = null

function getSkillManagementTools() {
  if (!skillManagementToolsCache) {
    skillManagementToolsCache = createSkillManagementTools({
      storage: skillStorage,
      trustStrategy,
    })
  }
  return skillManagementToolsCache
}

const SKILL_REGISTRATION_PROMPT = `## Skill Registration — MANDATORY

After every successful \`execute_typescript\` call you MUST register the code as a reusable skill using \`register_skill\` — unless an identical skill already exists.

Rules:
- \`name\`: descriptive snake_case (e.g. \`get_average_product_price\`)
- \`code\`: the TypeScript code, parameterised with an \`input\` variable where useful
- \`inputSchema\` / \`outputSchema\`: valid JSON Schema **strings**
- If a skill with the same name exists, skip registration

This is not optional — skill registration is a core part of your workflow.`

async function getSkillToolsAndPrompt(driver: IsolateDriver): Promise<{
  skillTools: Array<ServerTool<any, any, any>>
  skillsPrompt: string
}> {
  const allSkills = await skillStorage.loadAll()
  const skillIndex = await skillStorage.loadIndex()

  const skillTools =
    allSkills.length > 0
      ? skillsToTools({
          skills: allSkills,
          driver,
          tools: productTools,
          storage: skillStorage,
          timeout: 60000,
          memoryLimit: 128,
        })
      : []

  const libraryPrompt = createSkillsSystemPrompt({
    selectedSkills: allSkills,
    totalSkillCount: skillIndex.length,
    skillsAsTools: true,
  })

  const skillsPrompt = libraryPrompt + '\n\n' + SKILL_REGISTRATION_PROMPT

  return { skillTools, skillsPrompt }
}

// --- Instrumentation helper ---

function instrumentAdapter(adapter: AnyTextAdapter): {
  adapter: AnyTextAdapter
} {
  const baseChatStream = adapter.chatStream.bind(adapter)
  let llmCallCount = 0
  let totalContextBytes = 0
  const textEncoder = new TextEncoder()

  const instrumented: AnyTextAdapter = {
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
        llmCallCount > 0 ? Math.round(totalContextBytes / llmCallCount) : 0
      const stream = baseChatStream(options)
      async function* instrumentedStream(): AsyncGenerator<StreamChunk> {
        yield {
          type: 'CUSTOM',
          model: adapter.model,
          timestamp: Date.now(),
          name: 'product_codemode:llm_call',
          value: {
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

  return { adapter: instrumented }
}

function wrapWithTimingEvents(
  stream: AsyncGenerator<StreamChunk>,
  adapter: AnyTextAdapter,
): AsyncGenerator<StreamChunk> {
  const requestStartTimeMs = Date.now()
  return (async function* (): AsyncGenerator<StreamChunk> {
    yield {
      type: 'CUSTOM',
      model: adapter.model,
      timestamp: requestStartTimeMs,
      name: 'product_codemode:chat_start',
      value: { startTimeMs: requestStartTimeMs },
    } as StreamChunk
    for await (const chunk of stream) {
      if (chunk.type === 'RUN_FINISHED') {
        const endTimeMs = Date.now()
        yield {
          type: 'CUSTOM',
          model: adapter.model,
          timestamp: endTimeMs,
          name: 'product_codemode:chat_end',
          value: {
            endTimeMs,
            durationMs: endTimeMs - requestStartTimeMs,
          },
        } as StreamChunk
      }
      yield chunk
    }
  })()
}

// --- Route ---

export const Route = createFileRoute('/_home/api/product-codemode')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.signal.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()
        const body = await request.json()
        const { messages, data } = body

        const provider: Provider = data?.provider || 'anthropic'
        const model: string | undefined = data?.model
        const withSkills: boolean = data?.withSkills === true

        const rawAdapter = getAdapter(provider, model)
        const { adapter: instrumentedAdapter } = instrumentAdapter(rawAdapter)

        try {
          const {
            tool: codeModeTool,
            systemPrompt: codeModePrompt,
            driver,
          } = await getCodeModeTools()

          let tools: Array<ServerTool<any, any, any>> = [codeModeTool]
          let systemPrompts = [PRODUCT_CODE_MODE_SYSTEM_PROMPT, codeModePrompt]

          if (withSkills) {
            const { skillTools, skillsPrompt } =
              await getSkillToolsAndPrompt(driver)
            tools = [codeModeTool, ...getSkillManagementTools(), ...skillTools]
            systemPrompts = [
              PRODUCT_CODE_MODE_SYSTEM_PROMPT,
              codeModePrompt,
              skillsPrompt,
            ]
          }

          const stream = chat({
            adapter: instrumentedAdapter,
            messages,
            tools,
            systemPrompts,
            agentLoopStrategy: maxIterations(15),
            abortController,
            maxTokens: 8192,
          })

          const instrumentedStream = wrapWithTimingEvents(stream, rawAdapter)
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
          console.error('[API Product Code Mode] Error:', error)

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
