/**
 * Capabilities `ListFoundationModels` does not report (tool & reasoning support).
 * Hand-maintained; merged with the generated catalog at runtime. Keyed by model
 * id / inference-profile id.
 */
export interface ModelOverride {
  features?: Array<'tools' | 'reasoning' | 'json_schema'>
}

export const BEDROCK_MODEL_OVERRIDES: Record<string, ModelOverride> = {
  'openai.gpt-oss-120b-1:0': { features: ['tools', 'reasoning'] },
  'openai.gpt-oss-20b-1:0': { features: ['tools', 'reasoning'] },
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    features: ['tools', 'reasoning'],
  },
  'us.anthropic.claude-haiku-4-5-20251001-v1:0': { features: ['tools'] },
  'us.anthropic.claude-3-7-sonnet-20250219-v1:0': {
    features: ['tools', 'reasoning'],
  },
  'us.anthropic.claude-3-5-sonnet-20241022-v2:0': { features: ['tools'] },
  'us.anthropic.claude-3-5-haiku-20241022-v1:0': { features: ['tools'] },
  'us.amazon.nova-pro-v1:0': { features: ['tools'] },
  'us.amazon.nova-lite-v1:0': { features: ['tools'] },
  'us.amazon.nova-micro-v1:0': { features: ['tools'] },
  'us.meta.llama3-3-70b-instruct-v1:0': { features: ['tools'] },
  'us.meta.llama4-maverick-17b-instruct-v1:0': { features: ['tools'] },
  'us.mistral.pixtral-large-2502-v1:0': { features: ['tools'] },
  'us.deepseek.r1-v1:0': { features: ['reasoning'] },
}
