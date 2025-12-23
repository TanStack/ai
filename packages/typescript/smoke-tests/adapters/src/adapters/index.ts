import { anthropicSummarize, anthropicText } from '@tanstack/ai-anthropic'
import {
  geminiImage,
  geminiSpeech,
  geminiSummarize,
  geminiText,
} from '@tanstack/ai-gemini'
import { grokImage, grokSummarize, grokText } from '@tanstack/ai-grok'
import { ollamaSummarize, ollamaText } from '@tanstack/ai-ollama'
import {
  openaiImage,
  openaiSpeech,
  openaiSummarize,
  openaiText,
  openaiTranscription,
} from '@tanstack/ai-openai'

/**
 * Adapter set containing all adapters for a provider
 */
export interface AdapterSet {
  /** Text/Chat adapter for conversational AI */
  textAdapter: any
  /** Summarize adapter for text summarization */
  summarizeAdapter?: any
  /** Image adapter for image generation */
  imageAdapter?: any
  /** TTS adapter for text-to-speech */
  ttsAdapter?: any
  /** Transcription adapter for speech-to-text */
  transcriptionAdapter?: any
  /** Model to use for chat */
  chatModel: string
  /** Model to use for summarization */
  summarizeModel: string
  /** Model to use for image generation */
  imageModel?: string
  /** Model to use for TTS */
  ttsModel?: string
  /** Model to use for transcription */
  transcriptionModel?: string
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

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const OPENAI_SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || OPENAI_MODEL
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'tts-1'
const OPENAI_TRANSCRIPTION_MODEL =
  process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite'
const GEMINI_SUMMARY_MODEL = process.env.GEMINI_SUMMARY_MODEL || GEMINI_MODEL
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || 'imagen-3.0-generate-002'
const GEMINI_TTS_MODEL =
  process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b'
const OLLAMA_SUMMARY_MODEL = process.env.OLLAMA_SUMMARY_MODEL || OLLAMA_MODEL

const GROK_MODEL = process.env.GROK_MODEL || 'grok-3'
const GROK_SUMMARY_MODEL = process.env.GROK_SUMMARY_MODEL || GROK_MODEL
const GROK_IMAGE_MODEL = process.env.GROK_IMAGE_MODEL || 'grok-2-image-1212'

/**
 * Create Anthropic adapters
 */
function createAnthropicAdapters(): AdapterSet | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  return {
    textAdapter: anthropicText(ANTHROPIC_MODEL as any, { apiKey } as any),
    summarizeAdapter: anthropicSummarize(
      ANTHROPIC_SUMMARY_MODEL as any,
      { apiKey } as any,
    ),
    // Anthropic does not support image generation natively
    imageAdapter: undefined,
    chatModel: ANTHROPIC_MODEL,
    summarizeModel: ANTHROPIC_SUMMARY_MODEL,
  }
}

/**
 * Create OpenAI adapters
 */
function createOpenAIAdapters(): AdapterSet | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  return {
    textAdapter: openaiText(OPENAI_MODEL as any, { apiKey } as any),
    summarizeAdapter: openaiSummarize(
      OPENAI_SUMMARY_MODEL as any,
      { apiKey } as any,
    ),
    imageAdapter: openaiImage(OPENAI_IMAGE_MODEL as any, { apiKey } as any),
    ttsAdapter: openaiSpeech(OPENAI_TTS_MODEL as any, { apiKey } as any),
    transcriptionAdapter: openaiTranscription(
      OPENAI_TRANSCRIPTION_MODEL as any,
      { apiKey } as any,
    ),
    chatModel: OPENAI_MODEL,
    summarizeModel: OPENAI_SUMMARY_MODEL,
    imageModel: OPENAI_IMAGE_MODEL,
    ttsModel: OPENAI_TTS_MODEL,
    transcriptionModel: OPENAI_TRANSCRIPTION_MODEL,
  }
}

/**
 * Create Gemini adapters
 */
function createGeminiAdapters(): AdapterSet | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) return null

  return {
    textAdapter: geminiText(GEMINI_MODEL as any, { apiKey } as any),
    summarizeAdapter: geminiSummarize(
      GEMINI_SUMMARY_MODEL as any,
      { apiKey } as any,
    ),
    imageAdapter: geminiImage(GEMINI_IMAGE_MODEL as any, { apiKey } as any),
    ttsAdapter: geminiSpeech(GEMINI_TTS_MODEL as any, { apiKey } as any),
    chatModel: GEMINI_MODEL,
    summarizeModel: GEMINI_SUMMARY_MODEL,
    imageModel: GEMINI_IMAGE_MODEL,
    ttsModel: GEMINI_TTS_MODEL,
  }
}

/**
 * Create Ollama adapters (no API key required)
 */
function createOllamaAdapters(): AdapterSet | null {
  return {
    textAdapter: ollamaText(OLLAMA_MODEL as any),
    summarizeAdapter: ollamaSummarize(OLLAMA_SUMMARY_MODEL as any),
    // Ollama does not support image generation
    imageAdapter: undefined,
    chatModel: OLLAMA_MODEL,
    summarizeModel: OLLAMA_SUMMARY_MODEL,
  }
}

/**
 * Create Grok adapters
 */
function createGrokAdapters(): AdapterSet | null {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) return null

  return {
    textAdapter: grokText(GROK_MODEL as any, { apiKey } as any),
    summarizeAdapter: grokSummarize(
      GROK_SUMMARY_MODEL as any,
      { apiKey } as any,
    ),
    imageAdapter: grokImage(GROK_IMAGE_MODEL as any, { apiKey } as any),
    chatModel: GROK_MODEL,
    summarizeModel: GROK_SUMMARY_MODEL,
    imageModel: GROK_IMAGE_MODEL,
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
  {
    id: 'grok',
    name: 'Grok',
    envKey: 'XAI_API_KEY',
    create: createGrokAdapters,
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
