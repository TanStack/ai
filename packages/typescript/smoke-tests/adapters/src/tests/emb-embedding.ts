import ai from '@tanstack/ai'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * EMB: Embedding Test
 *
 * Tests vector embedding generation by providing text inputs
 * and verifying we get valid numeric vectors.
 */
export async function runEMB(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'emb-embedding'
  const adapterName = adapterContext.adapterName

  // Skip if no embedding adapter is available
  if (!adapterContext.embeddingAdapter) {
    console.log(
      `[${adapterName}] ⋯ ${testName}: Ignored (no embedding adapter)`,
    )
    return { passed: true, ignored: true }
  }

  const model = adapterContext.embeddingModel || adapterContext.model
  const inputs = [
    'The Eiffel Tower is located in Paris.',
    'The Colosseum is located in Rome.',
  ]

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: { inputs },
  }

  try {
    const result = await ai({
      adapter: adapterContext.embeddingAdapter,
      model,
      input: inputs,
    })

    const embeddings: Array<Array<number>> = result.embeddings || []
    const lengths = embeddings.map((e: Array<number>) => e?.length || 0)
    const vectorsAreNumeric = embeddings.every(
      (vec: Array<number>) =>
        Array.isArray(vec) && vec.every((n: number) => typeof n === 'number'),
    )
    const passed =
      embeddings.length === inputs.length &&
      vectorsAreNumeric &&
      lengths.every((len: number) => len > 0)

    debugData.summary = {
      embeddingLengths: lengths,
      firstEmbeddingPreview: embeddings[0]?.slice(0, 8),
      usage: result.usage,
    }
    debugData.result = {
      passed,
      error: passed ? undefined : 'Embeddings missing, empty, or invalid',
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
