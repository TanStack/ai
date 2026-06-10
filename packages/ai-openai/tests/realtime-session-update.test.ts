import { describe, expect, it } from 'vitest'
import { buildSessionUpdate } from '../src/realtime/session-update'

describe('buildSessionUpdate (GA session.update shape)', () => {
  it('always stamps session.type="realtime" and enables input transcription', () => {
    expect(buildSessionUpdate({})).toEqual({
      type: 'realtime',
      audio: { input: { transcription: { model: 'whisper-1' } } },
    })
  })

  it('nests voice under audio.output.voice', () => {
    const session = buildSessionUpdate({ voice: 'marin' })
    expect(session.audio).toEqual({
      input: { transcription: { model: 'whisper-1' } },
      output: { voice: 'marin' },
    })
  })

  it('nests semantic turn detection under audio.input.turn_detection', () => {
    const session = buildSessionUpdate({
      vadMode: 'semantic',
      semanticEagerness: 'high',
    })
    expect(session.audio).toEqual({
      input: {
        transcription: { model: 'whisper-1' },
        turn_detection: { type: 'semantic_vad', eagerness: 'high' },
      },
    })
  })

  it('applies server VAD defaults under audio.input.turn_detection', () => {
    const session = buildSessionUpdate({ vadMode: 'server' })
    expect(session.audio).toEqual({
      input: {
        transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    })
  })

  it('disables turn detection for manual VAD mode', () => {
    const session = buildSessionUpdate({ vadMode: 'manual' })
    expect(session.audio).toEqual({
      input: {
        transcription: { model: 'whisper-1' },
        turn_detection: null,
      },
    })
  })

  it('uses GA field names output_modalities and max_output_tokens', () => {
    const session = buildSessionUpdate({
      outputModalities: ['audio'],
      maxOutputTokens: 4096,
    })
    expect(session.output_modalities).toEqual(['audio'])
    expect(session.max_output_tokens).toBe(4096)
  })

  it('maps tools to the realtime function shape with tool_choice auto', () => {
    const session = buildSessionUpdate({
      tools: [
        {
          name: 'getWeather',
          description: 'Get the weather',
          inputSchema: { type: 'object', properties: { city: {} } },
        },
        { name: 'noSchema', description: 'No schema tool' },
      ],
    })
    expect(session.tools).toEqual([
      {
        type: 'function',
        name: 'getWeather',
        description: 'Get the weather',
        parameters: { type: 'object', properties: { city: {} } },
      },
      {
        type: 'function',
        name: 'noSchema',
        description: 'No schema tool',
        parameters: { type: 'object', properties: {} },
      },
    ])
    expect(session.tool_choice).toBe('auto')
  })

  it('never emits Beta field names (GA rejects the whole update on unknown_parameter)', () => {
    const session = buildSessionUpdate({
      instructions: 'Be helpful.',
      voice: 'marin',
      vadMode: 'server',
      outputModalities: ['audio', 'text'],
      temperature: 0.7,
      maxOutputTokens: 1024,
    })
    for (const betaField of [
      'voice',
      'modalities',
      'turn_detection',
      'input_audio_transcription',
      'max_response_output_tokens',
      'temperature',
    ]) {
      expect(session).not.toHaveProperty(betaField)
    }
  })
})
