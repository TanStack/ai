import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import type { AnyTextAdapter, Logger } from '@tanstack/ai'

export const Route = createFileRoute('/api/unknown-chat-options')({
  server: {
    handlers: {
      GET: async () => {
        const warnings: Array<string> = []
        const logger: Logger = {
          debug: () => {},
          info: () => {},
          warn: (message) => warnings.push(message),
          error: () => {},
        }
        const adapter = {
          kind: 'text',
          name: 'unknown-chat-options-test',
          model: 'test-model',
          '~types': {
            providerOptions: {} as Record<string, unknown>,
            inputModalities: ['text'],
            messageMetadataByModality: {
              text: undefined,
              image: undefined,
              audio: undefined,
              video: undefined,
              document: undefined,
            },
            toolCapabilities: [] as ReadonlyArray<string>,
            toolCallMetadata: undefined,
            systemPromptMetadata: undefined as never,
          },
          chatStream: () =>
            (async function* () {
              yield {
                type: 'RUN_STARTED',
                runId: 'run-1',
                threadId: 'thread-1',
                timestamp: Date.now(),
              }
              yield {
                type: 'RUN_FINISHED',
                runId: 'run-1',
                threadId: 'thread-1',
                finishReason: 'stop',
                timestamp: Date.now(),
              }
            })(),
          structuredOutput: async () => ({ data: {}, rawText: '{}' }),
        } as unknown as AnyTextAdapter

        const misplacedOptions = {
          providerOptions: { thinking: { type: 'enabled' } },
        }
        for await (const _chunk of chat({
          adapter,
          messages: [{ role: 'user', content: 'hello' }],
          ...misplacedOptions,
          debug: { logger },
        })) {
          // Drain the stream so the route exercises the complete chat path.
        }

        return Response.json({ warnings })
      },
    },
  },
})
