import { ConsoleLogger } from './console-logger'
import { InternalLogger } from './internal-logger'
import type { ResolvedCategories } from './internal-logger'
import type { DebugCategories, DebugConfig, DebugOption, Logger } from './types'

const ALL_OFF: ResolvedCategories = {
  provider: false,
  output: false,
  middleware: false,
  tools: false,
  agentLoop: false,
  config: false,
  errors: false,
  request: false,
}

const ALL_ON: ResolvedCategories = {
  provider: true,
  output: true,
  middleware: true,
  tools: true,
  agentLoop: true,
  config: true,
  errors: true,
  request: true,
}

const errorsOnlyCategories = (): ResolvedCategories => ({
  ...ALL_OFF,
  errors: true,
})

const resolveCategoriesFromPartial = (
  partial: DebugCategories,
): ResolvedCategories => ({
  provider: partial.provider ?? true,
  output: partial.output ?? true,
  middleware: partial.middleware ?? true,
  tools: partial.tools ?? true,
  agentLoop: partial.agentLoop ?? true,
  config: partial.config ?? true,
  errors: partial.errors ?? true,
  request: partial.request ?? true,
})

/**
 * Normalize a `DebugOption` into an `InternalLogger` ready to be threaded
 * through the library's activities and adapters. See the `DebugOption`
 * resolution table in the spec for the complete rules.
 *
 * - `undefined`: only the `errors` category is enabled; default `ConsoleLogger`.
 * - `true`: all categories enabled; default `ConsoleLogger`.
 * - `false`: all categories disabled (including `errors`); default `ConsoleLogger`.
 * - `DebugConfig`: each unspecified category defaults to `true`; an optional
 *   `logger` replaces the default `ConsoleLogger`.
 */
export function resolveDebugOption(
  debug: DebugOption | undefined,
): InternalLogger {
  if (debug === undefined) {
    return new InternalLogger(new ConsoleLogger(), errorsOnlyCategories())
  }
  if (debug === true) {
    return new InternalLogger(new ConsoleLogger(), ALL_ON)
  }
  if (debug === false) {
    return new InternalLogger(new ConsoleLogger(), ALL_OFF)
  }
  const { logger, ...cats }: DebugConfig = debug
  const userLogger: Logger = logger ?? new ConsoleLogger()
  return new InternalLogger(userLogger, resolveCategoriesFromPartial(cats))
}
