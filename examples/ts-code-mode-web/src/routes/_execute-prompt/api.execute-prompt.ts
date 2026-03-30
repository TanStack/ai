import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { createCodeModeToolAndPrompt } from '@tanstack/ai-code-mode'
import type { IsolateDriver } from '@tanstack/ai-code-mode'
import { productTools } from '@/lib/tools/product-tools'

const SHOE_EXECUTE_PROMPT_SYSTEM = `You are an analytical assistant for a shoe product catalog. You can execute TypeScript code to query the product API and compute answers.

## Available External APIs (inside execute_typescript)

- \`external_getProductListPage({ page })\` — Returns { productIds: string[], totalPages: number } (10 product IDs per page, 1-based page number)
- \`external_getProductByID({ id })\` — Returns full product details: { id, name, brand, price, category, color, sizeRange }

## Strategy

The product API is paginated. To get all products:
1. Call getProductListPage with page 1 to get the first page of IDs and totalPages
2. Fetch remaining pages as needed
3. Fetch each product by ID
4. Compute the answer from the data

Return JSON in whatever format is appropriate for the user's question. Output only JSON in your final message, nothing else.`

interface CodeExecution {
  typescriptCode: string
  success: boolean
  result?: unknown
  logs?: Array<string>
  error?: { message: string; name?: string }
}

let cachedDriver: IsolateDriver | null = null

async function getDriver(): Promise<IsolateDriver> {
  if (!cachedDriver) {
    const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
    cachedDriver = await createIsolateDriver('node')
  }
  return cachedDriver
}

export const Route = createFileRoute('/_execute-prompt/api/execute-prompt' as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          let body: unknown
          try {
            body = await request.json()
          } catch {
            return new Response(
              JSON.stringify({ error: 'Invalid or empty JSON body' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }
          const prompt =
            body &&
            typeof body === 'object' &&
            'prompt' in body &&
            typeof (body as { prompt?: unknown }).prompt === 'string'
              ? (body as { prompt: string }).prompt
              : undefined
          if (typeof prompt !== 'string' || !prompt.trim()) {
            return new Response(
              JSON.stringify({ error: 'Missing or invalid "prompt" string' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }

          const driver = await getDriver()
          const adapter = anthropicText('claude-haiku-4-5')

          const { tool: rawCodeTool, systemPrompt: codeSystemPrompt } =
            createCodeModeToolAndPrompt({
              driver,
              tools: productTools,
              timeout: 60000,
              memoryLimit: 128,
            })

          const executions: Array<CodeExecution> = []

          const wrappedCodeTool = {
            ...rawCodeTool,
            execute: async (input: { typescriptCode: string }, ctx?: unknown) => {
              const output = await rawCodeTool.execute!(input, ctx as any)
              executions.push({
                typescriptCode: input.typescriptCode,
                success: (output as any).success,
                result: (output as any).result,
                logs: (output as any).logs,
                error: (output as any).error,
              })
              return output
            },
          }

          const text = await chat({
            adapter,
            systemPrompts: [SHOE_EXECUTE_PROMPT_SYSTEM, codeSystemPrompt],
            messages: [{ role: 'user', content: prompt.trim() }],
            tools: [wrappedCodeTool as any],
            stream: false as const,
            maxTokens: 8192,
          })

          let data: unknown
          try {
            data = JSON.parse(text)
          } catch {
            data = { raw: text, parseError: true }
          }

          return new Response(
            JSON.stringify({
              data,
              agentName: `agent_${Date.now().toString(36)}`,
              executions,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error: unknown) {
          console.error('[API execute-prompt]', error)
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'executePrompt failed',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
