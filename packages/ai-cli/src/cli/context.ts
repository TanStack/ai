import { loadConfig, mergeOptions } from '../core/config'
import { resolveOutputMode } from '../core/output'
import { CliLogger } from '../core/logger'
import { startSpinner } from '../core/spinner'
import { resolveApiKey, resolveModelSlug } from '../core/providers'
import { CliError } from '../core/exit-codes'
import type { OutputMode } from '../core/output'
import type { ResolvedModel } from '../core/providers'

/**
 * Everything a command handler needs after common flags are resolved: the
 * merged option bag (flags > config), the output mode, a stderr logger, and a
 * progress spinner.
 */
export interface RunContext {
  mode: OutputMode
  logger: CliLogger
  /** Merged options: parsed flags layered over the `--config` object. */
  options: Record<string, unknown>
  /** Wall-clock used for deterministic artifact naming within one invocation. */
  now: number
  /** Start a progress spinner (stderr); returns a stop function. No-op when --quiet. */
  spinner: (label: string) => () => void
}

export async function createRunContext(
  rawFlags: Record<string, unknown>,
): Promise<RunContext> {
  const config = await loadConfig(rawFlags.config as string | undefined)
  const options = mergeOptions(rawFlags, config)
  const mode = resolveOutputMode({
    json: Boolean(options.json),
    stream: Boolean(options.stream),
  })
  const quiet = Boolean(options.quiet)
  const logger = new CliLogger({ verbose: Boolean(options.verbose), quiet })
  const spinner = (label: string) => (quiet ? () => {} : startSpinner(label))
  return { mode, logger, options, now: Date.now(), spinner }
}

/** Run `fn` with a progress spinner showing `label` until it settles. */
export async function withSpinner<T>(
  ctx: RunContext,
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const stop = ctx.spinner(label)
  try {
    return await fn()
  } finally {
    stop()
  }
}

export interface ResolvedAdapterContext {
  resolved: ResolvedModel
  apiKey: string
  adapterConfig: Record<string, unknown>
  modelOptions: Record<string, unknown> | undefined
}

/** Resolve model slug + API key + adapter config from the merged options. */
export function resolveAdapterContext(
  options: Record<string, unknown>,
): ResolvedAdapterContext {
  const model = options.model
  if (typeof model !== 'string' || !model) {
    throw new CliError('USAGE', 'Missing --model (e.g. openai/gpt-5.5).')
  }
  const resolved = resolveModelSlug(model)
  const apiKey = resolveApiKey(
    resolved.entry,
    resolved.provider,
    options.apiKey as string | undefined,
  )
  const modelOptions =
    typeof options.modelOptions === 'object' && options.modelOptions !== null
      ? (options.modelOptions as Record<string, unknown>)
      : undefined
  const baseURL =
    typeof options.baseURL === 'string' ? { baseURL: options.baseURL } : {}
  return {
    resolved,
    apiKey,
    adapterConfig: { ...baseURL },
    modelOptions,
  }
}
