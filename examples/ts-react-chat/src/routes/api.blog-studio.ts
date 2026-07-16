import { createFileRoute } from '@tanstack/react-router'
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { BLOG_STUDIO_SYSTEM_PROMPT, BlogPostSchema } from '../lib/blog-studio'

// Re-export so the assistant page can import schema + types from this route
// module (keeps client types in sync without pulling server adapters).

export const Route = createFileRoute('/api/blog-studio')({
  server: {
    handlers: {
      // One endpoint, three capabilities. `defineAssistant` is inert until
      // `handler(request)` runs, at which point it parses the AG-UI request,
      // routes by the `capability` discriminator the client sends, and streams
      // the result back over SSE.
      POST: async ({ request }) => {
        const assistant = defineAssistant({
          // Write the post as a typed object (structured output + streaming).
          chat: (req) =>
            chat({
              adapter: openaiText('gpt-5.5'),
              messages: req.messages,
              systemPrompts: [BLOG_STUDIO_SYSTEM_PROMPT],
              outputSchema: BlogPostSchema,
              stream: true,
              threadId: req.threadId,
              runId: req.runId,
            }),
          // Generate a landscape hero / OG image from the drafted title.
          image: (req) => {
            if (typeof req.prompt !== 'string') {
              throw new Error('image prompt must be a string')
            }
            return generateImage({
              adapter: openaiImage('gpt-image-2'),
              prompt: req.prompt,
              size: '1536x1024',
            })
          },
          // Narrate the post body.
          speech: (req) =>
            generateSpeech({
              adapter: openaiSpeech('tts-1'),
              text: req.text,
              voice: 'alloy',
            }),
        })

        return assistant.handler(request)
      },
    },
  },
})
