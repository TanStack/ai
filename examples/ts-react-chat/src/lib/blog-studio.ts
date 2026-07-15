import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import {
  chatPlugin,
  definePlugin,
  imagePlugin,
  speechPlugin,
} from '@tanstack/ai/plugin'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import { z } from 'zod'

/**
 * The shape a blog post is drafted into. The `drafting` chat plugin declares
 * this as its `outputSchema`, so its structured output is schema-validated and
 * the client's `drafting.sendMessage(topic)` resolves to a typed `BlogPost`.
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

export const BLOG_STUDIO_SYSTEM_PROMPT =
  'You are a seasoned staff writer. Given a topic, write one engaging, ' +
  'well-structured blog post. Return a title, a short subtitle, and the ' +
  'body as GitHub-flavored Markdown with section headings and tight ' +
  'paragraphs. Be vivid and concrete; avoid filler and clichés.'

/**
 * Build the hero-image prompt from a drafted post. Called on the client to
 * derive the `heroImage` plugin's input from the finished draft, so the
 * initial illustration and the "Regenerate hero image" button match.
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
 * input over 4096 characters, and long posts easily exceed it). Called on the
 * client to derive the `narration` plugin's input for both the initial
 * voice-over and the "Re-narrate" button.
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

/**
 * The blog-studio plugin: three independent plugins behind one endpoint.
 *
 * - `drafting` is a chat plugin that streams the post as structured output
 *   (schema-validated against {@link BlogPostSchema}).
 * - `heroImage` / `narration` are one-shot media plugins (image + TTS).
 *
 * There is no server-side composition: the client sequences these itself —
 * `drafting.sendMessage(topic)`, then `heroImage.run(...)` and
 * `narration.run(...)` in parallel (see the route). `definePlugin` is inert
 * until `handler(request)` runs, so importing this module into the browser
 * ships only the (inert) adapter code, never the API keys.
 */
export const blogPlugin = definePlugin({
  // Conversational plugin: writes the post as a typed object
  // (structured output + streaming).
  drafting: chatPlugin((req) =>
    chat({
      adapter: openaiText('gpt-5.5'),
      messages: req.messages,
      systemPrompts: [BLOG_STUDIO_SYSTEM_PROMPT],
      outputSchema: BlogPostSchema,
      stream: true,
      threadId: req.threadId,
      runId: req.runId,
    }),
  ),

  // One-shot media plugin: a landscape hero / OG image from a prompt.
  heroImage: imagePlugin((req) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: req.input.prompt,
      size: '1536x1024',
    }),
  ),

  // One-shot media plugin: narrate a piece of text.
  narration: speechPlugin((req) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: req.input.text,
      voice: 'alloy',
    }),
  ),
})
