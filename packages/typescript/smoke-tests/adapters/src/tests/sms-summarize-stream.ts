import { summarize } from '@tanstack/ai'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * SMS: Summarize Stream Test
 *
 * Tests streaming text summarization by providing a paragraph and
 * verifying chunks are received progressively and the final content
 * contains key information.
 */
export async function runSMS(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'sms-summarize-stream'
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
    input: { text, maxLength: 80, style: 'concise' as const, stream: true },
  }

  try {
    const chunks: Array<{ type: string; delta?: string; content?: string }> = []
    let finalContent = ''
    let chunkCount = 0

    // Use streaming mode
    const stream = summarize({
      adapter: adapterContext.summarizeAdapter,
      model,
      text,
      maxLength: 80,
      style: 'concise',
      stream: true,
    })

    for await (const chunk of stream) {
      chunkCount++
      chunks.push({
        type: chunk.type,
        delta: 'delta' in chunk ? chunk.delta : undefined,
        content: 'content' in chunk ? chunk.content : undefined,
      })

      // AG-UI TEXT_MESSAGE_CONTENT event
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        if (chunk.content) {
          finalContent = chunk.content
        } else if (chunk.delta) {
          finalContent += chunk.delta
        }
      }
    }

    const contentLower = finalContent.toLowerCase()
    const hasParis = contentLower.includes('paris')
    const hasMultipleChunks = chunkCount > 1 // At least content + done chunks
    const passed = hasParis && hasMultipleChunks && finalContent.length > 0

    debugData.streaming = {
      chunkCount,
      chunks: chunks.slice(0, 10), // Store first 10 chunks for debugging
      finalContent,
      finalContentLength: finalContent.length,
    }
    debugData.result = {
      passed,
      hasParis,
      hasMultipleChunks,
      error: passed
        ? undefined
        : !hasParis
          ? "Final content missing 'Paris'"
          : !hasMultipleChunks
            ? 'Expected multiple chunks but got single chunk'
            : 'Unknown error',
    }

    await writeDebugFile(adapterName, testName, debugData)

    console.log(
      `[${adapterName}] ${passed ? '✅' : '❌'} ${testName} (${chunkCount} chunks)${
        passed ? '' : `: ${debugData.result.error}`
      }`,
    )

    return { passed, error: debugData.result.error }
  } catch (error: any) {
    const message = error?.message || String(error)
    debugData.streaming = { error: message }
    debugData.result = { passed: false, error: message }
    await writeDebugFile(adapterName, testName, debugData)
    console.log(`[${adapterName}] ❌ ${testName}: ${message}`)
    return { passed: false, error: message }
  }
}
