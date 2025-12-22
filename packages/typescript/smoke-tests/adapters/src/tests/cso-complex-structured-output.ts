import { chat } from '@tanstack/ai'
import { z } from 'zod'
import { writeDebugFile } from '../harness'
import type { AdapterContext, TestOutcome } from '../harness'

// Schema for YouTube video chapters
const ChaptersSchema = z.array(
  z.object({
    start: z.string().describe('Timestamp in format "0:00" or "00:00"'),
    title: z.string().min(3).describe('Chapter title'),
  }),
)

// Schema for YouTube video metadata
const YouTubeSchema = z.object({
  title: z
    .string()
    .min(10)
    .max(70)
    .describe('Video title optimized for YouTube SEO'),
  description: z
    .string()
    .min(50)
    .describe('Video description with keywords and call-to-action'),
  tags: z
    .array(z.string())
    .min(5)
    .max(25)
    .describe('SEO tags for video discovery'),
  chapters: ChaptersSchema.optional().describe(
    'Video chapters with timestamps',
  ),
})

// Schema for social media posts
const SocialSchema = z.object({
  x: z.object({
    main: z.string().max(280).describe('Main tweet'),
    thread: z
      .array(z.string().max(280))
      .max(3)
      .optional()
      .describe('Optional thread continuation'),
  }),
  bluesky: z.object({
    post: z.string().max(300).describe('Bluesky post'),
  }),
  linkedin: z.object({
    post: z.string().min(50).describe('LinkedIn post with professional tone'),
    hashtags: z
      .array(z.string())
      .max(10)
      .optional()
      .describe('Professional hashtags'),
  }),
  reddit: z.object({
    title: z
      .string()
      .min(10)
      .max(180)
      .describe('Reddit post title that sparks discussion'),
    body: z.string().min(50).describe('Reddit post body with context'),
  }),
})

// Schema for blog post
const BlogSchema = z.object({
  title: z.string().min(10).max(120).describe('SEO-friendly blog title'),
  content: z.string().min(200).describe('Blog post content in markdown format'),
})

// Combined output schema
const OutputSchema = z.object({
  youtube: YouTubeSchema,
  socials: SocialSchema,
  blog: BlogSchema,
})

type ContentOutput = z.infer<typeof OutputSchema>

const SYSTEM_PROMPT = `You are a content marketing expert who creates comprehensive promotional content packages.

When given a topic or product, you generate:
1. YouTube video metadata (title, description, tags, optional chapters)
2. Social media posts for X/Twitter, Bluesky, LinkedIn, and Reddit
3. A blog post

Guidelines:
- YouTube titles should be catchy and SEO-optimized (10-70 chars)
- YouTube descriptions should include keywords and be engaging (50+ chars)
- Include 5-25 relevant tags for YouTube
- X/Twitter posts must be under 280 characters
- Bluesky posts must be under 300 characters
- LinkedIn posts should be professional (50+ chars)
- Reddit titles should spark discussion (10-180 chars)
- Reddit body should provide context (50+ chars)
- Blog titles should be SEO-friendly (10-120 chars)
- Blog content should be informative (200+ chars)

Format chapters as timestamps like "0:00", "1:30", "5:45" etc.`

/**
 * CSO: Complex Structured Output Test
 *
 * Tests complex structured output generation using a nested Zod schema
 * representing a multi-platform content marketing package.
 */
export async function runCSO(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'cso-complex-structured-output'
  const adapterName = adapterContext.adapterName

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model: adapterContext.model,
    timestamp: new Date().toISOString(),
  }

  try {
    const result = (await chat({
      adapter: adapterContext.textAdapter,
      systemPrompts: [SYSTEM_PROMPT],
      messages: [
        {
          role: 'user' as const,
          content:
            'Create a content marketing package for a new open-source TypeScript library called "TanStack AI" that provides type-safe, provider-agnostic AI SDK for building AI-powered applications.',
        },
      ],
      outputSchema: OutputSchema,
      // Complex structured output requires more tokens
      maxTokens: 4096,
    })) as ContentOutput

    // Validate the structure
    const issues: Array<string> = []

    // YouTube validation
    const hasYouTube = result.youtube !== undefined
    if (!hasYouTube) {
      issues.push('missing youtube')
    } else {
      if (
        typeof result.youtube.title !== 'string' ||
        result.youtube.title.length < 10
      ) {
        issues.push('youtube.title too short or invalid')
      }
      if (result.youtube.title.length > 70) {
        issues.push('youtube.title too long')
      }
      if (
        typeof result.youtube.description !== 'string' ||
        result.youtube.description.length < 50
      ) {
        issues.push('youtube.description too short or invalid')
      }
      if (
        !Array.isArray(result.youtube.tags) ||
        result.youtube.tags.length < 5
      ) {
        issues.push('youtube.tags missing or too few')
      }
      if (result.youtube.tags && result.youtube.tags.length > 25) {
        issues.push('youtube.tags too many')
      }
    }

    // Socials validation
    const hasSocials = result.socials !== undefined
    if (!hasSocials) {
      issues.push('missing socials')
    } else {
      // X/Twitter
      if (!result.socials.x?.main) {
        issues.push('socials.x.main missing')
      } else if (result.socials.x.main.length > 280) {
        issues.push('socials.x.main too long')
      }

      // Bluesky
      if (!result.socials.bluesky?.post) {
        issues.push('socials.bluesky.post missing')
      } else if (result.socials.bluesky.post.length > 300) {
        issues.push('socials.bluesky.post too long')
      }

      // LinkedIn
      if (!result.socials.linkedin?.post) {
        issues.push('socials.linkedin.post missing')
      } else if (result.socials.linkedin.post.length < 50) {
        issues.push('socials.linkedin.post too short')
      }

      // Reddit
      if (!result.socials.reddit?.title) {
        issues.push('socials.reddit.title missing')
      } else {
        if (result.socials.reddit.title.length < 10) {
          issues.push('socials.reddit.title too short')
        }
        if (result.socials.reddit.title.length > 180) {
          issues.push('socials.reddit.title too long')
        }
      }
      if (!result.socials.reddit?.body) {
        issues.push('socials.reddit.body missing')
      } else if (result.socials.reddit.body.length < 50) {
        issues.push('socials.reddit.body too short')
      }
    }

    // Blog validation
    const hasBlog = result.blog !== undefined
    if (!hasBlog) {
      issues.push('missing blog')
    } else {
      if (
        typeof result.blog.title !== 'string' ||
        result.blog.title.length < 10
      ) {
        issues.push('blog.title too short or invalid')
      }
      if (result.blog.title.length > 120) {
        issues.push('blog.title too long')
      }
      if (
        typeof result.blog.content !== 'string' ||
        result.blog.content.length < 200
      ) {
        issues.push('blog.content too short or invalid')
      }
    }

    const passed = issues.length === 0

    debugData.summary = {
      result,
      hasYouTube,
      hasSocials,
      hasBlog,
      youtubeTagCount: result.youtube?.tags?.length,
      youtubeTitleLength: result.youtube?.title?.length,
      xPostLength: result.socials?.x?.main?.length,
      blueskyPostLength: result.socials?.bluesky?.post?.length,
      linkedinPostLength: result.socials?.linkedin?.post?.length,
      redditTitleLength: result.socials?.reddit?.title?.length,
      redditBodyLength: result.socials?.reddit?.body?.length,
      blogTitleLength: result.blog?.title?.length,
      blogContentLength: result.blog?.content?.length,
    }
    debugData.result = {
      passed,
      error: issues.length ? issues.join(', ') : undefined,
    }

    await writeDebugFile(adapterName, testName, debugData)

    console.log(
      `[${adapterName}] ${passed ? '✅' : '❌'} ${testName}${
        passed ? '' : `: ${debugData.result.error}`
      }`,
    )

    return { passed, error: debugData.result.error }
  } catch (error: any) {
    const message = error?.message || String(error)
    debugData.summary = { error: message }
    debugData.result = { passed: false, error: message }
    await writeDebugFile(adapterName, testName, debugData)
    console.log(`[${adapterName}] ❌ ${testName}: ${message}`)
    return { passed: false, error: message }
  }
}
