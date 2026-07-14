import { createFileRoute } from '@tanstack/react-router'
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { defineAssistant } from '@tanstack/ai/assistant'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

/**
 * The shape a blog post is drafted into. The `chat` capability declares this
 * as its `outputSchema`, so `assistant.chat.sendMessage(...)` resolves to a
 * validated `{ title, subtitle, body } | null` on the client — no manual
 * parsing, and `assistant.chat.partial` streams a live draft.
 *
 * Exported so the client page (`blog-studio.tsx`) can import the same schema
 * and stay in type-sync. Only this schema lives at module scope; the actual
 * `defineAssistant` (with its server adapters) is built inside the POST
 * handler so importing the schema never pulls provider SDKs into the browser
 * bundle.
 */
export const BlogPostSchema = z.object({
  title: z.string().describe('A punchy, editorial blog post title'),
  subtitle: z.string().describe('A one-sentence standfirst / subtitle'),
  body: z
    .string()
    .describe(
      'The full blog post body as GitHub-flavored Markdown: use ## / ### ' +
        'headings, short paragraphs, and the occasional list. ~400-600 words.',
    ),
})

export type BlogPost = z.infer<typeof BlogPostSchema>

const SYSTEM_PROMPT =
  'You are a seasoned staff writer. Given a topic, write one engaging, ' +
  'well-structured blog post. Return a title, a short subtitle, and the ' +
  'body as GitHub-flavored Markdown with section headings and tight ' +
  'paragraphs. Be vivid and concrete; avoid filler and clichés.'

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
              systemPrompts: [SYSTEM_PROMPT],
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
