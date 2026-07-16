import { z } from 'zod'

/**
 * Shared Blog Studio helpers used by the server-fn pipeline and the
 * hooks-based client pipeline. Schema + prompt builders live here so both
 * paths draft the same shape and produce matching hero / narration inputs.
 *
 * The assistant version (`/blog-studio`) mirrors this schema on its API route
 * for the typed `useAssistant` client.
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
 * Build the hero-image prompt from a drafted post. Used by the server-side
 * server pipeline and by the client's "Regenerate hero image" button so both
 * produce the same style of illustration.
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
 * input over 4096 characters, and long posts easily exceed it).
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
