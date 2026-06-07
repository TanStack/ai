import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { instantiateAdapter } from '../../core/providers'
import { emitJson } from '../../core/emit'
import { CliError } from '../../core/exit-codes'
import { fetchBytes, writeArtifact } from '../artifact'
import { resolveAdapterContext } from '../context'
import { renderArtifactPath } from '../../render/lazy'
import type { RunContext } from '../context'

const POLL_INTERVAL_MS = 3000

/**
 * `ts-ai video` handler (experimental). Creates a job and, by default, blocks
 * until completion (polling, progress to stderr) then downloads the result.
 * `--no-wait` returns the job id immediately.
 */
export async function runVideo(ctx: RunContext, prompt: string): Promise<void> {
  const { resolved, apiKey, adapterConfig, modelOptions } = resolveAdapterContext(
    ctx.options,
  )
  const adapter = await instantiateAdapter({
    resolved,
    activity: 'video',
    apiKey,
    config: adapterConfig,
  })

  ctx.logger.info(`Creating video job with ${resolved.provider}/${resolved.model}…`)

  const job = await generateVideo({
    adapter: adapter as never,
    prompt,
    size: (typeof ctx.options.size === 'string' ? ctx.options.size : undefined) as never,
    modelOptions: modelOptions as never,
    debug: false,
  })

  if (ctx.options.wait === false) {
    if (ctx.mode === 'pretty') {
      await renderArtifactPath({ label: `Video job created (${job.model})`, path: job.jobId })
      return
    }
    emitJson({ jobId: job.jobId, model: job.model, status: 'pending' })
    return
  }

  const final = await pollToCompletion(ctx, adapter, job.jobId)
  if (final.status === 'failed' || !final.url) {
    throw new CliError('PROVIDER', `Video job failed: ${final.error ?? 'no URL returned'}.`, {
      provider: resolved.provider,
      detail: { jobId: job.jobId },
    })
  }

  const bytes = await fetchBytes(final.url)
  const output = typeof ctx.options.output === 'string' ? ctx.options.output : undefined
  const path = await writeArtifact('video', { bytes, ext: 'mp4', mimeType: 'video/mp4' }, output, ctx.now)

  if (ctx.mode === 'pretty') {
    await renderArtifactPath({ label: `Video generated with ${job.model}`, path: path ?? '(stdout)' })
    return
  }
  emitJson({ jobId: job.jobId, model: job.model, path, mimeType: 'video/mp4' })
}

/** `ts-ai video status <jobId>` — one-shot status check for an existing job. */
export async function runVideoStatus(ctx: RunContext, jobId: string): Promise<void> {
  const { resolved, apiKey, adapterConfig } = resolveAdapterContext(ctx.options)
  const adapter = await instantiateAdapter({
    resolved,
    activity: 'video',
    apiKey,
    config: adapterConfig,
  })
  const status = await getVideoJobStatus({ adapter: adapter as never, jobId })

  if (ctx.mode === 'pretty') {
    await renderArtifactPath({
      label: `Video job ${jobId}`,
      path: status.status,
      meta: {
        ...(status.progress != null ? { progress: `${status.progress}%` } : {}),
        ...(status.url ? { url: status.url } : {}),
        ...(status.error ? { error: status.error } : {}),
      },
    })
    return
  }
  emitJson({ jobId, ...status })
}

async function pollToCompletion(
  ctx: RunContext,
  adapter: unknown,
  jobId: string,
) {
  for (;;) {
    const status = await getVideoJobStatus({
      adapter: adapter as never,
      jobId,
    })
    ctx.logger.info(
      `job ${jobId}: ${status.status}${status.progress != null ? ` (${status.progress}%)` : ''}`,
    )
    if (status.status === 'completed' || status.status === 'failed') return status
    await sleep(POLL_INTERVAL_MS)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
