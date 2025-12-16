import { chat, maxIterations, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

// Schema for product recommendation with price
const RecommendationSchema = z.object({
  productName: z.string().describe('Name of the recommended product'),
  currentPrice: z.number().describe('Current price in dollars'),
  reason: z.string().describe('Why this product is recommended'),
})

type Recommendation = z.infer<typeof RecommendationSchema>

/**
 * AGS: Agentic Structured Output Test
 *
 * Tests structured output that requires tool calls to gather
 * information before producing the final structured response.
 */
export async function runAGS(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'ags-agentic-structured'
  const adapterName = adapterContext.adapterName

  let toolCalled = false
  let priceReturned: number | null = null

  // Tool that provides price information
  const getPriceTool = toolDefinition({
    name: 'get_product_price',
    description: 'Get the current price of a product',
    inputSchema: z.object({
      productName: z.string().describe('Name of the product to look up'),
    }),
  }).server(async (args) => {
    toolCalled = true
    // Return a mock price based on product name
    const price = args.productName.toLowerCase().includes('laptop')
      ? 999.99
      : 49.99
    priceReturned = price
    return JSON.stringify({ productName: args.productName, price })
  })

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model: adapterContext.model,
    timestamp: new Date().toISOString(),
  }

  try {
    const result = (await chat({
      adapter: adapterContext.textAdapter,
      model: adapterContext.model,
      messages: [
        {
          role: 'user' as const,
          content:
            'I need a laptop recommendation. First use the get_product_price tool to look up the price of "Gaming Laptop Pro", then give me a structured recommendation.',
        },
      ],
      tools: [getPriceTool],
      agentLoopStrategy: maxIterations(10),
      outputSchema: RecommendationSchema,
    })) as Recommendation

    // Validate the result
    const hasProductName =
      typeof result.productName === 'string' && result.productName.length > 0
    const hasPrice =
      typeof result.currentPrice === 'number' && result.currentPrice > 0
    const hasReason =
      typeof result.reason === 'string' && result.reason.length > 0

    // Verify the tool was called and price matches
    const priceMatches =
      priceReturned !== null &&
      Math.abs(result.currentPrice - priceReturned) < 0.01

    const passed =
      toolCalled && hasProductName && hasPrice && hasReason && priceMatches

    const issues: string[] = []
    if (!toolCalled) issues.push('tool was not called')
    if (!hasProductName) issues.push('missing or invalid productName')
    if (!hasPrice) issues.push('missing or invalid currentPrice')
    if (!hasReason) issues.push('missing or invalid reason')
    if (!priceMatches) {
      issues.push(
        `price mismatch: expected ${priceReturned}, got ${result.currentPrice}`,
      )
    }

    debugData.summary = {
      result,
      toolCalled,
      priceReturned,
      hasProductName,
      hasPrice,
      hasReason,
      priceMatches,
    }
    debugData.result = {
      passed,
      error: issues.length ? issues.join(', ') : undefined,
    }

    await writeDebugFile(adapterName, testName, debugData)

    console.log(
      `[${adapterName}] ${passed ? '✅' : '❌'} ${testName}${
        passed ? '' : `: ${debugData.result.error}`
      }`,
    )

    return { passed, error: debugData.result.error }
  } catch (error: any) {
    const message = error?.message || String(error)
    debugData.summary = { error: message, toolCalled, priceReturned }
    debugData.result = { passed: false, error: message }
    await writeDebugFile(adapterName, testName, debugData)
    console.log(`[${adapterName}] ❌ ${testName}: ${message}`)
    return { passed: false, error: message }
  }
}
