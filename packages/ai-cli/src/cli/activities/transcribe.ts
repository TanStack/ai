import { readFile } from 'node:fs/promises'
import { generateTranscription } from '@tanstack/ai'
import { instantiateAdapter } from '../../core/providers'
import { emitJson } from '../../core/emit'
import { CliError } from '../../core/exit-codes'
import { resolveAdapterContext, withSpinner } from '../context'
import { renderText } from '../../render/lazy'
import type { RunContext } from '../context'

interface TranscriptionResultLike {
  id: string
  model: string
  text: string
  language?: string
  duration?: number
}

/**
 * `ts-ai transcribe` (speech-to-text) handler. The audio file is the positional
 * argument (`ts-ai transcribe ./talk.mp3`) or the first `--attachment`.
 */
export async function runTranscribe(
  ctx: RunContext,
  positional: Array<string>,
): Promise<void> {
  const attachment = Array.isArray(ctx.options.attachment)
    ? (ctx.options.attachment as Array<string>)[0]
    : undefined
  const audioPath = positional[0] ?? attachment
  if (!audioPath) {
    throw new CliError(
      'USAGE',
      'Provide an audio file: ts-ai transcribe ./audio.mp3',
    )
  }

  const { resolved, apiKey, adapterConfig, modelOptions } =
    resolveAdapterContext(ctx.options)
  const adapter = await instantiateAdapter({
    resolved,
    activity: 'transcription',
    apiKey,
    config: adapterConfig,
  })

  let audio: string
  try {
    // Adapters accept a base64 string / File / Blob / ArrayBuffer — NOT a Node
    // Buffer — so hand over base64.
    audio = (await readFile(audioPath)).toString('base64')
  } catch (cause) {
    throw new CliError('USAGE', `Cannot read audio file "${audioPath}".`, {
      cause,
    })
  }

  const result = (await withSpinner(
    ctx,
    `Transcribing with ${resolved.provider}/${resolved.model}…`,
    () =>
      generateTranscription({
        adapter: adapter as never,
        audio,
        language:
          typeof ctx.options.language === 'string'
            ? ctx.options.language
            : undefined,
        modelOptions: modelOptions as never,
        debug: false,
      }),
  )) as TranscriptionResultLike

  if (ctx.mode === 'pretty') {
    await renderText(result.text)
    return
  }
  emitJson({
    id: result.id,
    model: result.model,
    text: result.text,
    ...(result.language ? { language: result.language } : {}),
    ...(result.duration ? { duration: result.duration } : {}),
  })
}
