import type { Feature, Provider } from '@/lib/types'
import { getGuitars, compareGuitars, addToCart } from '@/lib/tools'

interface FeatureConfig {
  tools: Array<any>
  modelOptions: Record<string, any>
  modelOverrides?: Partial<Record<Provider, string>>
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
  'text-tool-text': {
    tools: [getGuitars],
    modelOptions: {},
  },
  'structured-output': {
    tools: [],
    modelOptions: {},
  },
  'agentic-structured': {
    tools: [getGuitars],
    modelOptions: {},
  },
  'multimodal-image': {
    tools: [],
    modelOptions: {},
  },
  'multimodal-structured': {
    tools: [],
    modelOptions: {},
  },
  summarize: {
    tools: [],
    modelOptions: {},
  },
  'summarize-stream': {
    tools: [],
    modelOptions: {},
  },
  'image-gen': {
    tools: [],
    modelOptions: {},
  },
  tts: {
    tools: [],
    modelOptions: {},
  },
  transcription: {
    tools: [],
    modelOptions: {},
  },
  'video-gen': {
    tools: [],
    modelOptions: {},
  },
}
