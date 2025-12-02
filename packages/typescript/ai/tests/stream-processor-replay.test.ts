import { describe, it, expect } from 'vitest'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { StreamProcessor } from '../src/stream'
import type { ChunkRecording } from '../src/stream/types'

async function loadFixture(name: string): Promise<ChunkRecording> {
  const fixturePath = join(__dirname, 'fixtures', `${name}.json`)
  const content = await readFile(fixturePath, 'utf-8')
  return JSON.parse(content)
}

describe('StreamProcessor - Replay from Fixtures', () => {
  it('should replay text-simple.json correctly', async () => {
    const recording = await loadFixture('text-simple')
    const result = await StreamProcessor.replay(recording)

    expect(result.content).toBe('Hello world!')
    expect(result.finishReason).toBe('stop')
    expect(result.toolCalls).toBeUndefined()
  })

  it('should replay tool-call-parallel.json correctly', async () => {
    const recording = await loadFixture('tool-call-parallel')
    const result = await StreamProcessor.replay(recording)

    expect(result.content).toBe('')
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls?.[0]?.function.name).toBe('getWeather')
    expect(result.toolCalls?.[0]?.function.arguments).toBe(
      '{"location":"Paris"}',
    )
    expect(result.toolCalls?.[1]?.function.name).toBe('getTime')
    expect(result.toolCalls?.[1]?.function.arguments).toBe('{"city":"Tokyo"}')
    expect(result.finishReason).toBe('tool_calls')
  })

  it('should match expected result from recording', async () => {
    const recording = await loadFixture('text-simple')
    const result = await StreamProcessor.replay(recording)

    // Verify result matches the expected result in the recording
    expect(result.content).toBe(recording.result?.content)
    expect(result.finishReason).toBe(recording.result?.finishReason)
  })
})
