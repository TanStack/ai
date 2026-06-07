import { CliError } from './exit-codes'
import type { Activity } from '../manifest/types'

/**
 * Provider registry.
 *
 * Maps a `provider/model` slug onto the right `@tanstack/ai-<provider>` package,
 * dynamically imports it, and instantiates the correct adapter for the requested
 * activity. Every adapter factory in the ecosystem follows the uniform shape
 * `create<Provider><ActivityWord>(model, apiKey, config?)`, so resolution is a
 * matter of (a) picking the package, (b) reading the API key, and (c) calling
 * the factory whose name we derive from provider + activity.
 */

interface ProviderEntry {
  /** npm package name. */
  pkg: string
  /** Capitalized provider segment used in factory names, e.g. `Openai`. */
  factoryPrefix: string
  /** Bundled as a hard dependency (zero-install). */
  bundled: boolean
  /** Conventional env vars checked in order for the API key. */
  envKeys: Array<string>
  /**
   * How the factory receives the API key:
   * - `'apiKeyArg'` (default): `create(model, apiKey, config)` — openai, anthropic, …
   * - `'configObject'`: `create(model, { apiKey, ...config })` — fal.
   */
  configStyle?: 'apiKeyArg' | 'configObject'
  /**
   * Alternate factory name prefix to try when `create<Prefix><Activity>` is
   * absent — e.g. fal exposes `falImage` / `falVideo` rather than
   * `createFal<Activity>`.
   */
  altFactoryPrefix?: string
}

const PROVIDERS: Record<string, ProviderEntry> = {
  openai: {
    pkg: '@tanstack/ai-openai',
    factoryPrefix: 'Openai',
    bundled: true,
    envKeys: ['OPENAI_API_KEY'],
  },
  anthropic: {
    pkg: '@tanstack/ai-anthropic',
    factoryPrefix: 'Anthropic',
    bundled: true,
    envKeys: ['ANTHROPIC_API_KEY'],
  },
  gemini: {
    pkg: '@tanstack/ai-gemini',
    factoryPrefix: 'Gemini',
    bundled: true,
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  },
  openrouter: {
    pkg: '@tanstack/ai-openrouter',
    factoryPrefix: 'OpenRouter',
    bundled: true,
    envKeys: ['OPENROUTER_API_KEY'],
  },
  fal: {
    pkg: '@tanstack/ai-fal',
    factoryPrefix: 'Fal',
    bundled: true,
    envKeys: ['FAL_KEY'],
    configStyle: 'configObject',
    altFactoryPrefix: 'fal',
  },
  ollama: {
    pkg: '@tanstack/ai-ollama',
    factoryPrefix: 'Ollama',
    bundled: false,
    envKeys: ['OLLAMA_API_KEY'],
  },
  grok: {
    pkg: '@tanstack/ai-grok',
    factoryPrefix: 'Grok',
    bundled: false,
    envKeys: ['GROK_API_KEY', 'XAI_API_KEY'],
  },
  groq: {
    pkg: '@tanstack/ai-groq',
    factoryPrefix: 'Groq',
    bundled: false,
    envKeys: ['GROQ_API_KEY'],
  },
  elevenlabs: {
    pkg: '@tanstack/ai-elevenlabs',
    factoryPrefix: 'ElevenLabs',
    bundled: false,
    envKeys: ['ELEVENLABS_API_KEY'],
  },
}

/** Factory-name suffix per activity (the irregular `chat` -> `Chat`/text case included). */
const ACTIVITY_SUFFIX: Record<Activity, string> = {
  chat: 'Chat',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  speech: 'Speech',
  transcription: 'Transcription',
  summarize: 'Summarize',
}

export interface ResolvedModel {
  provider: string
  /** Bare model id with the provider prefix stripped. */
  model: string
  entry: ProviderEntry
}

/**
 * Parse a `--model` value into provider + model. Accepts the canonical
 * `provider/model` slug; a bare model id falls back to the popular-model lookup.
 */
export function resolveModelSlug(rawModel: string): ResolvedModel {
  const slashIndex = rawModel.indexOf('/')
  if (slashIndex > 0) {
    const provider = rawModel.slice(0, slashIndex)
    const model = rawModel.slice(slashIndex + 1)
    const entry = PROVIDERS[provider]
    if (!entry) {
      throw new CliError(
        'USAGE',
        `Unknown provider "${provider}". Known providers: ${Object.keys(PROVIDERS).join(', ')}.`,
      )
    }
    if (!model) {
      throw new CliError('USAGE', `Missing model after "${provider}/".`)
    }
    return { provider, model, entry }
  }

  const inferred = POPULAR_MODEL_PROVIDERS[rawModel]
  const inferredEntry = inferred ? PROVIDERS[inferred] : undefined
  if (!inferred || !inferredEntry) {
    throw new CliError(
      'USAGE',
      `Cannot infer a provider from "${rawModel}". Use the "provider/model" form, e.g. "openai/${rawModel}".`,
    )
  }
  return { provider: inferred, model: rawModel, entry: inferredEntry }
}

/**
 * Resolve the API key: explicit `--apiKey` wins, otherwise the first matching
 * conventional env var.
 */
export function resolveApiKey(
  entry: ProviderEntry,
  provider: string,
  explicitKey: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (explicitKey) return explicitKey
  for (const key of entry.envKeys) {
    const value = env[key]
    if (value) return value
  }
  throw new CliError(
    'USAGE',
    `No API key for "${provider}". Pass --apiKey or set ${entry.envKeys.join(' / ')}.`,
    { provider },
  )
}

/**
 * Dynamically import a provider package and instantiate the adapter for the
 * given activity. Throws a typed CliError if the package is missing
 * (exit 4) or the provider does not support the activity (exit 2).
 */
export async function instantiateAdapter(params: {
  resolved: ResolvedModel
  activity: Activity
  apiKey: string
  /** Adapter config (baseURL, modelOptions, etc.). */
  config?: Record<string, unknown>
}): Promise<unknown> {
  const { resolved, activity, apiKey, config } = params
  const { entry, provider, model } = resolved

  const mod = await importProvider(entry, provider)
  const moduleExports = mod as Record<string, unknown>

  // Chat factory naming varies by provider (Chat vs Text vs ResponsesText);
  // every other activity uses a single `create<Prefix><Activity>` name.
  const alt = entry.altFactoryPrefix
  const candidates =
    activity === 'chat'
      ? [
          `create${entry.factoryPrefix}Chat`,
          `create${entry.factoryPrefix}Text`,
          `create${entry.factoryPrefix}ResponsesText`,
          ...(alt ? [`${alt}Chat`, `${alt}Text`] : []),
        ]
      : [
          `create${entry.factoryPrefix}${ACTIVITY_SUFFIX[activity]}`,
          ...(alt ? [`${alt}${ACTIVITY_SUFFIX[activity]}`] : []),
        ]

  for (const name of candidates) {
    const factory = moduleExports[name]
    if (typeof factory === 'function') {
      const fn = factory as (...factoryArgs: Array<unknown>) => unknown
      return entry.configStyle === 'configObject'
        ? fn(model, { apiKey, ...config })
        : fn(model, apiKey, config)
    }
  }

  throw new CliError(
    'USAGE',
    `Provider "${provider}" does not support "${activity}" (tried: ${candidates.join(', ')}).`,
    { provider, detail: { activity } },
  )
}

async function importProvider(
  entry: ProviderEntry,
  provider: string,
): Promise<unknown> {
  try {
    return await import(entry.pkg)
  } catch (cause) {
    throw new CliError(
      'PROVIDER_NOT_INSTALLED',
      `Provider "${provider}" requires ${entry.pkg}. Install it: pnpm add ${entry.pkg}`,
      { provider, detail: { package: entry.pkg }, cause },
    )
  }
}

export function bundledProviders(): Array<string> {
  return Object.entries(PROVIDERS)
    .filter(([, entry]) => entry.bundled)
    .map(([name]) => name)
}

/**
 * Minimal popular-model -> provider table for the bare `--model` convenience
 * form. The documented form is always `provider/model`; this only covers a few
 * unambiguous flagships so quick one-offs work without the prefix.
 */
const POPULAR_MODEL_PROVIDERS: Record<string, string> = {
  'gpt-5.5': 'openai',
  'gpt-image-1': 'openai',
}
