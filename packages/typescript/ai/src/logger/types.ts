/**
 * Pluggable logger interface consumed by every `@tanstack/ai` activity when `debug` is enabled. Supply a custom implementation via `debug: { logger }` on `chat()`, `summarize()`, `generateImage()`, etc. The four methods correspond to log levels: use `debug` for chunk-level diagnostic output, `info`/`warn` for notable events, `error` for caught exceptions.
 */
export interface Logger {
  /**
   * Called for chunk-level diagnostic output (raw provider chunks, per-chunk output, agent-loop iteration markers).
   * @param meta Structured data forwarded to the underlying logger. Loggers like pino will preserve this as a structured record; console-based loggers pass it as the second argument to `console.<level>`.
   */
  debug: (message: string, meta?: Record<string, unknown>) => void
  /**
   * Called for notable informational events (outgoing requests, tool invocations, middleware transitions).
   * @param meta Structured data forwarded to the underlying logger. Loggers like pino will preserve this as a structured record; console-based loggers pass it as the second argument to `console.<level>`.
   */
  info: (message: string, meta?: Record<string, unknown>) => void
  /**
   * Called for notable warnings that don't halt execution (deprecations, recoverable anomalies).
   * @param meta Structured data forwarded to the underlying logger. Loggers like pino will preserve this as a structured record; console-based loggers pass it as the second argument to `console.<level>`.
   */
  warn: (message: string, meta?: Record<string, unknown>) => void
  /**
   * Called for caught exceptions throughout the pipeline.
   * @param meta Structured data forwarded to the underlying logger. Loggers like pino will preserve this as a structured record; console-based loggers pass it as the second argument to `console.<level>`.
   */
  error: (message: string, meta?: Record<string, unknown>) => void
}

/**
 * Per-category toggles for debug logging. Each flag enables or disables one class of log message. Unspecified flags default to `true` when `DebugConfig` is partially specified; `undefined` on the `debug` option defaults all flags to `false` except `errors`.
 */
export interface DebugCategories {
  /**
   * Raw chunks/frames received from a provider SDK (OpenAI, Anthropic, Gemini, Ollama, Grok, Groq, OpenRouter, fal, ElevenLabs). Emitted inside every streaming adapter's chunk loop.
   */
  provider?: boolean
  /**
   * Chunks/results yielded to the consumer after all middleware. For streaming activities this fires per chunk; for non-streaming activities it fires once per result.
   */
  output?: boolean
  /**
   * Inputs and outputs around each middleware hook invocation. Chat-only.
   */
  middleware?: boolean
  /**
   * Before/after tool-call execution in the chat agent loop. Chat-only.
   */
  tools?: boolean
  /**
   * Iteration markers and phase transitions in the chat agent loop. Chat-only.
   */
  agentLoop?: boolean
  /**
   * Config transforms returned by middleware `onConfig` hooks. Chat-only.
   */
  config?: boolean
  /**
   * Caught errors throughout the pipeline. Unlike other categories, defaults to `true` even when `debug` is unspecified. Explicitly set `errors: false` or `debug: false` to silence.
   */
  errors?: boolean
  /**
   * Outgoing call metadata (provider, model, message/tool counts) emitted before each adapter SDK call.
   */
  request?: boolean
}

/**
 * Granular debug configuration combining per-category toggles with an optional custom logger. Any unspecified category flag defaults to `true`.
 */
export interface DebugConfig extends DebugCategories {
  /**
   * Custom `Logger` implementation. When omitted, a default `ConsoleLogger` routes output to `console.debug`/`info`/`warn`/`error`.
   */
  logger?: Logger
}

/**
 * The shape accepted by the `debug` option on every `@tanstack/ai` activity. Pass `true` to enable all categories with the default console logger; `false` to silence everything including errors; an object for granular control.
 */
export type DebugOption = boolean | DebugConfig
