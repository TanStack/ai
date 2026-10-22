import type { DebugCategories, Logger } from '@tanstack/ai'

/**
 * `logger`, but a method that throws, or whose promise rejects, does
 * nothing. A broken logger must not stop the harness.
 */
export function safeLogger(logger: Logger) {
  const guard = (call: () => unknown) => {
    try {
      const result = call()
      // An async logger can reject. Unhandled, that can stop the process.
      if (result instanceof Promise) result.catch(() => {})
    } catch {
      // ponytail: the line is lost. There is no safe place to report it.
    }
  }
  return {
    debug: (...args: Parameters<Logger['debug']>) =>
      guard(() => logger.debug(...args)),
    info: (...args: Parameters<Logger['info']>) =>
      guard(() => logger.info(...args)),
    warn: (...args: Parameters<Logger['warn']>) =>
      guard(() => logger.warn(...args)),
    error: (...args: Parameters<Logger['error']>) =>
      guard(() => logger.error(...args)),
  }
}

/**
 * The `debug` option of the chat() calls of the harness: only the `errors`
 * category, to `logger`. Each category has a value, so a new category of
 * `@tanstack/ai` is a type error here.
 */
export function errorsOnlyDebug(logger: Logger) {
  return {
    logger,
    errors: true,
    provider: false,
    output: false,
    middleware: false,
    tools: false,
    agentLoop: false,
    config: false,
    request: false,
    sandbox: false,
  } satisfies Required<DebugCategories> & { logger: Logger }
}
