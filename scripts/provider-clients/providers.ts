/**
 * The modelschemas providers that get a generated client, and the package
 * that owns each one. A package that speaks another provider's API (Groq,
 * Grok, Azure, the gateways) reuses that provider's client instead of
 * getting its own copy.
 */
export interface ProviderClient {
  /** The modelschemas provider id. */
  id: string
  /** The package directory, relative to the repo root. */
  packageDir: string
  /** Write `types.ts` only, for a package that sends through another SDK. */
  typesOnly?: boolean
}

export const PROVIDER_CLIENTS: Array<ProviderClient> = [
  { id: 'openai', packageDir: 'packages/openai-base' },
  { id: 'anthropic', packageDir: 'packages/ai-anthropic' },
  { id: 'gemini', packageDir: 'packages/ai-gemini' },
  { id: 'mistral', packageDir: 'packages/ai-mistral' },
  {
    id: 'openrouter',
    packageDir: 'packages/ai-openrouter',
  },
  {
    id: 'elevenlabs',
    packageDir: 'packages/ai-elevenlabs',
  },
  { id: 'fal', packageDir: 'packages/ai-fal' },
  { id: 'cohere', packageDir: 'packages/ai-cohere' },
  { id: 'ollama', packageDir: 'packages/ai-ollama' },
  { id: 'worldlabs', packageDir: 'packages/ai-worldlabs' },
  { id: 'ollaya', packageDir: 'packages/ai-ollaya' },
  { id: 'typesafe', packageDir: 'packages/ai-typesafe' },
  { id: 'reactor', packageDir: 'packages/ai-reactor' },
  {
    id: 'amazon-bedrock',
    packageDir: 'packages/ai-bedrock',
    typesOnly: true,
  },
]

/** Where a provider client is written inside its package. */
export const GENERATED_DIR = 'src/generated/client'

/** Where the one shared Kubb fetch runtime is written. */
export const RUNTIME_DIR = 'packages/ai-utils/src/generated/kubb'

/** The module that every generated SDK imports the runtime from. */
export const RUNTIME_IMPORT = '@tanstack/ai-utils/kubb'
