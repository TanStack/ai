import { describe, expect, it } from 'vitest'
import { twelvelabsText } from '../src/adapters/text'
import type { StreamChunk } from '@tanstack/ai'

const apiKey = process.env.TWELVELABS_API_KEY ?? process.env.TWELVE_LABS_API_KEY

// Gated: only runs when a real API key is present. No key in CI → skipped.
const maybe = apiKey ? describe : describe.skip

// A short, raw, TwelveLabs-ingestible sample clip (direct media URL).
const SAMPLE_VIDEO_URL =
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4'

function makeLogger() {
  const noop = () => {}
  return { request: noop, response: noop, provider: noop, errors: noop } as any
}

maybe('TwelveLabs Pegasus live analyze', () => {
  it('analyzes a public video and streams non-empty text', async () => {
    const adapter = twelvelabsText('pegasus1.5')
    const chunks: Array<StreamChunk> = []
    for await (const chunk of adapter.chatStream({
      model: 'pegasus1.5',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', content: 'Describe this video in one sentence.' },
            {
              type: 'video',
              source: { type: 'url', value: SAMPLE_VIDEO_URL },
            },
          ],
        },
      ],
      modelOptions: { maxTokens: 512 },
      logger: makeLogger(),
    })) {
      chunks.push(chunk)
    }

    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta: string }).delta)
      .join('')
    expect(text.length).toBeGreaterThan(0)
  }, 120_000)
})
