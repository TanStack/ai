/**
 * Adapter definitions for multi-adapter testing
 *
 * Follows the pattern from smoke-tests/adapters
 */

import type { AnyTextAdapter } from '@tanstack/ai'

/**
 * Result of creating an adapter
 */
export interface AdapterSet {
  adapter: AnyTextAdapter
  model: string
}

/**
 * Definition for an adapter provider
 */
export interface AdapterDefinition {
  /** Unique identifier (lowercase) */
  id: string
  /** Human-readable name */
  name: string
  /** Environment variable key for API key */
  envKey: string
  /** Factory function to create adapter (returns null if env key is missing) */
  create: () => Promise<AdapterSet | null>
}

// Model defaults from environment or sensible defaults
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o'
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

/**
 * Create OpenAI adapter
 */
async function createOpenAIAdapter(): Promise<AdapterSet | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  try {
    const { openaiText } = await import('@tanstack/ai-openai')
    return {
      adapter: openaiText(OPENAI_MODEL as any, { apiKey } as any),
      model: OPENAI_MODEL,
    }
  } catch (error) {
    console.error('Failed to load OpenAI adapter:', error)
    return null
  }
}

/**
 * Create Anthropic adapter
 */
async function createAnthropicAdapter(): Promise<AdapterSet | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const { anthropicText } = await import('@tanstack/ai-anthropic')
    return {
      adapter: anthropicText(ANTHROPIC_MODEL as any, { apiKey } as any),
      model: ANTHROPIC_MODEL,
    }
  } catch (error) {
    console.error('Failed to load Anthropic adapter:', error)
    return null
  }
}

/**
 * Create Gemini adapter
 */
async function createGeminiAdapter(): Promise<AdapterSet | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) return null

  try {
    const { geminiText } = await import('@tanstack/ai-gemini')
    return {
      adapter: geminiText(GEMINI_MODEL as any, { apiKey } as any),
      model: GEMINI_MODEL,
    }
  } catch (error) {
    console.error('Failed to load Gemini adapter:', error)
    return null
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
    create: createOpenAIAdapter,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    create: createAnthropicAdapter,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    envKey: 'GEMINI_API_KEY',
    create: createGeminiAdapter,
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
