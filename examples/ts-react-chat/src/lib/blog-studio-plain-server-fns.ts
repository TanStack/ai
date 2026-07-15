import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { chat, generateImage, generateSpeech } from '@tanstack/ai'
import { openaiImage, openaiSpeech, openaiText } from '@tanstack/ai-openai'
import {
  BlogPostSchema,
  BLOG_STUDIO_SYSTEM_PROMPT,
  forNarration,
  heroPromptFor,
} from './blog-studio'

/**
 * Server-composed pipeline: draft → (hero ∥ narration).
 * One server function, plain activities — no transaction layer, no custom
 * progress protocol. The client just awaits the result.
 */
export const createBlogPostFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ topic: z.string().min(1) }))
  .handler(async ({ data }) => {
    const post = await chat({
      adapter: openaiText('gpt-5.5'),
      messages: [
        { role: 'user', content: `Write a blog post about: ${data.topic}` },
      ],
      systemPrompts: [BLOG_STUDIO_SYSTEM_PROMPT],
      outputSchema: BlogPostSchema,
    })

    const [hero, audio] = await Promise.all([
      generateImage({
        adapter: openaiImage('gpt-image-2'),
        prompt: heroPromptFor(post),
        size: '1536x1024',
      }),
      generateSpeech({
        adapter: openaiSpeech('tts-1'),
        text: forNarration(post.body),
        voice: 'alloy',
      }),
    ])

    return { post, hero, audio }
  })

/** One-shot regenerate — same models as the pipeline. */
export const regenerateBlogHeroFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ prompt: z.string().min(1) }))
  .handler(({ data }) =>
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: data.prompt,
      size: '1536x1024',
    }),
  )

export const regenerateBlogNarrationFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ text: z.string().min(1) }))
  .handler(({ data }) =>
    generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: data.text,
      voice: 'alloy',
    }),
  )
