import { generateAudio } from '@tanstack/ai'
import { instantiateAdapter } from '../../core/providers'
import { emitJson } from '../../core/emit'
import { mediaSourceToBytes, writeArtifact } from '../artifact'
import { resolveAdapterContext, withSpinner } from '../context'
import { renderArtifactPath } from '../../render/lazy'
import type { RunContext } from '../context'

interface AudioResultLike {
  id: string
  model: string
  audio: {
    url?: string
    b64Json?: string
    contentType?: string
    duration?: number
  }
  usage?: unknown
}

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
}

/** `ts-ai audio` (music / sfx) handler. */
export async function runAudio(ctx: RunContext, prompt: string): Promise<void> {
  const { resolved, apiKey, adapterConfig, modelOptions } =
    resolveAdapterContext(ctx.options)
  const adapter = await instantiateAdapter({
    resolved,
    activity: 'audio',
    apiKey,
    config: adapterConfig,
  })

  const duration =
    typeof ctx.options.duration === 'number'
      ? ctx.options.duration
      : typeof ctx.options.duration === 'string'
        ? Number(ctx.options.duration)
        : undefined

  const result = (await withSpinner(
    ctx,
    `Generating audio with ${resolved.provider}/${resolved.model}…`,
    () =>
      generateAudio({
        adapter: adapter as never,
        prompt,
        duration,
        modelOptions: modelOptions as never,
        debug: false,
      }),
  )) as AudioResultLike

  const bytes = await mediaSourceToBytes(result.audio)
  const ext = EXT_BY_CONTENT_TYPE[result.audio.contentType ?? ''] ?? 'mp3'
  const output =
    typeof ctx.options.output === 'string' ? ctx.options.output : undefined
  const outputDir =
    typeof ctx.options.outputDir === 'string'
      ? ctx.options.outputDir
      : undefined
  const path = await writeArtifact(
    'audio',
    { bytes, ext, mimeType: result.audio.contentType ?? `audio/${ext}` },
    { output, outputDir },
    ctx.now,
  )

  if (ctx.mode === 'pretty') {
    await renderArtifactPath({
      label: `Audio generated with ${result.model}`,
      path: path ?? '(stdout)',
      meta: result.audio.duration
        ? { duration: `${result.audio.duration}s` }
        : undefined,
    })
    return
  }
  emitJson({
    id: result.id,
    model: result.model,
    path,
    mimeType: result.audio.contentType ?? `audio/${ext}`,
    usage: result.usage,
  })
}
