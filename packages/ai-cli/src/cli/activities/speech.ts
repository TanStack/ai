import { generateSpeech } from '@tanstack/ai'
import { instantiateAdapter } from '../../core/providers'
import { emitJson } from '../../core/emit'
import { writeArtifact } from '../artifact'
import { resolveAdapterContext } from '../context'
import { renderArtifactPath } from '../../render/lazy'
import type { RunContext } from '../context'

interface TTSResultLike {
  id: string
  model: string
  audio: string
  format: string
  duration?: number
}

type SpeechFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'

/** `ts-ai speech` (text-to-speech) handler. */
export async function runSpeech(ctx: RunContext, text: string): Promise<void> {
  const { resolved, apiKey, adapterConfig, modelOptions } = resolveAdapterContext(
    ctx.options,
  )
  const adapter = await instantiateAdapter({
    resolved,
    activity: 'speech',
    apiKey,
    config: adapterConfig,
  })

  ctx.logger.info(`Synthesizing speech with ${resolved.provider}/${resolved.model}…`)

  const result = (await generateSpeech({
    adapter: adapter as never,
    text,
    voice: str(ctx.options.voice),
    format: str(ctx.options.format) as SpeechFormat | undefined,
    speed: num(ctx.options.speed),
    modelOptions: modelOptions as never,
    debug: false,
  })) as TTSResultLike

  const bytes = new Uint8Array(Buffer.from(result.audio, 'base64'))
  const ext = result.format || 'mp3'
  const path = await writeArtifact(
    'speech',
    { bytes, ext, mimeType: `audio/${ext}` },
    str(ctx.options.output),
    ctx.now,
  )

  if (ctx.mode === 'pretty') {
    await renderArtifactPath({
      label: `Speech generated with ${result.model}`,
      path: path ?? '(stdout)',
      meta: result.duration ? { duration: `${result.duration}s` } : undefined,
    })
    return
  }
  emitJson({
    id: result.id,
    model: result.model,
    path,
    format: ext,
    ...(result.duration ? { duration: result.duration } : {}),
  })
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined
}
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isNaN(n) ? undefined : n
  }
  return undefined
}
