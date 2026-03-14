import { z } from 'zod'

// ========================================
// Output Format Types
// ========================================

export type OutputFormat = 'blog' | 'gameshow' | 'trivia'

export const OUTPUT_FORMAT_OPTIONS: Array<{
  value: OutputFormat
  label: string
  icon: string
  description: string
}> = [
  {
    value: 'blog',
    label: 'Blog Post',
    icon: '📝',
    description: 'Professional article with SEO metadata',
  },
  {
    value: 'gameshow',
    label: 'Game Show Pitch',
    icon: '🎮',
    description: 'TV show concept with rounds and prizes',
  },
  {
    value: 'trivia',
    label: 'Trivia Questions',
    icon: '❓',
    description: 'Interactive quiz with explanations',
  },
]

// ========================================
// Blog Post Schema
// ========================================

export const BlogPostSchema = z.object({
  title: z.string().describe('Compelling article title'),
  description: z.string().describe('SEO meta description, 150-160 characters'),
  tags: z.array(z.string()).describe('Relevant topic tags'),
  publishedAt: z.string().describe('Publication date in ISO format'),
  readingTime: z.number().describe('Estimated reading time in minutes'),
  body: z.string().describe('Full article body in markdown format'),
})

export type BlogPost = z.infer<typeof BlogPostSchema>

// ========================================
// Game Show Pitch Schema
// ========================================

export const GameShowRoundSchema = z.object({
  name: z.string().describe('Round name'),
  description: z.string().describe('How the round works'),
  points: z.number().describe('Points available in this round'),
})

export const GameShowPrizesSchema = z.object({
  grand: z.string().describe('Grand prize description'),
  consolation: z.string().describe('Consolation prize description'),
})

export const GameShowPitchSchema = z.object({
  title: z.string().describe('Show title'),
  tagline: z.string().describe('Catchy show tagline'),
  format: z.string().describe('Show format description'),
  hostStyle: z.string().describe('Description of ideal host personality'),
  rounds: z.array(GameShowRoundSchema).describe('Game rounds'),
  prizes: GameShowPrizesSchema.describe('Available prizes'),
  catchphrases: z.array(z.string()).describe('Memorable host catchphrases'),
  pilotEpisodeTheme: z.string().describe('Theme for the pilot episode'),
})

export type GameShowPitch = z.infer<typeof GameShowPitchSchema>

// ========================================
// Trivia Questions Schema
// ========================================

export const TriviaQuestionSchema = z.object({
  question: z.string().describe('The trivia question'),
  options: z.array(z.string()).describe('Four answer options'),
  correctAnswer: z.number().describe('Index of correct answer (0-3)'),
  explanation: z.string().describe('Why this answer is correct'),
  source: z.string().describe('Data source for the fact'),
})

export const TriviaSetSchema = z.object({
  category: z.string().describe('Quiz category name'),
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('Difficulty level'),
  questions: z.array(TriviaQuestionSchema).describe('Quiz questions'),
})

export type TriviaSet = z.infer<typeof TriviaSetSchema>

// ========================================
// Union Type for All Outputs
// ========================================

export type StructuredOutput =
  | { format: 'blog'; data: BlogPost }
  | { format: 'gameshow'; data: GameShowPitch }
  | { format: 'trivia'; data: TriviaSet }

// ========================================
// Schema Lookup
// ========================================

export function getSchemaForFormat(format: OutputFormat) {
  switch (format) {
    case 'blog':
      return BlogPostSchema
    case 'gameshow':
      return GameShowPitchSchema
    case 'trivia':
      return TriviaSetSchema
  }
}

// ========================================
// Format-specific System Prompt Additions
// ========================================

export function getFormatPromptAddition(format: OutputFormat): string {
  switch (format) {
    case 'blog':
      return `After your analysis, format your findings as a professional blog post. 
Use the actual data and insights from your analysis to write an engaging, SEO-friendly article.
The body should be in markdown format with proper headings, lists, and emphasis.`

    case 'gameshow':
      return `After your analysis, pitch a TV game show concept based on your findings.
The show should test contestants on the knowledge you've gathered.
Make it fun, energetic, and include creative rounds that reference the actual data.`

    case 'trivia':
      return `After your analysis, create a trivia quiz based on the facts you've discovered.
Each question should test real knowledge from your research.
Include the source of each fact and explain why each answer is correct.`
  }
}
