import { createFileRoute } from '@tanstack/react-router'
import { convertMessagesToModelMessages } from '@tanstack/ai'
import type { ModelMessage, UIMessage } from '@tanstack/ai'

/**
 * Provider-free harness for the UIMessage -> ModelMessage identity contract.
 * The route keeps this regression at the public server boundary without
 * starting a provider request or requiring an API key.
 */
export const Route = createFileRoute('/api/message-ids')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          messages: Array<UIMessage | ModelMessage>
        }

        return Response.json(convertMessagesToModelMessages(body.messages))
      },
    },
  },
})
