import { experimental_text as text } from '@tanstack/ai'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * OST: One-Shot Text Test
 *
 * Tests non-streaming text completion by setting stream: false
 * and verifying we get a complete string response.
 */
export async function runOST(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'ost-one-shot-text'
  const adapterName = adapterContext.adapterName

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model: adapterContext.model,
    timestamp: new Date().toISOString(),
  }

  try {
    const result = await text({
      adapter: adapterContext.textAdapter,
      model: adapterContext.model,
      stream: false,
      messages: [
        {
          role: 'user' as const,
          content: 'What is 2 + 2? Reply with just the number.',
        },
      ],
    })

    // Result should be a string when stream: false
    const response = typeof result === 'string' ? result : String(result)
    const hasFour =
      response.includes('4') || response.toLowerCase().includes('four')

    debugData.summary = {
      response,
      responseType: typeof result,
      hasFour,
    }
    debugData.result = {
      passed: hasFour,
      error: hasFour ? undefined : "Response does not contain '4' or 'four'",
    }

    await writeDebugFile(adapterName, testName, debugData)

    console.log(
      `[${adapterName}] ${hasFour ? '✅' : '❌'} ${testName}${
        hasFour ? '' : `: ${debugData.result.error}`
      }`,
    )

    return { passed: hasFour, error: debugData.result.error }
  } catch (error: any) {
    const message = error?.message || String(error)
    debugData.summary = { error: message }
    debugData.result = { passed: false, error: message }
    await writeDebugFile(adapterName, testName, debugData)
    console.log(`[${adapterName}] ❌ ${testName}: ${message}`)
    return { passed: false, error: message }
  }
}
