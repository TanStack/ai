import { z } from 'zod'

// ========================================
// Output Format Types
// ========================================

export type OutputFormat = 'blog' | 'scifi' | 'gameshow' | 'country' | 'trivia'

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
    value: 'scifi',
    label: 'Sci-Fi Story',
    icon: '🚀',
    description: 'Three-act space opera with characters',
  },
  {
    value: 'gameshow',
    label: 'Game Show Pitch',
    icon: '🎮',
    description: 'TV show concept with rounds and prizes',
  },
  {
    value: 'country',
    label: 'Country Song',
    icon: '🎸',
    description: 'Nashville ballad with verses and chorus',
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
// Sci-Fi Story Schema
// ========================================

export const SciFiCharacterSchema = z.object({
  name: z.string().describe('Character name'),
  role: z
    .string()
    .describe('Role in the story (Protagonist, Antagonist, etc.)'),
  description: z.string().describe('Brief character description'),
})

export const SciFiActSchema = z.object({
  title: z.string().describe('Act title'),
  content: z.string().describe('Act narrative content'),
})

export const SciFiStorySchema = z.object({
  title: z.string().describe('Story title'),
  setting: z.string().describe('Story setting and world description'),
  characters: z.array(SciFiCharacterSchema).describe('Main characters'),
  act1: SciFiActSchema.describe('First act - setup'),
  act2: SciFiActSchema.describe('Second act - confrontation'),
  act3: SciFiActSchema.describe('Third act - resolution'),
  moral: z.string().describe('The moral or lesson of the story'),
})

export type SciFiStory = z.infer<typeof SciFiStorySchema>

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
// Country Song Schema
// ========================================

export const CountrySongSchema = z.object({
  title: z.string().describe('Song title'),
  artist: z.string().describe('Fictional artist name'),
  album: z.string().describe('Album name'),
  key: z.string().describe('Musical key (e.g., G Major)'),
  tempo: z.string().describe('Tempo description'),
  verse1: z.string().describe('First verse lyrics'),
  chorus: z.string().describe('Chorus lyrics'),
  verse2: z.string().describe('Second verse lyrics'),
  bridge: z.string().describe('Bridge lyrics'),
  outro: z.string().describe('Outro/ending'),
  spotifyDescription: z.string().describe('Spotify-style song description'),
})

export type CountrySong = z.infer<typeof CountrySongSchema>

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
  | { format: 'scifi'; data: SciFiStory }
  | { format: 'gameshow'; data: GameShowPitch }
  | { format: 'country'; data: CountrySong }
  | { format: 'trivia'; data: TriviaSet }

// ========================================
// Schema Lookup
// ========================================

export function getSchemaForFormat(format: OutputFormat) {
  switch (format) {
    case 'blog':
      return BlogPostSchema
    case 'scifi':
      return SciFiStorySchema
    case 'gameshow':
      return GameShowPitchSchema
    case 'country':
      return CountrySongSchema
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

    case 'scifi':
      return `After your analysis, transform your findings into an epic three-act science fiction story.
Use the libraries/packages as characters or factions in a galactic struggle.
Make the technical details into dramatic plot points. Be creative and entertaining while staying true to the data.`

    case 'gameshow':
      return `After your analysis, pitch a TV game show concept based on your findings.
The show should test contestants on the knowledge you've gathered.
Make it fun, energetic, and include creative rounds that reference the actual data.`

    case 'country':
      return `After your analysis, write a heartfelt country song about your findings.
Use the technical data as metaphors for life, love, and loss.
Include rhyming verses, a memorable chorus, and that classic country storytelling style.`

    case 'trivia':
      return `After your analysis, create a trivia quiz based on the facts you've discovered.
Each question should test real knowledge from your research.
Include the source of each fact and explain why each answer is correct.`
  }
}
