import { generateImage } from '@tanstack/ai'
import { instantiateAdapter } from '../../core/providers'
import { emitJson } from '../../core/emit'
import { mediaSourceToBytes, writeArtifact } from '../artifact'
import { resolveAdapterContext } from '../context'
import { renderImageResult } from '../../render/lazy'
import type { RunContext } from '../context'

interface GeneratedImageLike {
  url?: string
  b64Json?: string
  revisedPrompt?: string
}
interface ImageResultLike {
  id: string
  model: string
  images: Array<GeneratedImageLike>
  usage?: unknown
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** `ts-ai image` handler. */
export async function runImage(ctx: RunContext, prompt: string): Promise<void> {
  const { resolved, apiKey, adapterConfig, modelOptions } = resolveAdapterContext(
    ctx.options,
  )
  const adapter = await instantiateAdapter({
    resolved,
    activity: 'image',
    apiKey,
    config: adapterConfig,
  })

  ctx.logger.info(`Generating image with ${resolved.provider}/${resolved.model}…`)

  const result = (await generateImage({
    // The CLI resolves adapters at runtime; the static generic shape is erased.
    adapter: adapter as never,
    prompt,
    numberOfImages: numberValue(ctx.options.count) ?? 1,
    size: stringValue(ctx.options.size) as never,
    modelOptions: modelOptions as never,
    debug: false,
  })) as ImageResultLike

  const output = stringValue(ctx.options.output)
  const written: Array<{ path: string | null; mimeType: string; revisedPrompt?: string }> = []

  for (const [index, image] of result.images.entries()) {
    const bytes = await mediaSourceToBytes(image)
    const mimeType = 'image/png'
    const ext = EXT_BY_MIME[mimeType] ?? 'png'
    // Only the first image honors an explicit -o; subsequent ones get a suffix.
    const target =
      index === 0 ? output : output && output !== '-' ? suffixPath(output, index) : undefined
    const path = await writeArtifact('image', { bytes, ext, mimeType }, target, ctx.now + index)
    written.push({ path, mimeType, revisedPrompt: image.revisedPrompt })
  }

  if (ctx.mode === 'pretty') {
    const previewable: Array<{ path: string; revisedPrompt?: string }> = []
    for (const w of written) {
      if (w.path) previewable.push({ path: w.path, revisedPrompt: w.revisedPrompt })
    }
    await renderImageResult({
      model: result.model,
      images: previewable,
      preview: ctx.options.preview !== false,
    })
    return
  }

  emitJson({
    id: result.id,
    model: result.model,
    images: written.map((w) => ({
      path: w.path,
      mimeType: w.mimeType,
      ...(w.revisedPrompt ? { revisedPrompt: w.revisedPrompt } : {}),
    })),
    usage: result.usage,
  })
}

function suffixPath(path: string, index: number): string {
  const dot = path.lastIndexOf('.')
  if (dot <= 0) return `${path}-${index}`
  return `${path.slice(0, dot)}-${index}${path.slice(dot)}`
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}
function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isNaN(n) ? undefined : n
  }
  return undefined
}
