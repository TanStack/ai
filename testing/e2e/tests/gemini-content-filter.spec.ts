import { createServer } from 'node:http'
import { test, expect } from '@playwright/test'
import { chat } from '@tanstack/ai'
import { createGeminiChat } from '@tanstack/ai-gemini'

for (const finishReason of ['SAFETY', 'RECITATION', 'BLOCKLIST']) {
  test(`Gemini ${finishReason} reaches chat consumers as content_filter`, async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.end(
        `data: ${JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [] }, finishReason }],
          usageMetadata: {
            promptTokenCount: 4,
            candidatesTokenCount: 0,
            totalTokenCount: 4,
          },
        })}\n\n`,
      )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Missing server port')
      }
      const adapter = createGeminiChat('gemini-2.5-pro', 'test-key', {
        baseURL: `http://127.0.0.1:${address.port}`,
      })
      const finishes = []
      const errors = []
      for await (const chunk of chat({
        adapter,
        threadId: 'gemini-content-filter',
        messages: [{ role: 'user', content: 'Continue' }],
      })) {
        if (chunk.type === 'RUN_FINISHED') {
          finishes.push(chunk.metadata?.tanstack?.finishReason)
        }
        if (chunk.type === 'RUN_ERROR') errors.push(chunk)
      }
      expect(finishes).toEqual(['content_filter'])
      expect(errors).toEqual([])
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
}
