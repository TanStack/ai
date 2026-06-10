import type { RealtimeSessionConfig } from '@tanstack/ai'

/**
 * Builds the GA-shaped `session.update` payload for OpenAI's realtime API.
 *
 * The GA API requires `session.type` on every update and nests audio
 * settings under `audio.input` / `audio.output` (the flat Beta field names
 * were retired when the Beta shape was shut down on 2026-05-12). A
 * `session.update` containing unknown fields is rejected with
 * `unknown_parameter` and none of the config is applied, so the exact field
 * names here are load-bearing.
 *
 * `temperature` was removed from the GA session config and is intentionally
 * never sent; the adapter logs when it drops the option.
 */
export function buildSessionUpdate(
  config: Partial<RealtimeSessionConfig>,
): Record<string, unknown> {
  // Always enable input audio transcription so user speech is transcribed
  const audioInput: Record<string, unknown> = {
    transcription: { model: 'whisper-1' },
  }

  if (config.vadMode) {
    if (config.vadMode === 'semantic') {
      audioInput.turn_detection = {
        type: 'semantic_vad',
        eagerness: config.semanticEagerness ?? 'medium',
      }
    } else if (config.vadMode === 'server') {
      audioInput.turn_detection = {
        type: 'server_vad',
        threshold: config.vadConfig?.threshold ?? 0.5,
        prefix_padding_ms: config.vadConfig?.prefixPaddingMs ?? 300,
        silence_duration_ms: config.vadConfig?.silenceDurationMs ?? 500,
      }
    } else {
      audioInput.turn_detection = null
    }
  }

  const audio: Record<string, unknown> = { input: audioInput }

  if (config.voice) {
    audio.output = { voice: config.voice }
  }

  const sessionUpdate: Record<string, unknown> = {
    type: 'realtime',
    audio,
  }

  if (config.instructions) {
    sessionUpdate.instructions = config.instructions
  }

  if (config.tools !== undefined) {
    sessionUpdate.tools = config.tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    }))
    sessionUpdate.tool_choice = 'auto'
  }

  if (config.outputModalities) {
    sessionUpdate.output_modalities = config.outputModalities
  }

  if (config.maxOutputTokens !== undefined) {
    sessionUpdate.max_output_tokens = config.maxOutputTokens
  }

  return sessionUpdate
}
