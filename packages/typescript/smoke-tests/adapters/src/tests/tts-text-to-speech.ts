import { generateSpeech } from '@tanstack/ai'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * TTS: Text-to-Speech Test
 *
 * Tests text-to-speech generation by providing text and
 * verifying we get valid audio data back.
 *
 * NOTE: This test is skipped by default to avoid generating
 * audio on every run. Use --tests tts to run explicitly.
 */
export async function runTTS(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'tts-text-to-speech'
  const adapterName = adapterContext.adapterName

  // Skip if no TTS adapter is available
  if (!adapterContext.ttsAdapter) {
    console.log(`[${adapterName}] — ${testName}: Ignored (no TTS adapter)`)
    return { passed: true, ignored: true }
  }

  const model = adapterContext.ttsModel || 'tts-1'
  const text = 'Hello, this is a test of text to speech synthesis.'

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: { text },
  }

  try {
    const result = await generateSpeech({
      adapter: adapterContext.ttsAdapter,
      model,
      text,
      voice: 'alloy',
      format: 'mp3',
    })

    // Check that we got valid audio data
    const hasAudio =
      result.audio &&
      typeof result.audio === 'string' &&
      result.audio.length > 0
    const hasFormat = result.format && typeof result.format === 'string'
    const hasId = result.id && typeof result.id === 'string'

    const passed = hasAudio && hasFormat && hasId

    debugData.summary = {
      hasAudio,
      hasFormat,
      hasId,
      format: result.format,
      audioLength: result.audio?.length || 0,
      // Don't log the actual audio data, just metadata
      contentType: result.contentType,
      duration: result.duration,
    }
    debugData.result = {
      passed,
      error: passed
        ? undefined
        : !hasAudio
          ? 'Audio data missing'
          : !hasFormat
            ? 'Format missing'
            : 'ID missing',
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
