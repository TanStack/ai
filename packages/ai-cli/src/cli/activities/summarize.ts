import { summarize } from '@tanstack/ai'
import { instantiateAdapter } from '../../core/providers'
import { emitJson } from '../../core/emit'
import { CliError } from '../../core/exit-codes'
import { resolveAdapterContext, withSpinner } from '../context'
import { renderText } from '../../render/lazy'
import type { RunContext } from '../context'

interface SummaryResultLike {
  id: string
  model: string
  summary: string
  usage?: unknown
}

type SummaryStyle = 'bullet-points' | 'paragraph' | 'concise'

/** `ts-ai summarize` handler. */
export async function runSummarize(
  ctx: RunContext,
  text: string,
): Promise<void> {
  const { resolved, apiKey, adapterConfig, modelOptions } =
    resolveAdapterContext(ctx.options)
  const adapter = await instantiateAdapter({
    resolved,
    activity: 'summarize',
    apiKey,
    config: adapterConfig,
  })

  const focus = Array.isArray(ctx.options.focus)
    ? (ctx.options.focus as Array<string>)
    : undefined
  const maxLength =
    typeof ctx.options.maxLength === 'number'
      ? ctx.options.maxLength
      : typeof ctx.options.maxLength === 'string'
        ? Number(ctx.options.maxLength)
        : undefined
  if (
    maxLength !== undefined &&
    (!Number.isInteger(maxLength) || maxLength < 1)
  ) {
    throw new CliError('USAGE', '--max-length must be a positive integer.')
  }

  const result = (await withSpinner(
    ctx,
    `Summarizing with ${resolved.provider}/${resolved.model}…`,
    () =>
      summarize({
        adapter: adapter as never,
        text,
        maxLength,
        style: ctx.options.style as SummaryStyle | undefined,
        focus,
        modelOptions: modelOptions as never,
        debug: false,
      }),
  )) as SummaryResultLike

  if (ctx.mode === 'pretty') {
    await renderText(result.summary)
    return
  }
  emitJson({
    id: result.id,
    model: result.model,
    summary: result.summary,
    usage: result.usage,
  })
}
