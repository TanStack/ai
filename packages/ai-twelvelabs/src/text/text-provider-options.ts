/**
 * Provider-specific options for the TwelveLabs Pegasus text (video
 * understanding) adapter. Threaded through `modelOptions` on a `chat()` /
 * `summarize()` call.
 *
 * @see https://docs.twelvelabs.io/v1.3/api-reference/analyze-videos
 */
export interface TwelveLabsTextProviderOptions {
  /**
   * Sampling temperature, `0`–`1`. Lower values are more deterministic.
   *
   * **Default:** `0.2`
   */
  temperature?: number

  /**
   * Maximum response length, in tokens.
   *
   * Pegasus 1.2: `2`–`4096`. Pegasus 1.5: `512`–`98304`. Defaults to `4096`.
   */
  maxTokens?: number

  /**
   * Start of the analysis window, in seconds. Use with `endTime` to analyze
   * only a portion of the video. Requires a Pegasus 1.5 model. The clip
   * (`endTime - startTime`) must be at least 4 seconds.
   */
  startTime?: number

  /**
   * End of the analysis window, in seconds. Use with `startTime`. Requires a
   * Pegasus 1.5 model.
   */
  endTime?: number

  /**
   * Analyze a previously uploaded TwelveLabs asset by id instead of supplying
   * the video inline in the message. When set, it takes precedence over any
   * video content part in the messages.
   */
  assetId?: string
}
