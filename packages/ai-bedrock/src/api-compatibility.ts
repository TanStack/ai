/**
 * Bedrock API compatibility config. First matching `match` substring wins.
 * Transcribed from:
 * https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html
 * mantlePath is transcribed from each model card's Programmatic Access URL
 * (default /v1). Put more specific matches first.
 *
 * `models` lists ids the AWS ListFoundationModels call does not return so
 * `scripts/fetch-bedrock-models.ts` can still emit them.
 */
export type BedrockMantlePath = '/v1' | '/openai/v1'

export interface BedrockSeedModel {
  id: string
  input: ReadonlyArray<string>
}

export interface BedrockCompatibilityRule {
  match: string
  converse: boolean
  chat: boolean
  responses: boolean
  mantlePath?: BedrockMantlePath
  models?: ReadonlyArray<BedrockSeedModel>
}

export interface BedrockCompatibility {
  converse: boolean
  chat: boolean
  responses: boolean
  mantlePath: BedrockMantlePath
}

export const BEDROCK_API_COMPATIBILITY: ReadonlyArray<BedrockCompatibilityRule> =
  [
    { match: 'openai.gpt-oss', converse: true, chat: true, responses: true },
    {
      match: 'anthropic.claude',
      converse: true,
      chat: false,
      responses: false,
    },
    { match: 'amazon.nova', converse: true, chat: false, responses: false },
    { match: 'meta.llama', converse: true, chat: false, responses: false },
    { match: 'ai21.jamba', converse: true, chat: false, responses: false },
    { match: 'cohere.command', converse: true, chat: false, responses: false },
    { match: 'deepseek.r1', converse: true, chat: false, responses: false },
    { match: 'deepseek', converse: true, chat: true, responses: false },
    {
      match: 'mistral.pixtral',
      converse: true,
      chat: false,
      responses: false,
    },
    { match: 'mistral', converse: true, chat: true, responses: false },
    { match: 'qwen', converse: true, chat: true, responses: false },
    {
      match: 'google.gemma-4-',
      converse: false,
      chat: true,
      responses: true,
      mantlePath: '/openai/v1',
      models: [
        { id: 'google.gemma-4-31b', input: ['text', 'image'] },
        { id: 'google.gemma-4-26b-a4b', input: ['text', 'image'] },
        { id: 'google.gemma-4-e2b', input: ['text', 'image'] },
      ],
    },
    {
      match: 'google.gemma',
      converse: true,
      chat: true,
      responses: false,
      mantlePath: '/v1',
    },
  ]

const DEFAULT_COMPAT: BedrockCompatibility = {
  converse: true,
  chat: false,
  responses: false,
  mantlePath: '/v1',
}

export function lookupBedrockCompatibility(id: string): BedrockCompatibility {
  for (const rule of BEDROCK_API_COMPATIBILITY) {
    if (id.includes(rule.match)) {
      return {
        converse: rule.converse,
        chat: rule.chat,
        responses: rule.responses,
        mantlePath: rule.mantlePath ?? '/v1',
      }
    }
  }
  return DEFAULT_COMPAT
}

/** Mantle OpenAI path from the compatibility config. Unknown ids stay on `/v1`. */
export function mantlePathForModel(
  model: string | undefined,
): BedrockMantlePath {
  if (typeof model !== 'string') return '/v1'
  return lookupBedrockCompatibility(model).mantlePath
}
