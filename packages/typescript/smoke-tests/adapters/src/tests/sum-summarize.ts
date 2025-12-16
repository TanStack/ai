import { summarize } from '@tanstack/ai'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * SUM: Summarize Test
 *
 * Tests text summarization by providing a paragraph and
 * verifying the summary contains key information.
 */
export async function runSUM(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'sum-summarize'
  const adapterName = adapterContext.adapterName

  // Skip if no summarize adapter is available
  if (!adapterContext.summarizeAdapter) {
    console.log(
      `[${adapterName}] — ${testName}: Ignored (no summarize adapter)`,
    )
    return { passed: true, ignored: true }
  }

  const model = adapterContext.summarizeModel || adapterContext.model
  const text =
    'Paris is the capital and most populous city of France, known for landmarks like the Eiffel Tower and the Louvre. It is a major center for art, fashion, gastronomy, and culture.'

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: { text, maxLength: 80, style: 'concise' as const },
  }

  try {
    const result = await summarize({
      adapter: adapterContext.summarizeAdapter,
      model,
      text,
      maxLength: 80,
      style: 'concise',
    })

    const summary = result.summary || ''
    const summaryLower = summary.toLowerCase()
    const passed = summary.length > 0 && summaryLower.includes('paris')

    debugData.summary = {
      summary,
      usage: result.usage,
      summaryLength: summary.length,
    }
    debugData.result = {
      passed,
      error: passed ? undefined : "Summary missing 'Paris'",
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
    debugData.summary = { error: message }
    debugData.result = { passed: false, error: message }
    await writeDebugFile(adapterName, testName, debugData)
    console.log(`[${adapterName}] ❌ ${testName}: ${message}`)
    return { passed: false, error: message }
  }
}
