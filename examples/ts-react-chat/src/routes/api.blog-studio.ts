import { createFileRoute } from '@tanstack/react-router'
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

/**
 * The shape a blog post is drafted into. The `drafting` chat verb declares
 * this as its `outputSchema`, so its structured output is schema-validated —
 * both when the client talks to it directly and when the `blogPost`
 * transaction runs it server-side via `ctx.call`.
 *
 * Exported so the client page (`blog-studio.tsx`) can import the same schema
 * and stay in type-sync. Only client-safe values (this schema and the two
 * pure string helpers below) live at module scope; the actual
 * `defineTransaction` (with its server adapters) is built inside the POST
 * handler so importing them never pulls provider SDKs into the browser
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

/**
 * Build the hero-image prompt from a drafted post. Used by the server-side
 * `blogPost` transaction and by the client's "Regenerate hero image" button,
 * so both produce the same style of illustration.
 */
export function heroPromptFor(post: BlogPost): string {
  return (
    `A striking editorial hero image for a blog post titled ` +
    `"${post.title}". ${post.subtitle}. Modern, clean, cinematic, ` +
    `high quality, no text.`
  )
}

/**
 * Prepare the post body for narration: strip Markdown so TTS doesn't read the
 * syntax aloud, and cap the length at a sentence boundary (OpenAI TTS rejects
 * input over 4096 characters, and long posts easily exceed it). Used by the
 * server-side `blogPost` transaction and by the client's "Re-narrate" button.
 */
export function forNarration(markdown: string, max = 4000): string {
  const plain = markdown
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s*[-*+]\s+/gm, '') // list bullets
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1') // italic
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → link text
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (plain.length <= max) return plain
  const clipped = plain.slice(0, max)
  const boundary = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('\n'),
  )
  return (boundary > max / 2 ? clipped.slice(0, boundary + 1) : clipped).trim()
}

export const Route = createFileRoute('/api/blog-studio')({
  server: {
    handlers: {
      // One endpoint, four verbs. `defineTransaction` is inert until
      // `handler(request)` runs, at which point it parses the AG-UI request,
      // routes by the `verb` discriminator the client sends, and streams the
      // result back over SSE.
      POST: async ({ request }) => {
        // Conversational verb: writes the post as a typed object
        // (structured output + streaming).
        const drafting = chatVerb((req) =>
          chat({
            adapter: openaiText('gpt-5.5'),
            messages: req.messages,
            systemPrompts: [SYSTEM_PROMPT],
            outputSchema: BlogPostSchema,
            stream: true,
            threadId: req.threadId,
            runId: req.runId,
          }),
        )

        // One-shot verb: a landscape hero / OG image from a prompt.
        const heroImage = verb({
          input: z.object({ prompt: z.string() }),
          execute: ({ input }) =>
            generateImage({
              adapter: openaiImage('gpt-image-2'),
              prompt: input.prompt,
              size: '1536x1024',
            }),
        })

        // One-shot verb: narrate a piece of text.
        const narration = verb({
          input: z.object({ text: z.string() }),
          execute: ({ input }) =>
            generateSpeech({
              adapter: openaiSpeech('tts-1'),
              text: input.text,
              voice: 'alloy',
            }),
        })

        // The transaction: one client call composes the three verbs above,
        // entirely server-side. Each `ctx.call` streams back to the client as
        // a live, tagged sub-run of this single request — and the whole
        // pipeline shares one abort scope (client disconnect / stop() cancels
        // everything).
        const blogPost = verb({
          input: z.object({ topic: z.string() }),
          execute: async ({ input }, ctx) => {
            // 1. Draft the post. `ctx.call` on a chat verb resolves with the
            //    accumulated text and the structured output; re-validate it so
            //    a half-finished draft fails the run with a clear error.
            const draft = await ctx.call(drafting, [
              {
                role: 'user',
                content: `Write a blog post about: ${input.topic}`,
              },
            ])
            const parsed = BlogPostSchema.safeParse(draft.structured)
            if (!parsed.success) {
              throw new Error(
                `Drafting did not produce a valid blog post: ${parsed.error.message}`,
              )
            }
            const post = parsed.data

            // 2. Illustrate and narrate in parallel, both derived from the
            //    validated draft.
            const [hero, audio] = await Promise.all([
              ctx.call(heroImage, { prompt: heroPromptFor(post) }),
              ctx.call(narration, { text: forNarration(post.body) }),
            ])

            // 3. The return value becomes the run's final result on the
            //    client (`txn.blogPost.result`).
            return { post, hero, audio }
          },
        })

        const transaction = defineTransaction({
          drafting,
          heroImage,
          narration,
          blogPost,
        })

        return transaction.handler(request)
      },
    },
  },
})
