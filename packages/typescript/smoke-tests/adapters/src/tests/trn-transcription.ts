import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { generateTranscription } from '@tanstack/ai'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

/**
 * TRN: Audio Transcription Test
 *
 * Tests audio transcription by providing an audio file and
 * verifying we get valid transcription text back.
 *
 * NOTE: This test is skipped by default to avoid transcription
 * costs on every run. Use --tests trn to run explicitly.
 *
 * Requires a test audio file at: fixtures/test-audio.mp3
 */
export async function runTRN(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'trn-transcription'
  const adapterName = adapterContext.adapterName

  // Skip if no transcription adapter is available
  if (!adapterContext.transcriptionAdapter) {
    console.log(
      `[${adapterName}] — ${testName}: Ignored (no transcription adapter)`,
    )
    return { passed: true, ignored: true }
  }

  const model = adapterContext.transcriptionModel || 'whisper-1'

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
  }

  try {
    // Try to load test audio file
    const testAudioPath = join(process.cwd(), 'fixtures', 'test-audio.mp3')
    let audioData: string

    try {
      const audioBuffer = await readFile(testAudioPath)
      audioData = audioBuffer.toString('base64')
      debugData.input = {
        audioFile: testAudioPath,
        audioSize: audioBuffer.length,
      }
    } catch (fileError) {
      // No test audio file available - skip test
      console.log(
        `[${adapterName}] — ${testName}: Ignored (no test audio file at fixtures/test-audio.mp3)`,
      )
      return { passed: true, ignored: true }
    }

    const result = await generateTranscription({
      adapter: adapterContext.transcriptionAdapter,
      model,
      audio: audioData,
      language: 'en',
    })

    // Check that we got valid transcription data
    const hasText =
      result.text && typeof result.text === 'string' && result.text.length > 0
    const hasId = result.id && typeof result.id === 'string'
    const hasModel = result.model && typeof result.model === 'string'

    const passed = hasText && hasId && hasModel

    debugData.summary = {
      hasText,
      hasId,
      hasModel,
      textLength: result.text?.length || 0,
      textPreview: result.text?.substring(0, 100) || '',
      language: result.language,
      duration: result.duration,
      segmentCount: result.segments?.length || 0,
      wordCount: result.words?.length || 0,
    }
    debugData.result = {
      passed,
      error: passed
        ? undefined
        : !hasText
          ? 'Transcription text missing'
          : !hasId
            ? 'ID missing'
            : 'Model missing',
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
