import { describe, expect, it } from 'vitest'
import { reconstructSpeechResult } from '../src'
import type { PersistedArtifactRef } from '@tanstack/ai/client'
import type { GenerationRestoredResult } from '../src/generation-types'

const audioArtifact: PersistedArtifactRef = {
  role: 'output',
  artifactId: 'artifact-speech-1',
  threadId: 'thread-tts',
  runId: 'run-tts',
  name: 'speech.mp3',
  mimeType: 'audio/mpeg',
  size: 1024,
  createdAt: '2026-07-06T00:00:00.000Z',
  url: '/api/artifacts?id=artifact-speech-1',
  source: {
    activity: 'tts',
    path: 'runs/run-tts/speech.mp3',
    provider: 'test',
    model: 'test-tts',
    mediaType: 'audio',
  },
}

const base: GenerationRestoredResult = {
  id: 'gen-1',
  model: 'test-tts',
  activity: 'tts',
  artifacts: [audioArtifact],
}

describe('reconstructSpeechResult', () => {
  it('rebuilds a TTSResult that surfaces the durable url via artifacts', () => {
    const result = reconstructSpeechResult(base)
    expect(result).not.toBeNull()
    expect(result!.audio).toBe('') // bytes are not persisted; url is in artifacts
    expect(result!.contentType).toBe('audio/mpeg')
    expect(result!.format).toBe('mpeg')
    expect(result!.artifacts?.[0]?.url).toBe('/api/artifacts?id=artifact-speech-1')
  })

  it('returns null when no audio output artifact carries a url', () => {
    expect(reconstructSpeechResult({ ...base, artifacts: [] })).toBeNull()
    expect(
      reconstructSpeechResult({
        ...base,
        artifacts: [{ ...audioArtifact, url: undefined }],
      }),
    ).toBeNull()
  })
})
