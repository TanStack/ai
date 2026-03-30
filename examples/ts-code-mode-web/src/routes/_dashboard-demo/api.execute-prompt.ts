import { createFileRoute } from '@tanstack/react-router'
import { anthropicText } from '@tanstack/ai-anthropic'
import { executePrompt } from '@tanstack/ai-code-mode'
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

export const Route = createFileRoute('/_dashboard-demo/api/execute-prompt' as any)({
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

          const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
          const driver = await createIsolateDriver('node')
          const adapter = anthropicText('claude-haiku-4-5')

          const result = await executePrompt({
            adapter,
            prompt: prompt.trim(),
            system: SHOE_EXECUTE_PROMPT_SYSTEM,
            tools: productTools,
            driver,
            timeout: 60000,
            memoryLimit: 128,
            maxTokens: 8192,
          })

          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
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
