import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'
import tailwindcss from '@tailwindcss/vite'
import {
  chat,
  chatParamsFromRequestBody,
  maxIterations,
  mergeAgentTools,
  toServerSentEventsStream,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import dotenv from 'dotenv'

dotenv.config()

export default defineConfig({
  plugins: [
    angular(),
    tailwindcss(),
    {
      name: 'api-handler',
      configureServer(server) {
        server.middlewares.use('/api/chat', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }
          let body = ''
          for await (const chunk of req) body += chunk

          let params
          try {
            params = await chatParamsFromRequestBody(JSON.parse(body))
          } catch (error) {
            res.statusCode = 400
            res.end(error instanceof Error ? error.message : 'Bad request')
            return
          }

          try {
            const abortController = new AbortController()
            const stream = chat({
              adapter: openaiText('gpt-5.5'),
              tools: Object.values(mergeAgentTools({}, params.tools)),
              systemPrompts: ['You are a helpful assistant.'],
              agentLoopStrategy: maxIterations(10),
              messages: params.messages,
              threadId: params.threadId,
              runId: params.runId,
              abortController,
            })
            const readable = toServerSentEventsStream(stream, abortController)
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')
            const reader = readable.getReader()
            const pump = async () => {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                res.write(value)
              }
              res.end()
            }
            pump().catch(() => res.end())
          } catch (error: any) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error?.message ?? 'error' }))
          }
        })
      },
    },
  ],
})
