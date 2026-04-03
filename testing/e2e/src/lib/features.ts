import type { Feature, Provider } from '@/lib/types'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { getGuitars, compareGuitars, addToCart } from '@/lib/tools'
import { guitarRecommendationSchema, imageAnalysisSchema } from '@/lib/schemas'

interface FeatureConfig {
  tools: Array<any>
  modelOptions: Record<string, any>
  modelOverrides?: Partial<Record<Provider, string>>
  outputSchema?: StandardSchemaV1
  stream?: boolean
  dedicatedRoute?: string
}

export const featureConfigs: Record<Feature, FeatureConfig> = {
  chat: {
    tools: [],
    modelOptions: {},
  },
  'one-shot-text': {
    tools: [],
    modelOptions: {},
    stream: false,
  },
  reasoning: {
    tools: [],
    modelOptions: { reasoning: { effort: 'high' } },
    modelOverrides: {
      openai: 'o3',
      anthropic: 'claude-sonnet-4-5',
    },
  },
  'multi-turn': {
    tools: [],
    modelOptions: {},
  },
  'tool-calling': {
    tools: [getGuitars],
    modelOptions: {},
  },
  'parallel-tool-calls': {
    tools: [getGuitars, compareGuitars],
    modelOptions: {},
  },
  'tool-approval': {
    tools: [addToCart],
    modelOptions: {},
  },
  'structured-output': {
    tools: [],
    modelOptions: {},
    outputSchema: guitarRecommendationSchema,
  },
  'agentic-structured': {
    tools: [getGuitars],
    modelOptions: {},
    outputSchema: guitarRecommendationSchema,
  },
  'multimodal-image': {
    tools: [],
    modelOptions: {},
  },
  'multimodal-structured': {
    tools: [],
    modelOptions: {},
    outputSchema: imageAnalysisSchema,
  },
  summarize: {
    tools: [],
    modelOptions: {},
    stream: false,
    dedicatedRoute: '/api/summarize',
  },
  'summarize-stream': {
    tools: [],
    modelOptions: {},
    dedicatedRoute: '/api/summarize',
  },
  'image-gen': {
    tools: [],
    modelOptions: {},
    dedicatedRoute: '/api/image',
  },
  tts: {
    tools: [],
    modelOptions: {},
    dedicatedRoute: '/api/tts',
  },
  transcription: {
    tools: [],
    modelOptions: {},
    dedicatedRoute: '/api/transcription',
  },
}
