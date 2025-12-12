import {
  createAnthropicSummarize,
  createAnthropicText,
} from '@tanstack/ai-anthropic'
import {
  createGeminiEmbed,
  createGeminiImage,
  createGeminiSummarize,
  createGeminiText,
} from '@tanstack/ai-gemini'
import {
  createOllamaEmbed,
  createOllamaSummarize,
  createOllamaText,
} from '@tanstack/ai-ollama'
import {
  createOpenaiEmbed,
  createOpenaiImage,
  createOpenaiSummarize,
  createOpenaiText,
} from '@tanstack/ai-openai'

/**
 * Adapter set containing all adapters for a provider
 */
export interface AdapterSet {
  /** Text/Chat adapter for conversational AI */
  textAdapter: any
  /** Summarize adapter for text summarization */
  summarizeAdapter?: any
  /** Embedding adapter for vector embeddings */
  embeddingAdapter?: any
  /** Image adapter for image generation */
  imageAdapter?: any
  /** Model to use for chat */
  chatModel: string
  /** Model to use for summarization */
  summarizeModel: string
  /** Model to use for embeddings */
  embeddingModel: string
  /** Model to use for image generation */
  imageModel?: string
}

/**
 * Definition for an adapter provider
 */
export interface AdapterDefinition {
  /** Unique identifier (lowercase) */
  id: string
  /** Human-readable name */
  name: string
  /** Environment variable key for API key (null if not required) */
  envKey: string | null
  /** Factory function to create adapters (returns null if env key is missing) */
  create: () => AdapterSet | null
}

// Model defaults from environment or sensible defaults
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022'
const ANTHROPIC_SUMMARY_MODEL =
  process.env.ANTHROPIC_SUMMARY_MODEL || ANTHROPIC_MODEL
const ANTHROPIC_EMBEDDING_MODEL =
  process.env.ANTHROPIC_EMBEDDING_MODEL || ANTHROPIC_MODEL

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const OPENAI_SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || OPENAI_MODEL
const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite'
const GEMINI_SUMMARY_MODEL = process.env.GEMINI_SUMMARY_MODEL || GEMINI_MODEL
const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || 'imagen-3.0-generate-002'

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b'
const OLLAMA_SUMMARY_MODEL = process.env.OLLAMA_SUMMARY_MODEL || OLLAMA_MODEL
const OLLAMA_EMBEDDING_MODEL =
  process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'

/**
 * Create Anthropic adapters
 */
function createAnthropicAdapters(): AdapterSet | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  return {
    textAdapter: createAnthropicText(apiKey),
    summarizeAdapter: createAnthropicSummarize(apiKey),
    // Anthropic does not support embeddings or image generation natively
    embeddingAdapter: undefined,
    imageAdapter: undefined,
    chatModel: ANTHROPIC_MODEL,
    summarizeModel: ANTHROPIC_SUMMARY_MODEL,
    embeddingModel: ANTHROPIC_EMBEDDING_MODEL,
  }
}

/**
 * Create OpenAI adapters
 */
function createOpenAIAdapters(): AdapterSet | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  return {
    textAdapter: createOpenaiText(apiKey),
    summarizeAdapter: createOpenaiSummarize(apiKey),
    embeddingAdapter: createOpenaiEmbed(apiKey),
    imageAdapter: createOpenaiImage(apiKey),
    chatModel: OPENAI_MODEL,
    summarizeModel: OPENAI_SUMMARY_MODEL,
    embeddingModel: OPENAI_EMBEDDING_MODEL,
    imageModel: OPENAI_IMAGE_MODEL,
  }
}

/**
 * Create Gemini adapters
 */
function createGeminiAdapters(): AdapterSet | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) return null

  return {
    textAdapter: createGeminiText(apiKey),
    summarizeAdapter: createGeminiSummarize(apiKey),
    embeddingAdapter: createGeminiEmbed(apiKey),
    imageAdapter: createGeminiImage(apiKey),
    chatModel: GEMINI_MODEL,
    summarizeModel: GEMINI_SUMMARY_MODEL,
    embeddingModel: GEMINI_EMBEDDING_MODEL,
    imageModel: GEMINI_IMAGE_MODEL,
  }
}

/**
 * Create Ollama adapters (no API key required)
 */
function createOllamaAdapters(): AdapterSet | null {
  return {
    textAdapter: createOllamaText(),
    summarizeAdapter: createOllamaSummarize(),
    embeddingAdapter: createOllamaEmbed(),
    // Ollama does not support image generation
    imageAdapter: undefined,
    chatModel: OLLAMA_MODEL,
    summarizeModel: OLLAMA_SUMMARY_MODEL,
    embeddingModel: OLLAMA_EMBEDDING_MODEL,
  }
}

/**
 * Registry of all available adapters
 */
export const ADAPTERS: Array<AdapterDefinition> = [
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    create: createOpenAIAdapters,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    create: createAnthropicAdapters,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    envKey: 'GEMINI_API_KEY',
    create: createGeminiAdapters,
  },

  {
    id: 'ollama',
    name: 'Ollama',
    envKey: null,
    create: createOllamaAdapters,
  },
]

/**
 * Get adapter definition by ID
 */
export function getAdapter(id: string): AdapterDefinition | undefined {
  return ADAPTERS.find((a) => a.id.toLowerCase() === id.toLowerCase())
}

/**
 * Get all adapter IDs
 */
export function getAdapterIds(): Array<string> {
  return ADAPTERS.map((a) => a.id)
}
