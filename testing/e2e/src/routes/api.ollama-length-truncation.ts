import { createServer } from 'node:http'
import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOllamaChat } from '@tanstack/ai-ollama'

/**
 * Streams one Ollama chat that stops at the `num_predict` limit
 * (`done_reason: 'length'`). aimock always answers Ollama with
 * `done_reason: 'stop'`, so this route serves the NDJSON stream itself from a
 * throwaway local server. Returns the `finishReason` of the
 * `RUN_FINISHED` chunk.
 */
export const Route = createFileRoute('/api/ollama-length-truncation')({
  server: {
    handlers: {
      POST: async () => {
        const stub = createServer((req, res) => {
          req.resume()
          res.writeHead(200, { 'content-type': 'application/x-ndjson' })
          const base = {
            model: 'mistral',
            created_at: new Date().toISOString(),
          }
          res.write(
            JSON.stringify({
              ...base,
              message: { role: 'assistant', content: 'Hello there, my' },
              done: false,
            }) + '\n',
          )
          res.end(
            JSON.stringify({
              ...base,
              message: { role: 'assistant', content: '' },
              done: true,
              done_reason: 'length',
              prompt_eval_count: 13,
              eval_count: 3,
            }) + '\n',
          )
        })
        await new Promise<void>((resolve) =>
          stub.listen(0, '127.0.0.1', () => resolve()),
        )
        const { port } = stub.address() as { port: number }

        let runError: Record<string, unknown> | undefined
        let finishReason: string | null | undefined
        try {
          const adapter = createOllamaChat('mistral', {
            baseURL: `http://127.0.0.1:${port}`,
          })
          for await (const chunk of chat({
            threadId: 'ollama-length-truncation',
            adapter,
            messages: [{ role: 'user', content: 'say hello in five words' }],
          })) {
            if (chunk.type === 'RUN_ERROR') runError = { code: chunk.code }
            if (chunk.type === 'RUN_FINISHED') {
              finishReason = chunk.metadata?.tanstack?.finishReason
            }
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        } finally {
          stub.close()
        }

        return Response.json({ ok: true, runError, finishReason })
      },
    },
  },
})
