
import type { OpenRouterBaseOptions, OpenRouterCommonOptions } from './text/text-provider-options'
  
const AI21_JAMBA_LARGE_1_7 =  {
    id: 'ai21/jamba-large-1.7',
    name: 'AI21: Jamba Large 1.7',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 256000,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0,
        },
        output: {
          normal: 8,
        },
      },
      image: 0,
    },
  } as const
const AION_LABS_AION_1_0 =  {
    id: 'aion-labs/aion-1.0',
    name: 'AionLabs: Aion-1.0',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'temperature', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 4,
          cached: 0,
        },
        output: {
          normal: 8,
        },
      },
      image: 0,
    },
  } as const
const AION_LABS_AION_1_0_MINI =  {
    id: 'aion-labs/aion-1.0-mini',
    name: 'AionLabs: Aion-1.0-Mini',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'temperature', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.7,
          cached: 0,
        },
        output: {
          normal: 1.4,
        },
      },
      image: 0,
    },
  } as const
const AION_LABS_AION_2_0 =  {
    id: 'aion-labs/aion-2.0',
    name: 'AionLabs: Aion-2.0',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'temperature', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.8,
          cached: 0.2,
        },
        output: {
          normal: 1.6,
        },
      },
      image: 0,
    },
  } as const
const AION_LABS_AION_RP_LLAMA_3_1_8B =  {
    id: 'aion-labs/aion-rp-llama-3.1-8b',
    name: 'AionLabs: Aion-RP 1.0 (8B)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'temperature', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.8,
          cached: 0,
        },
        output: {
          normal: 1.6,
        },
      },
      image: 0,
    },
  } as const
const ALFREDPROS_CODELLAMA_7B_INSTRUCT_SOLIDITY =  {
    id: 'alfredpros/codellama-7b-instruct-solidity',
    name: 'AlfredPros: CodeLLaMa 7B Instruct Solidity',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 4096,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 0.8,
          cached: 0,
        },
        output: {
          normal: 1.2,
        },
      },
      image: 0,
    },
  } as const
const ALIBABA_TONGYI_DEEPRESEARCH_30B_A3B =  {
    id: 'alibaba/tongyi-deepresearch-30b-a3b',
    name: 'Tongyi DeepResearch 30B A3B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.09,
          cached: 0.09,
        },
        output: {
          normal: 0.45,
        },
      },
      image: 0,
    },
  } as const
const ALLENAI_OLMO_2_0325_32B_INSTRUCT =  {
    id: 'allenai/olmo-2-0325-32b-instruct',
    name: 'AllenAI: Olmo 2 32B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: [],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.05,
          cached: 0,
        },
        output: {
          normal: 0.2,
        },
      },
      image: 0,
    },
  } as const
const ALLENAI_OLMO_3_32B_THINK =  {
    id: 'allenai/olmo-3-32b-think',
    name: 'AllenAI: Olmo 3 32B Think',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 65536,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0,
        },
        output: {
          normal: 0.5,
        },
      },
      image: 0,
    },
  } as const
const ALLENAI_OLMO_3_1_32B_INSTRUCT =  {
    id: 'allenai/olmo-3.1-32b-instruct',
    name: 'AllenAI: Olmo 3.1 32B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const ALPINDALE_GOLIATH_120B =  {
    id: 'alpindale/goliath-120b',
    name: 'Goliath 120B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topA', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 6144,
    max_output_tokens: 1024,
    pricing: {
      text: {
        input: {
          normal: 3.75,
          cached: 0,
        },
        output: {
          normal: 7.5,
        },
      },
      image: 0,
    },
  } as const
const AMAZON_NOVA_2_LITE_V1 =  {
    id: 'amazon/nova-2-lite-v1',
    name: 'Amazon: Nova 2 Lite',
    supports: {
      input: ['text', 'image', 'video', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 65535,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0,
        },
        output: {
          normal: 2.5,
        },
      },
      image: 0,
    },
  } as const
const AMAZON_NOVA_LITE_V1 =  {
    id: 'amazon/nova-lite-v1',
    name: 'Amazon: Nova Lite 1.0',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 300000,
    max_output_tokens: 5120,
    pricing: {
      text: {
        input: {
          normal: 0.06,
          cached: 0,
        },
        output: {
          normal: 0.24,
        },
      },
      image: 0,
    },
  } as const
const AMAZON_NOVA_MICRO_V1 =  {
    id: 'amazon/nova-micro-v1',
    name: 'Amazon: Nova Micro 1.0',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 5120,
    pricing: {
      text: {
        input: {
          normal: 0.035,
          cached: 0,
        },
        output: {
          normal: 0.14,
        },
      },
      image: 0,
    },
  } as const
const AMAZON_NOVA_PREMIER_V1 =  {
    id: 'amazon/nova-premier-v1',
    name: 'Amazon: Nova Premier 1.0',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 32000,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0.625,
        },
        output: {
          normal: 12.5,
        },
      },
      image: 0,
    },
  } as const
const AMAZON_NOVA_PRO_V1 =  {
    id: 'amazon/nova-pro-v1',
    name: 'Amazon: Nova Pro 1.0',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 300000,
    max_output_tokens: 5120,
    pricing: {
      text: {
        input: {
          normal: 0.8,
          cached: 0,
        },
        output: {
          normal: 3.2,
        },
      },
      image: 0,
    },
  } as const
const ANTHRACITE_ORG_MAGNUM_V4_72B =  {
    id: 'anthracite-org/magnum-v4-72b',
    name: 'Magnum v4 72B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topA', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 16384,
    max_output_tokens: 2048,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 0,
        },
        output: {
          normal: 5,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_3_HAIKU =  {
    id: 'anthropic/claude-3-haiku',
    name: 'Anthropic: Claude 3 Haiku',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 200000,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 0.25,
          cached: 0.32999999999999996,
        },
        output: {
          normal: 1.25,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_3_5_HAIKU =  {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Anthropic: Claude 3.5 Haiku',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 200000,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.8,
          cached: 1.08,
        },
        output: {
          normal: 4,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_3_7_SONNET =  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Anthropic: Claude 3.7 Sonnet',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 200000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 4.05,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_3_7_SONNET_THINKING =  {
    id: 'anthropic/claude-3.7-sonnet:thinking',
    name: 'Anthropic: Claude 3.7 Sonnet (thinking)',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 200000,
    max_output_tokens: 64000,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 4.05,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_HAIKU_4_5 =  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Anthropic: Claude Haiku 4.5',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 200000,
    max_output_tokens: 64000,
    pricing: {
      text: {
        input: {
          normal: 1,
          cached: 1.35,
        },
        output: {
          normal: 5,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_OPUS_4 =  {
    id: 'anthropic/claude-opus-4',
    name: 'Anthropic: Claude Opus 4',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 200000,
    max_output_tokens: 32000,
    pricing: {
      text: {
        input: {
          normal: 15,
          cached: 20.25,
        },
        output: {
          normal: 75,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_OPUS_4_1 =  {
    id: 'anthropic/claude-opus-4.1',
    name: 'Anthropic: Claude Opus 4.1',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 200000,
    max_output_tokens: 32000,
    pricing: {
      text: {
        input: {
          normal: 15,
          cached: 20.25,
        },
        output: {
          normal: 75,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_OPUS_4_5 =  {
    id: 'anthropic/claude-opus-4.5',
    name: 'Anthropic: Claude Opus 4.5',
    supports: {
      input: ['document', 'image', 'text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'verbosity'],
    },
    context_window: 200000,
    max_output_tokens: 64000,
    pricing: {
      text: {
        input: {
          normal: 5,
          cached: 6.75,
        },
        output: {
          normal: 25,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_OPUS_4_6 =  {
    id: 'anthropic/claude-opus-4.6',
    name: 'Anthropic: Claude Opus 4.6',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'topP', 'verbosity'],
    },
    context_window: 1000000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 5,
          cached: 6.75,
        },
        output: {
          normal: 25,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_OPUS_4_6_FAST =  {
    id: 'anthropic/claude-opus-4.6-fast',
    name: 'Anthropic: Claude Opus 4.6 (Fast)',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topP', 'verbosity'],
    },
    context_window: 1000000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 30,
          cached: 40.5,
        },
        output: {
          normal: 150,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_SONNET_4 =  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Anthropic: Claude Sonnet 4',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 64000,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 4.05,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_SONNET_4_5 =  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Anthropic: Claude Sonnet 4.5',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 64000,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 4.05,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const ANTHROPIC_CLAUDE_SONNET_4_6 =  {
    id: 'anthropic/claude-sonnet-4.6',
    name: 'Anthropic: Claude Sonnet 4.6',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'topP', 'verbosity'],
    },
    context_window: 1000000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 4.05,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const ARCEE_AI_CODER_LARGE =  {
    id: 'arcee-ai/coder-large',
    name: 'Arcee AI: Coder Large',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.5,
          cached: 0,
        },
        output: {
          normal: 0.8,
        },
      },
      image: 0,
    },
  } as const
const ARCEE_AI_MAESTRO_REASONING =  {
    id: 'arcee-ai/maestro-reasoning',
    name: 'Arcee AI: Maestro Reasoning',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32000,
    pricing: {
      text: {
        input: {
          normal: 0.9,
          cached: 0,
        },
        output: {
          normal: 3.3,
        },
      },
      image: 0,
    },
  } as const
const ARCEE_AI_SPOTLIGHT =  {
    id: 'arcee-ai/spotlight',
    name: 'Arcee AI: Spotlight',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 65537,
    pricing: {
      text: {
        input: {
          normal: 0.18,
          cached: 0,
        },
        output: {
          normal: 0.18,
        },
      },
      image: 0,
    },
  } as const
const ARCEE_AI_TRINITY_LARGE_PREVIEW_FREE =  {
    id: 'arcee-ai/trinity-large-preview:free',
    name: 'Arcee AI: Trinity Large Preview (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'temperature', 'topK', 'topP'],
    },
    context_window: 131000,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const ARCEE_AI_TRINITY_LARGE_THINKING =  {
    id: 'arcee-ai/trinity-large-thinking',
    name: 'Arcee AI: Trinity Large Thinking',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.22,
          cached: 0.06,
        },
        output: {
          normal: 0.85,
        },
      },
      image: 0,
    },
  } as const
const ARCEE_AI_TRINITY_MINI =  {
    id: 'arcee-ai/trinity-mini',
    name: 'Arcee AI: Trinity Mini',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.045,
          cached: 0,
        },
        output: {
          normal: 0.15,
        },
      },
      image: 0,
    },
  } as const
const ARCEE_AI_VIRTUOSO_LARGE =  {
    id: 'arcee-ai/virtuoso-large',
    name: 'Arcee AI: Virtuoso Large',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 64000,
    pricing: {
      text: {
        input: {
          normal: 0.75,
          cached: 0,
        },
        output: {
          normal: 1.2,
        },
      },
      image: 0,
    },
  } as const
const BAIDU_ERNIE_4_5_21B_A3B =  {
    id: 'baidu/ernie-4.5-21b-a3b',
    name: 'Baidu: ERNIE 4.5 21B A3B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 120000,
    max_output_tokens: 8000,
    pricing: {
      text: {
        input: {
          normal: 0.07,
          cached: 0,
        },
        output: {
          normal: 0.28,
        },
      },
      image: 0,
    },
  } as const
const BAIDU_ERNIE_4_5_21B_A3B_THINKING =  {
    id: 'baidu/ernie-4.5-21b-a3b-thinking',
    name: 'Baidu: ERNIE 4.5 21B A3B Thinking',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.07,
          cached: 0,
        },
        output: {
          normal: 0.28,
        },
      },
      image: 0,
    },
  } as const
const BAIDU_ERNIE_4_5_300B_A47B =  {
    id: 'baidu/ernie-4.5-300b-a47b',
    name: 'Baidu: ERNIE 4.5 300B A47B ',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 123000,
    max_output_tokens: 12000,
    pricing: {
      text: {
        input: {
          normal: 0.28,
          cached: 0,
        },
        output: {
          normal: 1.1,
        },
      },
      image: 0,
    },
  } as const
const BAIDU_ERNIE_4_5_VL_28B_A3B =  {
    id: 'baidu/ernie-4.5-vl-28b-a3b',
    name: 'Baidu: ERNIE 4.5 VL 28B A3B',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 30000,
    max_output_tokens: 8000,
    pricing: {
      text: {
        input: {
          normal: 0.14,
          cached: 0,
        },
        output: {
          normal: 0.56,
        },
      },
      image: 0,
    },
  } as const
const BAIDU_ERNIE_4_5_VL_424B_A47B =  {
    id: 'baidu/ernie-4.5-vl-424b-a47b',
    name: 'Baidu: ERNIE 4.5 VL 424B A47B ',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 123000,
    max_output_tokens: 16000,
    pricing: {
      text: {
        input: {
          normal: 0.42,
          cached: 0,
        },
        output: {
          normal: 1.25,
        },
      },
      image: 0,
    },
  } as const
const BYTEDANCE_SEED_SEED_1_6 =  {
    id: 'bytedance-seed/seed-1.6',
    name: 'ByteDance Seed: Seed 1.6',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.25,
          cached: 0,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const BYTEDANCE_SEED_SEED_1_6_FLASH =  {
    id: 'bytedance-seed/seed-1.6-flash',
    name: 'ByteDance Seed: Seed 1.6 Flash',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.075,
          cached: 0,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 0,
    },
  } as const
const BYTEDANCE_SEED_SEED_2_0_LITE =  {
    id: 'bytedance-seed/seed-2.0-lite',
    name: 'ByteDance Seed: Seed-2.0-Lite',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.25,
          cached: 0,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const BYTEDANCE_SEED_SEED_2_0_MINI =  {
    id: 'bytedance-seed/seed-2.0-mini',
    name: 'ByteDance Seed: Seed-2.0-Mini',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const BYTEDANCE_UI_TARS_1_5_7B =  {
    id: 'bytedance/ui-tars-1.5-7b',
    name: 'ByteDance: UI-TARS 7B ',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 2048,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.1,
        },
        output: {
          normal: 0.2,
        },
      },
      image: 0,
    },
  } as const
const COGNITIVECOMPUTATIONS_DOLPHIN_MISTRAL_24B_VENICE_EDITION_FREE =  {
    id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    name: 'Venice: Uncensored (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const COHERE_COMMAND_A =  {
    id: 'cohere/command-a',
    name: 'Cohere: Command A',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 256000,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const COHERE_COMMAND_R_08_2024 =  {
    id: 'cohere/command-r-08-2024',
    name: 'Cohere: Command R (08-2024)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 4000,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const COHERE_COMMAND_R_PLUS_08_2024 =  {
    id: 'cohere/command-r-plus-08-2024',
    name: 'Cohere: Command R+ (08-2024)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 4000,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const COHERE_COMMAND_R7B_12_2024 =  {
    id: 'cohere/command-r7b-12-2024',
    name: 'Cohere: Command R7B (12-2024)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 4000,
    pricing: {
      text: {
        input: {
          normal: 0.0375,
          cached: 0,
        },
        output: {
          normal: 0.15,
        },
      },
      image: 0,
    },
  } as const
const DEEPCOGITO_COGITO_V2_1_671B =  {
    id: 'deepcogito/cogito-v2.1-671b',
    name: 'Deep Cogito: Cogito v2.1 671B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0,
        },
        output: {
          normal: 1.25,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_CHAT =  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek: DeepSeek V3',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 163840,
    max_output_tokens: 163840,
    pricing: {
      text: {
        input: {
          normal: 0.32,
          cached: 0,
        },
        output: {
          normal: 0.89,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_CHAT_V3_0324 =  {
    id: 'deepseek/deepseek-chat-v3-0324',
    name: 'DeepSeek: DeepSeek V3 0324',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 163840,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0.135,
        },
        output: {
          normal: 0.77,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_CHAT_V3_1 =  {
    id: 'deepseek/deepseek-chat-v3.1',
    name: 'DeepSeek: DeepSeek V3.1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 7168,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0,
        },
        output: {
          normal: 0.75,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_R1 =  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek: R1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 64000,
    max_output_tokens: 16000,
    pricing: {
      text: {
        input: {
          normal: 0.7,
          cached: 0,
        },
        output: {
          normal: 2.5,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_R1_0528 =  {
    id: 'deepseek/deepseek-r1-0528',
    name: 'DeepSeek: R1 0528',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 163840,
    pricing: {
      text: {
        input: {
          normal: 0.5,
          cached: 0.35,
        },
        output: {
          normal: 2.15,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_R1_DISTILL_LLAMA_70B =  {
    id: 'deepseek/deepseek-r1-distill-llama-70b',
    name: 'DeepSeek: R1 Distill Llama 70B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.7,
          cached: 0,
        },
        output: {
          normal: 0.8,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_32B =  {
    id: 'deepseek/deepseek-r1-distill-qwen-32b',
    name: 'DeepSeek: R1 Distill Qwen 32B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'stop', 'temperature', 'topLogprobs', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.29,
          cached: 0,
        },
        output: {
          normal: 0.29,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_V3_1_TERMINUS =  {
    id: 'deepseek/deepseek-v3.1-terminus',
    name: 'DeepSeek: DeepSeek V3.1 Terminus',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 163840,
    pricing: {
      text: {
        input: {
          normal: 0.21,
          cached: 0.1300000002,
        },
        output: {
          normal: 0.79,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_V3_2 =  {
    id: 'deepseek/deepseek-v3.2',
    name: 'DeepSeek: DeepSeek V3.2',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 163840,
    pricing: {
      text: {
        input: {
          normal: 0.26,
          cached: 0.13,
        },
        output: {
          normal: 0.38,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_V3_2_EXP =  {
    id: 'deepseek/deepseek-v3.2-exp',
    name: 'DeepSeek: DeepSeek V3.2 Exp',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 163840,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.27,
          cached: 0,
        },
        output: {
          normal: 0.41,
        },
      },
      image: 0,
    },
  } as const
const DEEPSEEK_DEEPSEEK_V3_2_SPECIALE =  {
    id: 'deepseek/deepseek-v3.2-speciale',
    name: 'DeepSeek: DeepSeek V3.2 Speciale',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 163840,
    max_output_tokens: 163840,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0.2,
        },
        output: {
          normal: 1.2,
        },
      },
      image: 0,
    },
  } as const
const ESSENTIALAI_RNJ_1_INSTRUCT =  {
    id: 'essentialai/rnj-1-instruct',
    name: 'EssentialAI: Rnj 1 Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0,
        },
        output: {
          normal: 0.15,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMINI_2_0_FLASH_001 =  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Google: Gemini 2.0 Flash',
    supports: {
      input: ['text', 'image', 'document', 'audio', 'video'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.1083333333,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 1e-7,
    },
  } as const
const GOOGLE_GEMINI_2_0_FLASH_LITE_001 =  {
    id: 'google/gemini-2.0-flash-lite-001',
    name: 'Google: Gemini 2.0 Flash Lite',
    supports: {
      input: ['text', 'image', 'document', 'audio', 'video'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.075,
          cached: 0,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 7.5e-8,
    },
  } as const
const GOOGLE_GEMINI_2_5_FLASH =  {
    id: 'google/gemini-2.5-flash',
    name: 'Google: Gemini 2.5 Flash',
    supports: {
      input: ['document', 'image', 'text', 'audio', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65535,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.1133333333,
        },
        output: {
          normal: 2.5,
        },
      },
      image: 3e-7,
    },
  } as const
const GOOGLE_GEMINI_2_5_FLASH_IMAGE =  {
    id: 'google/gemini-2.5-flash-image',
    name: 'Google: Nano Banana (Gemini 2.5 Flash Image)',
    supports: {
      input: ['image', 'text'],
      output: ['image', 'text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed', 'stop', 'temperature', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.1133333333,
        },
        output: {
          normal: 2.5,
        },
      },
      image: 3e-7,
    },
  } as const
const GOOGLE_GEMINI_2_5_FLASH_LITE =  {
    id: 'google/gemini-2.5-flash-lite',
    name: 'Google: Gemini 2.5 Flash Lite',
    supports: {
      input: ['text', 'image', 'document', 'audio', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65535,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.0933333333,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 1e-7,
    },
  } as const
const GOOGLE_GEMINI_2_5_FLASH_LITE_PREVIEW_09_2025 =  {
    id: 'google/gemini-2.5-flash-lite-preview-09-2025',
    name: 'Google: Gemini 2.5 Flash Lite Preview 09-2025',
    supports: {
      input: ['text', 'image', 'document', 'audio', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65535,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.0933333333,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 1e-7,
    },
  } as const
const GOOGLE_GEMINI_2_5_PRO =  {
    id: 'google/gemini-2.5-pro',
    name: 'Google: Gemini 2.5 Pro',
    supports: {
      input: ['text', 'image', 'document', 'audio', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.5,
        },
        output: {
          normal: 10,
        },
      },
      image: 0.00000125,
    },
  } as const
const GOOGLE_GEMINI_2_5_PRO_PREVIEW =  {
    id: 'google/gemini-2.5-pro-preview',
    name: 'Google: Gemini 2.5 Pro Preview 06-05',
    supports: {
      input: ['document', 'image', 'text', 'audio'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.5,
        },
        output: {
          normal: 10,
        },
      },
      image: 0.00000125,
    },
  } as const
const GOOGLE_GEMINI_2_5_PRO_PREVIEW_05_06 =  {
    id: 'google/gemini-2.5-pro-preview-05-06',
    name: 'Google: Gemini 2.5 Pro Preview 05-06',
    supports: {
      input: ['text', 'image', 'document', 'audio', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65535,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.5,
        },
        output: {
          normal: 10,
        },
      },
      image: 0.00000125,
    },
  } as const
const GOOGLE_GEMINI_3_FLASH_PREVIEW =  {
    id: 'google/gemini-3-flash-preview',
    name: 'Google: Gemini 3 Flash Preview',
    supports: {
      input: ['text', 'image', 'document', 'audio', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.5,
          cached: 0.13333333330000002,
        },
        output: {
          normal: 3,
        },
      },
      image: 5e-7,
    },
  } as const
const GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW =  {
    id: 'google/gemini-3-pro-image-preview',
    name: 'Google: Nano Banana Pro (Gemini 3 Pro Image Preview)',
    supports: {
      input: ['image', 'text'],
      output: ['image', 'text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'topP'],
    },
    context_window: 65536,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.575,
        },
        output: {
          normal: 12,
        },
      },
      image: 0.000002,
    },
  } as const
const GOOGLE_GEMINI_3_1_FLASH_IMAGE_PREVIEW =  {
    id: 'google/gemini-3.1-flash-image-preview',
    name: 'Google: Nano Banana 2 (Gemini 3.1 Flash Image Preview)',
    supports: {
      input: ['image', 'text'],
      output: ['image', 'text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'topP'],
    },
    context_window: 65536,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.5,
          cached: 0,
        },
        output: {
          normal: 3,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMINI_3_1_FLASH_LITE_PREVIEW =  {
    id: 'google/gemini-3.1-flash-lite-preview',
    name: 'Google: Gemini 3.1 Flash Lite Preview',
    supports: {
      input: ['text', 'image', 'video', 'document', 'audio'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.25,
          cached: 0.1083333333,
        },
        output: {
          normal: 1.5,
        },
      },
      image: 2.5e-7,
    },
  } as const
const GOOGLE_GEMINI_3_1_PRO_PREVIEW =  {
    id: 'google/gemini-3.1-pro-preview',
    name: 'Google: Gemini 3.1 Pro Preview',
    supports: {
      input: ['audio', 'document', 'image', 'text', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.575,
        },
        output: {
          normal: 12,
        },
      },
      image: 0.000002,
    },
  } as const
const GOOGLE_GEMINI_3_1_PRO_PREVIEW_CUSTOMTOOLS =  {
    id: 'google/gemini-3.1-pro-preview-customtools',
    name: 'Google: Gemini 3.1 Pro Preview Custom Tools',
    supports: {
      input: ['text', 'audio', 'image', 'video', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.575,
        },
        output: {
          normal: 12,
        },
      },
      image: 0.000002,
    },
  } as const
const GOOGLE_GEMMA_2_27B_IT =  {
    id: 'google/gemma-2-27b-it',
    name: 'Google: Gemma 2 27B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'stop', 'temperature', 'topP'],
    },
    context_window: 8192,
    max_output_tokens: 2048,
    pricing: {
      text: {
        input: {
          normal: 0.65,
          cached: 0,
        },
        output: {
          normal: 0.65,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_3_12B_IT =  {
    id: 'google/gemma-3-12b-it',
    name: 'Google: Gemma 3 12B',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.04,
          cached: 0,
        },
        output: {
          normal: 0.13,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_3_12B_IT_FREE =  {
    id: 'google/gemma-3-12b-it:free',
    name: 'Google: Gemma 3 12B (free)',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'seed', 'stop', 'temperature', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_3_27B_IT =  {
    id: 'google/gemma-3-27b-it',
    name: 'Google: Gemma 3 27B',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.08,
          cached: 0,
        },
        output: {
          normal: 0.16,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_3_27B_IT_FREE =  {
    id: 'google/gemma-3-27b-it:free',
    name: 'Google: Gemma 3 27B (free)',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed', 'stop', 'temperature', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_3_4B_IT =  {
    id: 'google/gemma-3-4b-it',
    name: 'Google: Gemma 3 4B',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.04,
          cached: 0,
        },
        output: {
          normal: 0.08,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_3_4B_IT_FREE =  {
    id: 'google/gemma-3-4b-it:free',
    name: 'Google: Gemma 3 4B (free)',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed', 'stop', 'temperature', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_3N_E2B_IT_FREE =  {
    id: 'google/gemma-3n-e2b-it:free',
    name: 'Google: Gemma 3n 2B (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed', 'temperature', 'topP'],
    },
    context_window: 8192,
    max_output_tokens: 2048,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_3N_E4B_IT =  {
    id: 'google/gemma-3n-e4b-it',
    name: 'Google: Gemma 3n 4B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.06,
          cached: 0,
        },
        output: {
          normal: 0.12,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_3N_E4B_IT_FREE =  {
    id: 'google/gemma-3n-e4b-it:free',
    name: 'Google: Gemma 3n 4B (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed', 'temperature', 'topP'],
    },
    context_window: 8192,
    max_output_tokens: 2048,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_4_26B_A4B_IT =  {
    id: 'google/gemma-4-26b-a4b-it',
    name: 'Google: Gemma 4 26B A4B ',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.08,
          cached: 0.01,
        },
        output: {
          normal: 0.35,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_4_26B_A4B_IT_FREE =  {
    id: 'google/gemma-4-26b-a4b-it:free',
    name: 'Google: Gemma 4 26B A4B  (free)',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_4_31B_IT =  {
    id: 'google/gemma-4-31b-it',
    name: 'Google: Gemma 4 31B',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.13,
          cached: 0.0199999995,
        },
        output: {
          normal: 0.38,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_GEMMA_4_31B_IT_FREE =  {
    id: 'google/gemma-4-31b-it:free',
    name: 'Google: Gemma 4 31B (free)',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_LYRIA_3_CLIP_PREVIEW =  {
    id: 'google/lyria-3-clip-preview',
    name: 'Google: Lyria 3 Clip Preview',
    supports: {
      input: ['text', 'image'],
      output: ['text', 'audio'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed', 'temperature', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const GOOGLE_LYRIA_3_PRO_PREVIEW =  {
    id: 'google/lyria-3-pro-preview',
    name: 'Google: Lyria 3 Pro Preview',
    supports: {
      input: ['text', 'image'],
      output: ['text', 'audio'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed', 'temperature', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const GRYPHE_MYTHOMAX_L2_13B =  {
    id: 'gryphe/mythomax-l2-13b',
    name: 'MythoMax 13B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topA', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 4096,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 0.06,
          cached: 0,
        },
        output: {
          normal: 0.06,
        },
      },
      image: 0,
    },
  } as const
const IBM_GRANITE_GRANITE_4_0_H_MICRO =  {
    id: 'ibm-granite/granite-4.0-h-micro',
    name: 'IBM: Granite 4.0 Micro',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'temperature', 'topK', 'topP'],
    },
    context_window: 131000,
    pricing: {
      text: {
        input: {
          normal: 0.017,
          cached: 0,
        },
        output: {
          normal: 0.11,
        },
      },
      image: 0,
    },
  } as const
const INCEPTION_MERCURY_2 =  {
    id: 'inception/mercury-2',
    name: 'Inception: Mercury 2',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice'],
    },
    context_window: 128000,
    max_output_tokens: 50000,
    pricing: {
      text: {
        input: {
          normal: 0.25,
          cached: 0.025,
        },
        output: {
          normal: 0.75,
        },
      },
      image: 0,
    },
  } as const
const INFLECTION_INFLECTION_3_PI =  {
    id: 'inflection/inflection-3-pi',
    name: 'Inflection: Inflection 3 Pi',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature', 'topP'],
    },
    context_window: 8000,
    max_output_tokens: 1024,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const INFLECTION_INFLECTION_3_PRODUCTIVITY =  {
    id: 'inflection/inflection-3-productivity',
    name: 'Inflection: Inflection 3 Productivity',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature', 'topP'],
    },
    context_window: 8000,
    max_output_tokens: 1024,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const KWAIPILOT_KAT_CODER_PRO_V2 =  {
    id: 'kwaipilot/kat-coder-pro-v2',
    name: 'Kwaipilot: KAT-Coder-Pro V2',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 256000,
    max_output_tokens: 80000,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.06,
        },
        output: {
          normal: 1.2,
        },
      },
      image: 0,
    },
  } as const
const LIQUID_LFM_2_24B_A2B =  {
    id: 'liquid/lfm-2-24b-a2b',
    name: 'LiquidAI: LFM2-24B-A2B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.03,
          cached: 0,
        },
        output: {
          normal: 0.12,
        },
      },
      image: 0,
    },
  } as const
const LIQUID_LFM_2_5_1_2B_INSTRUCT_FREE =  {
    id: 'liquid/lfm-2.5-1.2b-instruct:free',
    name: 'LiquidAI: LFM2.5-1.2B-Instruct (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const LIQUID_LFM_2_5_1_2B_THINKING_FREE =  {
    id: 'liquid/lfm-2.5-1.2b-thinking:free',
    name: 'LiquidAI: LFM2.5-1.2B-Thinking (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const MANCER_WEAVER =  {
    id: 'mancer/weaver',
    name: 'Mancer: Weaver (alpha)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topA', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 8000,
    max_output_tokens: 2000,
    pricing: {
      text: {
        input: {
          normal: 0.75,
          cached: 0,
        },
        output: {
          normal: 1,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_70B_INSTRUCT =  {
    id: 'meta-llama/llama-3-70b-instruct',
    name: 'Meta: Llama 3 70B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 8192,
    max_output_tokens: 8000,
    pricing: {
      text: {
        input: {
          normal: 0.51,
          cached: 0,
        },
        output: {
          normal: 0.74,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_8B_INSTRUCT =  {
    id: 'meta-llama/llama-3-8b-instruct',
    name: 'Meta: Llama 3 8B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 8192,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.03,
          cached: 0,
        },
        output: {
          normal: 0.04,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_1_70B_INSTRUCT =  {
    id: 'meta-llama/llama-3.1-70b-instruct',
    name: 'Meta: Llama 3.1 70B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_1_8B_INSTRUCT =  {
    id: 'meta-llama/llama-3.1-8b-instruct',
    name: 'Meta: Llama 3.1 8B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 16384,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.02,
          cached: 0,
        },
        output: {
          normal: 0.05,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_2_11B_VISION_INSTRUCT =  {
    id: 'meta-llama/llama-3.2-11b-vision-instruct',
    name: 'Meta: Llama 3.2 11B Vision Instruct',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.245,
          cached: 0,
        },
        output: {
          normal: 0.245,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_2_1B_INSTRUCT =  {
    id: 'meta-llama/llama-3.2-1b-instruct',
    name: 'Meta: Llama 3.2 1B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'temperature', 'topK', 'topP'],
    },
    context_window: 60000,
    pricing: {
      text: {
        input: {
          normal: 0.027,
          cached: 0,
        },
        output: {
          normal: 0.2,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_2_3B_INSTRUCT =  {
    id: 'meta-llama/llama-3.2-3b-instruct',
    name: 'Meta: Llama 3.2 3B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'temperature', 'topK', 'topP'],
    },
    context_window: 80000,
    pricing: {
      text: {
        input: {
          normal: 0.051,
          cached: 0,
        },
        output: {
          normal: 0.34,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_2_3B_INSTRUCT_FREE =  {
    id: 'meta-llama/llama-3.2-3b-instruct:free',
    name: 'Meta: Llama 3.2 3B Instruct (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_3_70B_INSTRUCT =  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Meta: Llama 3.3 70B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0,
        },
        output: {
          normal: 0.32,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_3_3_70B_INSTRUCT_FREE =  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Meta: Llama 3.3 70B Instruct (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 65536,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_4_MAVERICK =  {
    id: 'meta-llama/llama-4-maverick',
    name: 'Meta: Llama 4 Maverick',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_4_SCOUT =  {
    id: 'meta-llama/llama-4-scout',
    name: 'Meta: Llama 4 Scout',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 327680,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.08,
          cached: 0,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_GUARD_3_8B =  {
    id: 'meta-llama/llama-guard-3-8b',
    name: 'Llama Guard 3 8B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.48,
          cached: 0,
        },
        output: {
          normal: 0.03,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_GUARD_4_12B =  {
    id: 'meta-llama/llama-guard-4-12b',
    name: 'Meta: Llama Guard 4 12B',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 163840,
    pricing: {
      text: {
        input: {
          normal: 0.18,
          cached: 0,
        },
        output: {
          normal: 0.18,
        },
      },
      image: 0,
    },
  } as const
const META_LLAMA_LLAMA_GUARD_4_12B_FREE =  {
    id: 'meta-llama/llama-guard-4-12b:free',
    name: 'Meta: Llama Guard 4 12B (free)',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'seed', 'temperature', 'topP'],
    },
    context_window: 163840,
    max_output_tokens: 65000,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const MICROSOFT_PHI_4 =  {
    id: 'microsoft/phi-4',
    name: 'Microsoft: Phi 4',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 16384,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.065,
          cached: 0,
        },
        output: {
          normal: 0.14,
        },
      },
      image: 0,
    },
  } as const
const MICROSOFT_WIZARDLM_2_8X22B =  {
    id: 'microsoft/wizardlm-2-8x22b',
    name: 'WizardLM-2 8x22B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 65535,
    max_output_tokens: 8000,
    pricing: {
      text: {
        input: {
          normal: 0.62,
          cached: 0,
        },
        output: {
          normal: 0.62,
        },
      },
      image: 0,
    },
  } as const
const MINIMAX_MINIMAX_01 =  {
    id: 'minimax/minimax-01',
    name: 'MiniMax: MiniMax-01',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'temperature', 'topP'],
    },
    context_window: 1000192,
    max_output_tokens: 1000192,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0,
        },
        output: {
          normal: 1.1,
        },
      },
      image: 0,
    },
  } as const
const MINIMAX_MINIMAX_M1 =  {
    id: 'minimax/minimax-m1',
    name: 'MiniMax: MiniMax M1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 40000,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0,
        },
        output: {
          normal: 2.2,
        },
      },
      image: 0,
    },
  } as const
const MINIMAX_MINIMAX_M2 =  {
    id: 'minimax/minimax-m2',
    name: 'MiniMax: MiniMax M2',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 196608,
    max_output_tokens: 196608,
    pricing: {
      text: {
        input: {
          normal: 0.255,
          cached: 0.03,
        },
        output: {
          normal: 1,
        },
      },
      image: 0,
    },
  } as const
const MINIMAX_MINIMAX_M2_HER =  {
    id: 'minimax/minimax-m2-her',
    name: 'MiniMax: MiniMax M2-her',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'temperature', 'topP'],
    },
    context_window: 65536,
    max_output_tokens: 2048,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.03,
        },
        output: {
          normal: 1.2,
        },
      },
      image: 0,
    },
  } as const
const MINIMAX_MINIMAX_M2_1 =  {
    id: 'minimax/minimax-m2.1',
    name: 'MiniMax: MiniMax M2.1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 196608,
    max_output_tokens: 196608,
    pricing: {
      text: {
        input: {
          normal: 0.29,
          cached: 0.03,
        },
        output: {
          normal: 0.95,
        },
      },
      image: 0,
    },
  } as const
const MINIMAX_MINIMAX_M2_5 =  {
    id: 'minimax/minimax-m2.5',
    name: 'MiniMax: MiniMax M2.5',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'parallelToolCalls', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 196608,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.118,
          cached: 0.059,
        },
        output: {
          normal: 0.99,
        },
      },
      image: 0,
    },
  } as const
const MINIMAX_MINIMAX_M2_5_FREE =  {
    id: 'minimax/minimax-m2.5:free',
    name: 'MiniMax: MiniMax M2.5 (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature'],
    },
    context_window: 196608,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const MINIMAX_MINIMAX_M2_7 =  {
    id: 'minimax/minimax-m2.7',
    name: 'MiniMax: MiniMax M2.7',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 196608,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.059,
        },
        output: {
          normal: 1.2,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_CODESTRAL_2508 =  {
    id: 'mistralai/codestral-2508',
    name: 'Mistral: Codestral 2508',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 256000,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.03,
        },
        output: {
          normal: 0.9,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_DEVSTRAL_2512 =  {
    id: 'mistralai/devstral-2512',
    name: 'Mistral: Devstral 2 2512',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0.04,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_DEVSTRAL_MEDIUM =  {
    id: 'mistralai/devstral-medium',
    name: 'Mistral: Devstral Medium',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0.04,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_DEVSTRAL_SMALL =  {
    id: 'mistralai/devstral-small',
    name: 'Mistral: Devstral Small 1.1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.01,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MINISTRAL_14B_2512 =  {
    id: 'mistralai/ministral-14b-2512',
    name: 'Mistral: Ministral 3 14B 2512',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0.02,
        },
        output: {
          normal: 0.2,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MINISTRAL_3B_2512 =  {
    id: 'mistralai/ministral-3b-2512',
    name: 'Mistral: Ministral 3 3B 2512',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.01,
        },
        output: {
          normal: 0.1,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MINISTRAL_8B_2512 =  {
    id: 'mistralai/ministral-8b-2512',
    name: 'Mistral: Ministral 3 8B 2512',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0.015,
        },
        output: {
          normal: 0.15,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_7B_INSTRUCT_V0_1 =  {
    id: 'mistralai/mistral-7b-instruct-v0.1',
    name: 'Mistral: Mistral 7B Instruct v0.1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'temperature', 'topK', 'topP'],
    },
    context_window: 2824,
    pricing: {
      text: {
        input: {
          normal: 0.11,
          cached: 0,
        },
        output: {
          normal: 0.19,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_LARGE =  {
    id: 'mistralai/mistral-large',
    name: 'Mistral Large',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.2,
        },
        output: {
          normal: 6,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_LARGE_2407 =  {
    id: 'mistralai/mistral-large-2407',
    name: 'Mistral Large 2407',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.2,
        },
        output: {
          normal: 6,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_LARGE_2411 =  {
    id: 'mistralai/mistral-large-2411',
    name: 'Mistral Large 2411',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.2,
        },
        output: {
          normal: 6,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_LARGE_2512 =  {
    id: 'mistralai/mistral-large-2512',
    name: 'Mistral: Mistral Large 3 2512',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.5,
          cached: 0.05,
        },
        output: {
          normal: 1.5,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_MEDIUM_3 =  {
    id: 'mistralai/mistral-medium-3',
    name: 'Mistral: Mistral Medium 3',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0.04,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_MEDIUM_3_1 =  {
    id: 'mistralai/mistral-medium-3.1',
    name: 'Mistral: Mistral Medium 3.1',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0.04,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_NEMO =  {
    id: 'mistralai/mistral-nemo',
    name: 'Mistral: Mistral Nemo',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.02,
          cached: 0,
        },
        output: {
          normal: 0.04,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_SABA =  {
    id: 'mistralai/mistral-saba',
    name: 'Mistral: Saba',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0.02,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_SMALL_24B_INSTRUCT_2501 =  {
    id: 'mistralai/mistral-small-24b-instruct-2501',
    name: 'Mistral: Mistral Small 3',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.05,
          cached: 0,
        },
        output: {
          normal: 0.08,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_SMALL_2603 =  {
    id: 'mistralai/mistral-small-2603',
    name: 'Mistral: Mistral Small 4',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0.015,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT =  {
    id: 'mistralai/mistral-small-3.1-24b-instruct',
    name: 'Mistral: Mistral Small 3.1 24B',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'temperature', 'topK', 'topP'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.35,
          cached: 0,
        },
        output: {
          normal: 0.56,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_SMALL_3_2_24B_INSTRUCT =  {
    id: 'mistralai/mistral-small-3.2-24b-instruct',
    name: 'Mistral: Mistral Small 3.2 24B',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.075,
          cached: 0,
        },
        output: {
          normal: 0.2,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MISTRAL_SMALL_CREATIVE =  {
    id: 'mistralai/mistral-small-creative',
    name: 'Mistral: Mistral Small Creative',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['toolChoice'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.01,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MIXTRAL_8X22B_INSTRUCT =  {
    id: 'mistralai/mixtral-8x22b-instruct',
    name: 'Mistral: Mixtral 8x22B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 65536,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.2,
        },
        output: {
          normal: 6,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_MIXTRAL_8X7B_INSTRUCT =  {
    id: 'mistralai/mixtral-8x7b-instruct',
    name: 'Mistral: Mixtral 8x7B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.54,
          cached: 0,
        },
        output: {
          normal: 0.54,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_PIXTRAL_LARGE_2411 =  {
    id: 'mistralai/pixtral-large-2411',
    name: 'Mistral: Pixtral Large 2411',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.2,
        },
        output: {
          normal: 6,
        },
      },
      image: 0,
    },
  } as const
const MISTRALAI_VOXTRAL_SMALL_24B_2507 =  {
    id: 'mistralai/voxtral-small-24b-2507',
    name: 'Mistral: Voxtral Small 24B 2507',
    supports: {
      input: ['text', 'audio'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 32000,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.01,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 0,
    },
  } as const
const MOONSHOTAI_KIMI_K2 =  {
    id: 'moonshotai/kimi-k2',
    name: 'MoonshotAI: Kimi K2 0711',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.57,
          cached: 0,
        },
        output: {
          normal: 2.3,
        },
      },
      image: 0,
    },
  } as const
const MOONSHOTAI_KIMI_K2_0905 =  {
    id: 'moonshotai/kimi-k2-0905',
    name: 'MoonshotAI: Kimi K2 0905',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const MOONSHOTAI_KIMI_K2_THINKING =  {
    id: 'moonshotai/kimi-k2-thinking',
    name: 'MoonshotAI: Kimi K2 Thinking',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.6,
          cached: 0.15,
        },
        output: {
          normal: 2.5,
        },
      },
      image: 0,
    },
  } as const
const MOONSHOTAI_KIMI_K2_5 =  {
    id: 'moonshotai/kimi-k2.5',
    name: 'MoonshotAI: Kimi K2.5',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'parallelToolCalls', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 65535,
    pricing: {
      text: {
        input: {
          normal: 0.3827,
          cached: 0.19135,
        },
        output: {
          normal: 1.72,
        },
      },
      image: 0,
    },
  } as const
const MORPH_MORPH_V3_FAST =  {
    id: 'morph/morph-v3-fast',
    name: 'Morph: Morph V3 Fast',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature'],
    },
    context_window: 81920,
    max_output_tokens: 38000,
    pricing: {
      text: {
        input: {
          normal: 0.8,
          cached: 0,
        },
        output: {
          normal: 1.2,
        },
      },
      image: 0,
    },
  } as const
const MORPH_MORPH_V3_LARGE =  {
    id: 'morph/morph-v3-large',
    name: 'Morph: Morph V3 Large',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature'],
    },
    context_window: 262144,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.9,
          cached: 0,
        },
        output: {
          normal: 1.9,
        },
      },
      image: 0,
    },
  } as const
const NEX_AGI_DEEPSEEK_V3_1_NEX_N1 =  {
    id: 'nex-agi/deepseek-v3.1-nex-n1',
    name: 'Nex AGI: DeepSeek V3.1 Nex N1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'responseFormat', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 163840,
    pricing: {
      text: {
        input: {
          normal: 0.135,
          cached: 0,
        },
        output: {
          normal: 0.5,
        },
      },
      image: 0,
    },
  } as const
const NOUSRESEARCH_HERMES_2_PRO_LLAMA_3_8B =  {
    id: 'nousresearch/hermes-2-pro-llama-3-8b',
    name: 'NousResearch: Hermes 2 Pro - Llama-3 8B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 8192,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.14,
          cached: 0,
        },
        output: {
          normal: 0.14,
        },
      },
      image: 0,
    },
  } as const
const NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B =  {
    id: 'nousresearch/hermes-3-llama-3.1-405b',
    name: 'Nous: Hermes 3 405B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 1,
          cached: 0,
        },
        output: {
          normal: 1,
        },
      },
      image: 0,
    },
  } as const
const NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B_FREE =  {
    id: 'nousresearch/hermes-3-llama-3.1-405b:free',
    name: 'Nous: Hermes 3 405B Instruct (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const NOUSRESEARCH_HERMES_3_LLAMA_3_1_70B =  {
    id: 'nousresearch/hermes-3-llama-3.1-70b',
    name: 'Nous: Hermes 3 70B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 0,
    },
  } as const
const NOUSRESEARCH_HERMES_4_405B =  {
    id: 'nousresearch/hermes-4-405b',
    name: 'Nous: Hermes 4 405B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 1,
          cached: 0,
        },
        output: {
          normal: 3,
        },
      },
      image: 0,
    },
  } as const
const NOUSRESEARCH_HERMES_4_70B =  {
    id: 'nousresearch/hermes-4-70b',
    name: 'Nous: Hermes 4 70B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.13,
          cached: 0,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_LLAMA_3_1_NEMOTRON_70B_INSTRUCT =  {
    id: 'nvidia/llama-3.1-nemotron-70b-instruct',
    name: 'NVIDIA: Llama 3.1 Nemotron 70B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 1.2,
          cached: 0,
        },
        output: {
          normal: 1.2,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_LLAMA_3_3_NEMOTRON_SUPER_49B_V1_5 =  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    name: 'NVIDIA: Llama 3.3 Nemotron Super 49B V1.5',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_NEMOTRON_3_NANO_30B_A3B =  {
    id: 'nvidia/nemotron-3-nano-30b-a3b',
    name: 'NVIDIA: Nemotron 3 Nano 30B A3B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.05,
          cached: 0,
        },
        output: {
          normal: 0.2,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_NEMOTRON_3_NANO_30B_A3B_FREE =  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    name: 'NVIDIA: Nemotron 3 Nano 30B A3B (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 256000,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_NEMOTRON_3_SUPER_120B_A12B =  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    name: 'NVIDIA: Nemotron 3 Super',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.1,
        },
        output: {
          normal: 0.5,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_NEMOTRON_3_SUPER_120B_A12B_FREE =  {
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    name: 'NVIDIA: Nemotron 3 Super (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 262144,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_NEMOTRON_NANO_12B_V2_VL =  {
    id: 'nvidia/nemotron-nano-12b-v2-vl',
    name: 'NVIDIA: Nemotron Nano 12B 2 VL',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_NEMOTRON_NANO_12B_V2_VL_FREE =  {
    id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    name: 'NVIDIA: Nemotron Nano 12B 2 VL (free)',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_NEMOTRON_NANO_9B_V2 =  {
    id: 'nvidia/nemotron-nano-9b-v2',
    name: 'NVIDIA: Nemotron Nano 9B V2',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.04,
          cached: 0,
        },
        output: {
          normal: 0.16,
        },
      },
      image: 0,
    },
  } as const
const NVIDIA_NEMOTRON_NANO_9B_V2_FREE =  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    name: 'NVIDIA: Nemotron Nano 9B V2 (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_3_5_TURBO =  {
    id: 'openai/gpt-3.5-turbo',
    name: 'OpenAI: GPT-3.5 Turbo',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 16385,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 0.5,
          cached: 0,
        },
        output: {
          normal: 1.5,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_3_5_TURBO_0613 =  {
    id: 'openai/gpt-3.5-turbo-0613',
    name: 'OpenAI: GPT-3.5 Turbo (older v0613)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 4095,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 1,
          cached: 0,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_3_5_TURBO_16K =  {
    id: 'openai/gpt-3.5-turbo-16k',
    name: 'OpenAI: GPT-3.5 Turbo 16k',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 16385,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 0,
        },
        output: {
          normal: 4,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_3_5_TURBO_INSTRUCT =  {
    id: 'openai/gpt-3.5-turbo-instruct',
    name: 'OpenAI: GPT-3.5 Turbo Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topLogprobs', 'topP'],
    },
    context_window: 4095,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 1.5,
          cached: 0,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4 =  {
    id: 'openai/gpt-4',
    name: 'OpenAI: GPT-4',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 8191,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 30,
          cached: 0,
        },
        output: {
          normal: 60,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4_0314 =  {
    id: 'openai/gpt-4-0314',
    name: 'OpenAI: GPT-4 (older v0314)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 8191,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 30,
          cached: 0,
        },
        output: {
          normal: 60,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4_1106_PREVIEW =  {
    id: 'openai/gpt-4-1106-preview',
    name: 'OpenAI: GPT-4 Turbo (older v1106)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 10,
          cached: 0,
        },
        output: {
          normal: 30,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4_TURBO =  {
    id: 'openai/gpt-4-turbo',
    name: 'OpenAI: GPT-4 Turbo',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 10,
          cached: 0,
        },
        output: {
          normal: 30,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4_TURBO_PREVIEW =  {
    id: 'openai/gpt-4-turbo-preview',
    name: 'OpenAI: GPT-4 Turbo Preview',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 10,
          cached: 0,
        },
        output: {
          normal: 30,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4_1 =  {
    id: 'openai/gpt-4.1',
    name: 'OpenAI: GPT-4.1',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'maxCompletionTokens', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1047576,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.5,
        },
        output: {
          normal: 8,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4_1_MINI =  {
    id: 'openai/gpt-4.1-mini',
    name: 'OpenAI: GPT-4.1 Mini',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'maxCompletionTokens', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1047576,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0.1,
        },
        output: {
          normal: 1.6,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4_1_NANO =  {
    id: 'openai/gpt-4.1-nano',
    name: 'OpenAI: GPT-4.1 Nano',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'maxCompletionTokens', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1047576,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0.025,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O =  {
    id: 'openai/gpt-4o',
    name: 'OpenAI: GPT-4o',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP', 'webSearchOptions'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O_2024_05_13 =  {
    id: 'openai/gpt-4o-2024-05-13',
    name: 'OpenAI: GPT-4o (2024-05-13)',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP', 'webSearchOptions'],
    },
    context_window: 128000,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 5,
          cached: 0,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O_2024_08_06 =  {
    id: 'openai/gpt-4o-2024-08-06',
    name: 'OpenAI: GPT-4o (2024-08-06)',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP', 'webSearchOptions'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 1.25,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O_2024_11_20 =  {
    id: 'openai/gpt-4o-2024-11-20',
    name: 'OpenAI: GPT-4o (2024-11-20)',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP', 'webSearchOptions'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 1.25,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O_AUDIO_PREVIEW =  {
    id: 'openai/gpt-4o-audio-preview',
    name: 'OpenAI: GPT-4o Audio',
    supports: {
      input: ['audio', 'text'],
      output: ['text', 'audio'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O_MINI =  {
    id: 'openai/gpt-4o-mini',
    name: 'OpenAI: GPT-4o-mini',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP', 'webSearchOptions'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0.075,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O_MINI_2024_07_18 =  {
    id: 'openai/gpt-4o-mini-2024-07-18',
    name: 'OpenAI: GPT-4o-mini (2024-07-18)',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP', 'webSearchOptions'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0.075,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O_MINI_SEARCH_PREVIEW =  {
    id: 'openai/gpt-4o-mini-search-preview',
    name: 'OpenAI: GPT-4o-mini Search Preview',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'webSearchOptions'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O_SEARCH_PREVIEW =  {
    id: 'openai/gpt-4o-search-preview',
    name: 'OpenAI: GPT-4o Search Preview',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'webSearchOptions'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_4O_EXTENDED =  {
    id: 'openai/gpt-4o:extended',
    name: 'OpenAI: GPT-4o (extended)',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP', 'webSearchOptions'],
    },
    context_window: 128000,
    max_output_tokens: 64000,
    pricing: {
      text: {
        input: {
          normal: 6,
          cached: 0,
        },
        output: {
          normal: 18,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5 =  {
    id: 'openai/gpt-5',
    name: 'OpenAI: GPT-5',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.125,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_CHAT =  {
    id: 'openai/gpt-5-chat',
    name: 'OpenAI: GPT-5 Chat',
    supports: {
      input: ['document', 'image', 'text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'seed'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.125,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_CODEX =  {
    id: 'openai/gpt-5-codex',
    name: 'OpenAI: GPT-5 Codex',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.125,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_IMAGE =  {
    id: 'openai/gpt-5-image',
    name: 'OpenAI: GPT-5 Image',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['image', 'text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 10,
          cached: 1.25,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_IMAGE_MINI =  {
    id: 'openai/gpt-5-image-mini',
    name: 'OpenAI: GPT-5 Image Mini',
    supports: {
      input: ['document', 'image', 'text'],
      output: ['image', 'text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0.25,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_MINI =  {
    id: 'openai/gpt-5-mini',
    name: 'OpenAI: GPT-5 Mini',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.25,
          cached: 0.025,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_NANO =  {
    id: 'openai/gpt-5-nano',
    name: 'OpenAI: GPT-5 Nano',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    pricing: {
      text: {
        input: {
          normal: 0.05,
          cached: 0.01,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_PRO =  {
    id: 'openai/gpt-5-pro',
    name: 'OpenAI: GPT-5 Pro',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 15,
          cached: 0,
        },
        output: {
          normal: 120,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_1 =  {
    id: 'openai/gpt-5.1',
    name: 'OpenAI: GPT-5.1',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.13,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_1_CHAT =  {
    id: 'openai/gpt-5.1-chat',
    name: 'OpenAI: GPT-5.1 Chat',
    supports: {
      input: ['document', 'image', 'text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'maxCompletionTokens', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.125,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_1_CODEX =  {
    id: 'openai/gpt-5.1-codex',
    name: 'OpenAI: GPT-5.1-Codex',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.125,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_1_CODEX_MAX =  {
    id: 'openai/gpt-5.1-codex-max',
    name: 'OpenAI: GPT-5.1-Codex-Max',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 1.25,
          cached: 0.125,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_1_CODEX_MINI =  {
    id: 'openai/gpt-5.1-codex-mini',
    name: 'OpenAI: GPT-5.1-Codex-Mini',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.25,
          cached: 0.03,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_2 =  {
    id: 'openai/gpt-5.2',
    name: 'OpenAI: GPT-5.2',
    supports: {
      input: ['document', 'image', 'text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 1.75,
          cached: 0.175,
        },
        output: {
          normal: 14,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_2_CHAT =  {
    id: 'openai/gpt-5.2-chat',
    name: 'OpenAI: GPT-5.2 Chat',
    supports: {
      input: ['document', 'image', 'text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'maxCompletionTokens', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 128000,
    max_output_tokens: 32000,
    pricing: {
      text: {
        input: {
          normal: 1.75,
          cached: 0.175,
        },
        output: {
          normal: 14,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_2_CODEX =  {
    id: 'openai/gpt-5.2-codex',
    name: 'OpenAI: GPT-5.2-Codex',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 1.75,
          cached: 0.175,
        },
        output: {
          normal: 14,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_2_PRO =  {
    id: 'openai/gpt-5.2-pro',
    name: 'OpenAI: GPT-5.2 Pro',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 21,
          cached: 0,
        },
        output: {
          normal: 168,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_3_CHAT =  {
    id: 'openai/gpt-5.3-chat',
    name: 'OpenAI: GPT-5.3 Chat',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'maxCompletionTokens', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 1.75,
          cached: 0.175,
        },
        output: {
          normal: 14,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_3_CODEX =  {
    id: 'openai/gpt-5.3-codex',
    name: 'OpenAI: GPT-5.3-Codex',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 1.75,
          cached: 0.175,
        },
        output: {
          normal: 14,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_4 =  {
    id: 'openai/gpt-5.4',
    name: 'OpenAI: GPT-5.4',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 1050000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0.25,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_4_MINI =  {
    id: 'openai/gpt-5.4-mini',
    name: 'OpenAI: GPT-5.4 Mini',
    supports: {
      input: ['document', 'image', 'text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.75,
          cached: 0.075,
        },
        output: {
          normal: 4.5,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_4_NANO =  {
    id: 'openai/gpt-5.4-nano',
    name: 'OpenAI: GPT-5.4 Nano',
    supports: {
      input: ['document', 'image', 'text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 400000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0.02,
        },
        output: {
          normal: 1.25,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_5_4_PRO =  {
    id: 'openai/gpt-5.4-pro',
    name: 'OpenAI: GPT-5.4 Pro',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 1050000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 30,
          cached: 0,
        },
        output: {
          normal: 180,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_AUDIO =  {
    id: 'openai/gpt-audio',
    name: 'OpenAI: GPT Audio',
    supports: {
      input: ['text', 'audio'],
      output: ['text', 'audio'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 2.5,
          cached: 0,
        },
        output: {
          normal: 10,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_AUDIO_MINI =  {
    id: 'openai/gpt-audio-mini',
    name: 'OpenAI: GPT Audio Mini',
    supports: {
      input: ['text', 'audio'],
      output: ['text', 'audio'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 128000,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.6,
          cached: 0,
        },
        output: {
          normal: 2.4,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_OSS_120B =  {
    id: 'openai/gpt-oss-120b',
    name: 'OpenAI: gpt-oss-120b',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.039,
          cached: 0,
        },
        output: {
          normal: 0.19,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_OSS_120B_FREE =  {
    id: 'openai/gpt-oss-120b:free',
    name: 'OpenAI: gpt-oss-120b (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'seed', 'stop', 'temperature', 'toolChoice'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_OSS_20B =  {
    id: 'openai/gpt-oss-20b',
    name: 'OpenAI: gpt-oss-20b',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.03,
          cached: 0,
        },
        output: {
          normal: 0.14,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_OSS_20B_FREE =  {
    id: 'openai/gpt-oss-20b:free',
    name: 'OpenAI: gpt-oss-20b (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'seed', 'stop', 'temperature', 'toolChoice'],
    },
    context_window: 131072,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_GPT_OSS_SAFEGUARD_20B =  {
    id: 'openai/gpt-oss-safeguard-20b',
    name: 'OpenAI: gpt-oss-safeguard-20b',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.075,
          cached: 0.037,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O1 =  {
    id: 'openai/o1',
    name: 'OpenAI: o1',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 15,
          cached: 7.5,
        },
        output: {
          normal: 60,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O1_PRO =  {
    id: 'openai/o1-pro',
    name: 'OpenAI: o1-pro',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 150,
          cached: 0,
        },
        output: {
          normal: 600,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O3 =  {
    id: 'openai/o3',
    name: 'OpenAI: o3',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.5,
        },
        output: {
          normal: 8,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O3_DEEP_RESEARCH =  {
    id: 'openai/o3-deep-research',
    name: 'OpenAI: o3 Deep Research',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 10,
          cached: 2.5,
        },
        output: {
          normal: 40,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O3_MINI =  {
    id: 'openai/o3-mini',
    name: 'OpenAI: o3 Mini',
    supports: {
      input: ['text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 1.1,
          cached: 0.55,
        },
        output: {
          normal: 4.4,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O3_MINI_HIGH =  {
    id: 'openai/o3-mini-high',
    name: 'OpenAI: o3 Mini High',
    supports: {
      input: ['text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 1.1,
          cached: 0.55,
        },
        output: {
          normal: 4.4,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O3_PRO =  {
    id: 'openai/o3-pro',
    name: 'OpenAI: o3 Pro',
    supports: {
      input: ['text', 'document', 'image'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 20,
          cached: 0,
        },
        output: {
          normal: 80,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O4_MINI =  {
    id: 'openai/o4-mini',
    name: 'OpenAI: o4 Mini',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 1.1,
          cached: 0.275,
        },
        output: {
          normal: 4.4,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O4_MINI_DEEP_RESEARCH =  {
    id: 'openai/o4-mini-deep-research',
    name: 'OpenAI: o4 Mini Deep Research',
    supports: {
      input: ['document', 'image', 'text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.5,
        },
        output: {
          normal: 8,
        },
      },
      image: 0,
    },
  } as const
const OPENAI_O4_MINI_HIGH =  {
    id: 'openai/o4-mini-high',
    name: 'OpenAI: o4 Mini High',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'toolChoice'],
    },
    context_window: 200000,
    max_output_tokens: 100000,
    pricing: {
      text: {
        input: {
          normal: 1.1,
          cached: 0.275,
        },
        output: {
          normal: 4.4,
        },
      },
      image: 0,
    },
  } as const
const OPENROUTER_AUTO =  {
    id: 'openrouter/auto',
    name: 'Auto Router',
    supports: {
      input: ['text', 'image', 'audio', 'document', 'video'],
      output: ['text', 'image'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP', 'webSearchOptions'],
    },
    context_window: 2000000,
    pricing: {
      text: {
        input: {
          normal: -1000000,
          cached: 0,
        },
        output: {
          normal: -1000000,
        },
      },
      image: 0,
    },
  } as const
const OPENROUTER_BODYBUILDER =  {
    id: 'openrouter/bodybuilder',
    name: 'Body Builder (beta)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: [],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: -1000000,
          cached: 0,
        },
        output: {
          normal: -1000000,
        },
      },
      image: 0,
    },
  } as const
const OPENROUTER_ELEPHANT_ALPHA =  {
    id: 'openrouter/elephant-alpha',
    name: 'Elephant',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'responseFormat', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const OPENROUTER_FREE =  {
    id: 'openrouter/free',
    name: 'Free Models Router',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 200000,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const PERPLEXITY_SONAR =  {
    id: 'perplexity/sonar',
    name: 'Perplexity: Sonar',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'temperature', 'topK', 'topP', 'webSearchOptions'],
    },
    context_window: 127072,
    pricing: {
      text: {
        input: {
          normal: 1,
          cached: 0,
        },
        output: {
          normal: 1,
        },
      },
      image: 0,
    },
  } as const
const PERPLEXITY_SONAR_DEEP_RESEARCH =  {
    id: 'perplexity/sonar-deep-research',
    name: 'Perplexity: Sonar Deep Research',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'temperature', 'topK', 'topP', 'webSearchOptions'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0,
        },
        output: {
          normal: 8,
        },
      },
      image: 0,
    },
  } as const
const PERPLEXITY_SONAR_PRO =  {
    id: 'perplexity/sonar-pro',
    name: 'Perplexity: Sonar Pro',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'temperature', 'topK', 'topP', 'webSearchOptions'],
    },
    context_window: 200000,
    max_output_tokens: 8000,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 0,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const PERPLEXITY_SONAR_PRO_SEARCH =  {
    id: 'perplexity/sonar-pro-search',
    name: 'Perplexity: Sonar Pro Search',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'temperature', 'topK', 'topP', 'webSearchOptions'],
    },
    context_window: 200000,
    max_output_tokens: 8000,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 0,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const PERPLEXITY_SONAR_REASONING_PRO =  {
    id: 'perplexity/sonar-reasoning-pro',
    name: 'Perplexity: Sonar Reasoning Pro',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'temperature', 'topK', 'topP', 'webSearchOptions'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0,
        },
        output: {
          normal: 8,
        },
      },
      image: 0,
    },
  } as const
const PRIME_INTELLECT_INTELLECT_3 =  {
    id: 'prime-intellect/intellect-3',
    name: 'Prime Intellect: INTELLECT-3',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0,
        },
        output: {
          normal: 1.1,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_2_5_72B_INSTRUCT =  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen2.5 72B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.12,
          cached: 0,
        },
        output: {
          normal: 0.39,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_2_5_7B_INSTRUCT =  {
    id: 'qwen/qwen-2.5-7b-instruct',
    name: 'Qwen: Qwen2.5 7B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.04,
          cached: 0,
        },
        output: {
          normal: 0.1,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_2_5_CODER_32B_INSTRUCT =  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen2.5 Coder 32B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.66,
          cached: 0,
        },
        output: {
          normal: 1,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_MAX =  {
    id: 'qwen/qwen-max',
    name: 'Qwen: Qwen-Max ',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 1.04,
          cached: 0.208,
        },
        output: {
          normal: 4.16,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_PLUS =  {
    id: 'qwen/qwen-plus',
    name: 'Qwen: Qwen-Plus',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.26,
          cached: 0.052,
        },
        output: {
          normal: 0.78,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_PLUS_2025_07_28 =  {
    id: 'qwen/qwen-plus-2025-07-28',
    name: 'Qwen: Qwen Plus 0728',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.26,
          cached: 0,
        },
        output: {
          normal: 0.78,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_PLUS_2025_07_28_THINKING =  {
    id: 'qwen/qwen-plus-2025-07-28:thinking',
    name: 'Qwen: Qwen Plus 0728 (thinking)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.26,
          cached: 0,
        },
        output: {
          normal: 0.78,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_TURBO =  {
    id: 'qwen/qwen-turbo',
    name: 'Qwen: Qwen-Turbo',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.0325,
          cached: 0.0065,
        },
        output: {
          normal: 0.13,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_VL_MAX =  {
    id: 'qwen/qwen-vl-max',
    name: 'Qwen: Qwen VL Max',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.52,
          cached: 0,
        },
        output: {
          normal: 2.08,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN_VL_PLUS =  {
    id: 'qwen/qwen-vl-plus',
    name: 'Qwen: Qwen VL Plus',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.1365,
          cached: 0.0273,
        },
        output: {
          normal: 0.4095,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN2_5_VL_32B_INSTRUCT =  {
    id: 'qwen/qwen2.5-vl-32b-instruct',
    name: 'Qwen: Qwen2.5 VL 32B Instruct',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN2_5_VL_72B_INSTRUCT =  {
    id: 'qwen/qwen2.5-vl-72b-instruct',
    name: 'Qwen: Qwen2.5 VL 72B Instruct',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.8,
          cached: 0,
        },
        output: {
          normal: 0.8,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_14B =  {
    id: 'qwen/qwen3-14b',
    name: 'Qwen: Qwen3 14B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 40960,
    max_output_tokens: 40960,
    pricing: {
      text: {
        input: {
          normal: 0.06,
          cached: 0,
        },
        output: {
          normal: 0.24,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_235B_A22B =  {
    id: 'qwen/qwen3-235b-a22b',
    name: 'Qwen: Qwen3 235B A22B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.455,
          cached: 0,
        },
        output: {
          normal: 1.82,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_235B_A22B_2507 =  {
    id: 'qwen/qwen3-235b-a22b-2507',
    name: 'Qwen: Qwen3 235B A22B Instruct 2507',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.071,
          cached: 0,
        },
        output: {
          normal: 0.1,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_235B_A22B_THINKING_2507 =  {
    id: 'qwen/qwen3-235b-a22b-thinking-2507',
    name: 'Qwen: Qwen3 235B A22B Thinking 2507',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.1495,
          cached: 0,
        },
        output: {
          normal: 1.495,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_30B_A3B =  {
    id: 'qwen/qwen3-30b-a3b',
    name: 'Qwen: Qwen3 30B A3B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 40960,
    max_output_tokens: 40960,
    pricing: {
      text: {
        input: {
          normal: 0.08,
          cached: 0,
        },
        output: {
          normal: 0.28,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_30B_A3B_INSTRUCT_2507 =  {
    id: 'qwen/qwen3-30b-a3b-instruct-2507',
    name: 'Qwen: Qwen3 30B A3B Instruct 2507',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.09,
          cached: 0,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_30B_A3B_THINKING_2507 =  {
    id: 'qwen/qwen3-30b-a3b-thinking-2507',
    name: 'Qwen: Qwen3 30B A3B Thinking 2507',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.08,
          cached: 0.08,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_32B =  {
    id: 'qwen/qwen3-32b',
    name: 'Qwen: Qwen3 32B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 40960,
    max_output_tokens: 40960,
    pricing: {
      text: {
        input: {
          normal: 0.08,
          cached: 0.04,
        },
        output: {
          normal: 0.24,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_8B =  {
    id: 'qwen/qwen3-8b',
    name: 'Qwen: Qwen3 8B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 40960,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.05,
          cached: 0.05,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_CODER =  {
    id: 'qwen/qwen3-coder',
    name: 'Qwen: Qwen3 Coder 480B A35B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.22,
          cached: 0.022,
        },
        output: {
          normal: 1,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_CODER_30B_A3B_INSTRUCT =  {
    id: 'qwen/qwen3-coder-30b-a3b-instruct',
    name: 'Qwen: Qwen3 Coder 30B A3B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 160000,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.07,
          cached: 0,
        },
        output: {
          normal: 0.27,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_CODER_FLASH =  {
    id: 'qwen/qwen3-coder-flash',
    name: 'Qwen: Qwen3 Coder Flash',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.195,
          cached: 0.039,
        },
        output: {
          normal: 0.975,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_CODER_NEXT =  {
    id: 'qwen/qwen3-coder-next',
    name: 'Qwen: Qwen3 Coder Next',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0.12,
        },
        output: {
          normal: 0.8,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_CODER_PLUS =  {
    id: 'qwen/qwen3-coder-plus',
    name: 'Qwen: Qwen3 Coder Plus',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.65,
          cached: 0.13,
        },
        output: {
          normal: 3.25,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_CODER_FREE =  {
    id: 'qwen/qwen3-coder:free',
    name: 'Qwen: Qwen3 Coder 480B A35B (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262000,
    max_output_tokens: 262000,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_MAX =  {
    id: 'qwen/qwen3-max',
    name: 'Qwen: Qwen3 Max',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.78,
          cached: 0.156,
        },
        output: {
          normal: 3.9,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_MAX_THINKING =  {
    id: 'qwen/qwen3-max-thinking',
    name: 'Qwen: Qwen3 Max Thinking',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.78,
          cached: 0,
        },
        output: {
          normal: 3.9,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT =  {
    id: 'qwen/qwen3-next-80b-a3b-instruct',
    name: 'Qwen: Qwen3 Next 80B A3B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.09,
          cached: 0,
        },
        output: {
          normal: 1.1,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT_FREE =  {
    id: 'qwen/qwen3-next-80b-a3b-instruct:free',
    name: 'Qwen: Qwen3 Next 80B A3B Instruct (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_NEXT_80B_A3B_THINKING =  {
    id: 'qwen/qwen3-next-80b-a3b-thinking',
    name: 'Qwen: Qwen3 Next 80B A3B Thinking',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.0975,
          cached: 0,
        },
        output: {
          normal: 0.78,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_VL_235B_A22B_INSTRUCT =  {
    id: 'qwen/qwen3-vl-235b-a22b-instruct',
    name: 'Qwen: Qwen3 VL 235B A22B Instruct',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0.11,
        },
        output: {
          normal: 0.88,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_VL_235B_A22B_THINKING =  {
    id: 'qwen/qwen3-vl-235b-a22b-thinking',
    name: 'Qwen: Qwen3 VL 235B A22B Thinking',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.26,
          cached: 0,
        },
        output: {
          normal: 2.6,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_VL_30B_A3B_INSTRUCT =  {
    id: 'qwen/qwen3-vl-30b-a3b-instruct',
    name: 'Qwen: Qwen3 VL 30B A3B Instruct',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.13,
          cached: 0,
        },
        output: {
          normal: 0.52,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_VL_30B_A3B_THINKING =  {
    id: 'qwen/qwen3-vl-30b-a3b-thinking',
    name: 'Qwen: Qwen3 VL 30B A3B Thinking',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.13,
          cached: 0,
        },
        output: {
          normal: 1.56,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_VL_32B_INSTRUCT =  {
    id: 'qwen/qwen3-vl-32b-instruct',
    name: 'Qwen: Qwen3 VL 32B Instruct',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.104,
          cached: 0,
        },
        output: {
          normal: 0.416,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_VL_8B_INSTRUCT =  {
    id: 'qwen/qwen3-vl-8b-instruct',
    name: 'Qwen: Qwen3 VL 8B Instruct',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.08,
          cached: 0,
        },
        output: {
          normal: 0.5,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_VL_8B_THINKING =  {
    id: 'qwen/qwen3-vl-8b-thinking',
    name: 'Qwen: Qwen3 VL 8B Thinking',
    supports: {
      input: ['image', 'text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.117,
          cached: 0,
        },
        output: {
          normal: 1.365,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_5_122B_A10B =  {
    id: 'qwen/qwen3.5-122b-a10b',
    name: 'Qwen: Qwen3.5-122B-A10B',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.26,
          cached: 0,
        },
        output: {
          normal: 2.08,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_5_27B =  {
    id: 'qwen/qwen3.5-27b',
    name: 'Qwen: Qwen3.5-27B',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.195,
          cached: 0,
        },
        output: {
          normal: 1.56,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_5_35B_A3B =  {
    id: 'qwen/qwen3.5-35b-a3b',
    name: 'Qwen: Qwen3.5-35B-A3B',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.1625,
          cached: 0,
        },
        output: {
          normal: 1.3,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_5_397B_A17B =  {
    id: 'qwen/qwen3.5-397b-a17b',
    name: 'Qwen: Qwen3.5 397B A17B',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.39,
          cached: 0,
        },
        output: {
          normal: 2.34,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_5_9B =  {
    id: 'qwen/qwen3.5-9b',
    name: 'Qwen: Qwen3.5-9B',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 256000,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.05,
          cached: 0,
        },
        output: {
          normal: 0.15,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_5_FLASH_02_23 =  {
    id: 'qwen/qwen3.5-flash-02-23',
    name: 'Qwen: Qwen3.5-Flash',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.065,
          cached: 0,
        },
        output: {
          normal: 0.26,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_5_PLUS_02_15 =  {
    id: 'qwen/qwen3.5-plus-02-15',
    name: 'Qwen: Qwen3.5 Plus 2026-02-15',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.26,
          cached: 0,
        },
        output: {
          normal: 1.56,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWEN3_6_PLUS =  {
    id: 'qwen/qwen3.6-plus',
    name: 'Qwen: Qwen3.6 Plus',
    supports: {
      input: ['text', 'image', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1000000,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.325,
          cached: 0,
        },
        output: {
          normal: 1.95,
        },
      },
      image: 0,
    },
  } as const
const QWEN_QWQ_32B =  {
    id: 'qwen/qwq-32b',
    name: 'Qwen: QwQ 32B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'reasoning', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0,
        },
        output: {
          normal: 0.58,
        },
      },
      image: 0,
    },
  } as const
const REKAAI_REKA_EDGE =  {
    id: 'rekaai/reka-edge',
    name: 'Reka Edge',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 16384,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0,
        },
        output: {
          normal: 0.1,
        },
      },
      image: 0,
    },
  } as const
const REKAAI_REKA_FLASH_3 =  {
    id: 'rekaai/reka-flash-3',
    name: 'Reka Flash 3',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 65536,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0,
        },
        output: {
          normal: 0.2,
        },
      },
      image: 0,
    },
  } as const
const RELACE_RELACE_APPLY_3 =  {
    id: 'relace/relace-apply-3',
    name: 'Relace: Relace Apply 3',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'seed', 'stop'],
    },
    context_window: 256000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.85,
          cached: 0,
        },
        output: {
          normal: 1.25,
        },
      },
      image: 0,
    },
  } as const
const RELACE_RELACE_SEARCH =  {
    id: 'relace/relace-search',
    name: 'Relace: Relace Search',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'seed', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 256000,
    max_output_tokens: 128000,
    pricing: {
      text: {
        input: {
          normal: 1,
          cached: 0,
        },
        output: {
          normal: 3,
        },
      },
      image: 0,
    },
  } as const
const SAO10K_L3_EURYALE_70B =  {
    id: 'sao10k/l3-euryale-70b',
    name: 'Sao10k: Llama 3 Euryale 70B v2.1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 8192,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 1.48,
          cached: 0,
        },
        output: {
          normal: 1.48,
        },
      },
      image: 0,
    },
  } as const
const SAO10K_L3_LUNARIS_8B =  {
    id: 'sao10k/l3-lunaris-8b',
    name: 'Sao10K: Llama 3 8B Lunaris',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.04,
          cached: 0,
        },
        output: {
          normal: 0.05,
        },
      },
      image: 0,
    },
  } as const
const SAO10K_L3_1_70B_HANAMI_X1 =  {
    id: 'sao10k/l3.1-70b-hanami-x1',
    name: 'Sao10K: Llama 3.1 70B Hanami x1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 16000,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 0,
        },
        output: {
          normal: 3,
        },
      },
      image: 0,
    },
  } as const
const SAO10K_L3_1_EURYALE_70B =  {
    id: 'sao10k/l3.1-euryale-70b',
    name: 'Sao10K: Llama 3.1 Euryale 70B v2.2',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.85,
          cached: 0,
        },
        output: {
          normal: 0.85,
        },
      },
      image: 0,
    },
  } as const
const SAO10K_L3_3_EURYALE_70B =  {
    id: 'sao10k/l3.3-euryale-70b',
    name: 'Sao10K: Llama 3.3 Euryale 70B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.65,
          cached: 0,
        },
        output: {
          normal: 0.75,
        },
      },
      image: 0,
    },
  } as const
const STEPFUN_STEP_3_5_FLASH =  {
    id: 'stepfun/step-3.5-flash',
    name: 'StepFun: Step 3.5 Flash',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0,
        },
        output: {
          normal: 0.3,
        },
      },
      image: 0,
    },
  } as const
const SWITCHPOINT_ROUTER =  {
    id: 'switchpoint/router',
    name: 'Switchpoint Router',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.85,
          cached: 0,
        },
        output: {
          normal: 3.4,
        },
      },
      image: 0,
    },
  } as const
const TENCENT_HUNYUAN_A13B_INSTRUCT =  {
    id: 'tencent/hunyuan-a13b-instruct',
    name: 'Tencent: Hunyuan A13B Instruct',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'reasoning', 'responseFormat', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.14,
          cached: 0,
        },
        output: {
          normal: 0.57,
        },
      },
      image: 0,
    },
  } as const
const THEDRUMMER_CYDONIA_24B_V4_1 =  {
    id: 'thedrummer/cydonia-24b-v4.1',
    name: 'TheDrummer: Cydonia 24B V4.1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.15,
        },
        output: {
          normal: 0.5,
        },
      },
      image: 0,
    },
  } as const
const THEDRUMMER_ROCINANTE_12B =  {
    id: 'thedrummer/rocinante-12b',
    name: 'TheDrummer: Rocinante 12B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.17,
          cached: 0,
        },
        output: {
          normal: 0.43,
        },
      },
      image: 0,
    },
  } as const
const THEDRUMMER_SKYFALL_36B_V2 =  {
    id: 'thedrummer/skyfall-36b-v2',
    name: 'TheDrummer: Skyfall 36B V2',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.55,
          cached: 0.25,
        },
        output: {
          normal: 0.8,
        },
      },
      image: 0,
    },
  } as const
const THEDRUMMER_UNSLOPNEMO_12B =  {
    id: 'thedrummer/unslopnemo-12b',
    name: 'TheDrummer: UnslopNemo 12B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 32768,
    max_output_tokens: 32768,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const TNGTECH_DEEPSEEK_R1T2_CHIMERA =  {
    id: 'tngtech/deepseek-r1t2-chimera',
    name: 'TNG: DeepSeek R1T2 Chimera',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 163840,
    max_output_tokens: 163840,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.15,
        },
        output: {
          normal: 1.1,
        },
      },
      image: 0,
    },
  } as const
const UNDI95_REMM_SLERP_L2_13B =  {
    id: 'undi95/remm-slerp-l2-13b',
    name: 'ReMM SLERP 13B',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'topA', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 6144,
    max_output_tokens: 4096,
    pricing: {
      text: {
        input: {
          normal: 0.45,
          cached: 0,
        },
        output: {
          normal: 0.65,
        },
      },
      image: 0,
    },
  } as const
const UPSTAGE_SOLAR_PRO_3 =  {
    id: 'upstage/solar-pro-3',
    name: 'Upstage: Solar Pro 3',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'temperature', 'toolChoice'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.15,
          cached: 0.015,
        },
        output: {
          normal: 0.6,
        },
      },
      image: 0,
    },
  } as const
const WRITER_PALMYRA_X5 =  {
    id: 'writer/palmyra-x5',
    name: 'Writer: Palmyra X5',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'stop', 'temperature', 'topK', 'topP'],
    },
    context_window: 1040000,
    max_output_tokens: 8192,
    pricing: {
      text: {
        input: {
          normal: 0.6,
          cached: 0,
        },
        output: {
          normal: 6,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_3 =  {
    id: 'x-ai/grok-3',
    name: 'xAI: Grok 3',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 0.75,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_3_BETA =  {
    id: 'x-ai/grok-3-beta',
    name: 'xAI: Grok 3 Beta',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'logprobs', 'maxCompletionTokens', 'presencePenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 0.75,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_3_MINI =  {
    id: 'x-ai/grok-3-mini',
    name: 'xAI: Grok 3 Mini',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'logprobs', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.075,
        },
        output: {
          normal: 0.5,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_3_MINI_BETA =  {
    id: 'x-ai/grok-3-mini-beta',
    name: 'xAI: Grok 3 Mini Beta',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'logprobs', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0.075,
        },
        output: {
          normal: 0.5,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_4 =  {
    id: 'x-ai/grok-4',
    name: 'xAI: Grok 4',
    supports: {
      input: ['image', 'text', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'logprobs', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 256000,
    pricing: {
      text: {
        input: {
          normal: 3,
          cached: 0.75,
        },
        output: {
          normal: 15,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_4_FAST =  {
    id: 'x-ai/grok-4-fast',
    name: 'xAI: Grok 4 Fast',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'logprobs', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 2000000,
    max_output_tokens: 30000,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0.05,
        },
        output: {
          normal: 0.5,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_4_1_FAST =  {
    id: 'x-ai/grok-4.1-fast',
    name: 'xAI: Grok 4.1 Fast',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'logprobs', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 2000000,
    max_output_tokens: 30000,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0.05,
        },
        output: {
          normal: 0.5,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_4_20 =  {
    id: 'x-ai/grok-4.20',
    name: 'xAI: Grok 4.20',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'logprobs', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 2000000,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.2,
        },
        output: {
          normal: 6,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_4_20_MULTI_AGENT =  {
    id: 'x-ai/grok-4.20-multi-agent',
    name: 'xAI: Grok 4.20 Multi-Agent',
    supports: {
      input: ['text', 'image', 'document'],
      output: ['text'],
      supports: ['includeReasoning', 'logprobs', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'temperature', 'topLogprobs', 'topP'],
    },
    context_window: 2000000,
    pricing: {
      text: {
        input: {
          normal: 2,
          cached: 0.2,
        },
        output: {
          normal: 6,
        },
      },
      image: 0,
    },
  } as const
const X_AI_GROK_CODE_FAST_1 =  {
    id: 'x-ai/grok-code-fast-1',
    name: 'xAI: Grok Code Fast 1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'logprobs', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topLogprobs', 'topP'],
    },
    context_window: 256000,
    max_output_tokens: 10000,
    pricing: {
      text: {
        input: {
          normal: 0.2,
          cached: 0.02,
        },
        output: {
          normal: 1.5,
        },
      },
      image: 0,
    },
  } as const
const XIAOMI_MIMO_V2_FLASH =  {
    id: 'xiaomi/mimo-v2-flash',
    name: 'Xiaomi: MiMo-V2-Flash',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.09,
          cached: 0.045,
        },
        output: {
          normal: 0.29,
        },
      },
      image: 0,
    },
  } as const
const XIAOMI_MIMO_V2_OMNI =  {
    id: 'xiaomi/mimo-v2-omni',
    name: 'Xiaomi: MiMo-V2-Omni',
    supports: {
      input: ['text', 'audio', 'image', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 262144,
    max_output_tokens: 65536,
    pricing: {
      text: {
        input: {
          normal: 0.4,
          cached: 0.08,
        },
        output: {
          normal: 2,
        },
      },
      image: 0,
    },
  } as const
const XIAOMI_MIMO_V2_PRO =  {
    id: 'xiaomi/mimo-v2-pro',
    name: 'Xiaomi: MiMo-V2-Pro',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'responseFormat', 'stop', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 1048576,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 1,
          cached: 0.2,
        },
        output: {
          normal: 3,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_4_32B =  {
    id: 'z-ai/glm-4-32b',
    name: 'Z.ai: GLM 4 32B ',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['maxCompletionTokens', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 128000,
    pricing: {
      text: {
        input: {
          normal: 0.1,
          cached: 0,
        },
        output: {
          normal: 0.1,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_4_5 =  {
    id: 'z-ai/glm-4.5',
    name: 'Z.ai: GLM 4.5',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 98304,
    pricing: {
      text: {
        input: {
          normal: 0.6,
          cached: 0.11,
        },
        output: {
          normal: 2.2,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_4_5_AIR =  {
    id: 'z-ai/glm-4.5-air',
    name: 'Z.ai: GLM 4.5 Air',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 98304,
    pricing: {
      text: {
        input: {
          normal: 0.13,
          cached: 0.025,
        },
        output: {
          normal: 0.85,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_4_5_AIR_FREE =  {
    id: 'z-ai/glm-4.5-air:free',
    name: 'Z.ai: GLM 4.5 Air (free)',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 96000,
    pricing: {
      text: {
        input: {
          normal: 0,
          cached: 0,
        },
        output: {
          normal: 0,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_4_5V =  {
    id: 'z-ai/glm-4.5v',
    name: 'Z.ai: GLM 4.5V',
    supports: {
      input: ['text', 'image'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 65536,
    max_output_tokens: 16384,
    pricing: {
      text: {
        input: {
          normal: 0.6,
          cached: 0.11,
        },
        output: {
          normal: 1.8,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_4_6 =  {
    id: 'z-ai/glm-4.6',
    name: 'Z.ai: GLM 4.6',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 204800,
    max_output_tokens: 204800,
    pricing: {
      text: {
        input: {
          normal: 0.39,
          cached: 0,
        },
        output: {
          normal: 1.9,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_4_6V =  {
    id: 'z-ai/glm-4.6v',
    name: 'Z.ai: GLM 4.6V',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 131072,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.3,
          cached: 0,
        },
        output: {
          normal: 0.9,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_4_7 =  {
    id: 'z-ai/glm-4.7',
    name: 'Z.ai: GLM 4.7',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 202752,
    max_output_tokens: 65535,
    pricing: {
      text: {
        input: {
          normal: 0.39,
          cached: 0.195,
        },
        output: {
          normal: 1.75,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_4_7_FLASH =  {
    id: 'z-ai/glm-4.7-flash',
    name: 'Z.ai: GLM 4.7 Flash',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 202752,
    pricing: {
      text: {
        input: {
          normal: 0.06,
          cached: 0.0100000002,
        },
        output: {
          normal: 0.4,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_5 =  {
    id: 'z-ai/glm-5',
    name: 'Z.ai: GLM 5',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 80000,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 0.72,
          cached: 0,
        },
        output: {
          normal: 2.3,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_5_TURBO =  {
    id: 'z-ai/glm-5-turbo',
    name: 'Z.ai: GLM 5 Turbo',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'maxCompletionTokens', 'minP', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topP'],
    },
    context_window: 202752,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 1.2,
          cached: 0.24,
        },
        output: {
          normal: 4,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_5_1 =  {
    id: 'z-ai/glm-5.1',
    name: 'Z.ai: GLM 5.1',
    supports: {
      input: ['text'],
      output: ['text'],
      supports: ['frequencyPenalty', 'includeReasoning', 'logitBias', 'logprobs', 'maxCompletionTokens', 'minP', 'parallelToolCalls', 'presencePenalty', 'reasoning', 'repetitionPenalty', 'responseFormat', 'seed', 'stop', 'temperature', 'toolChoice', 'topK', 'topLogprobs', 'topP'],
    },
    context_window: 202752,
    max_output_tokens: 65535,
    pricing: {
      text: {
        input: {
          normal: 0.95,
          cached: 0.475,
        },
        output: {
          normal: 3.15,
        },
      },
      image: 0,
    },
  } as const
const Z_AI_GLM_5V_TURBO =  {
    id: 'z-ai/glm-5v-turbo',
    name: 'Z.ai: GLM 5V Turbo',
    supports: {
      input: ['image', 'text', 'video'],
      output: ['text'],
      supports: ['includeReasoning', 'maxCompletionTokens', 'reasoning', 'responseFormat', 'temperature', 'toolChoice', 'topP'],
    },
    context_window: 202752,
    max_output_tokens: 131072,
    pricing: {
      text: {
        input: {
          normal: 1.2,
          cached: 0.24,
        },
        output: {
          normal: 4,
        },
      },
      image: 0,
    },
  } as const


export type OpenRouterModelOptionsByName  = {
  [AI21_JAMBA_LARGE_1_7.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [AION_LABS_AION_1_0.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'temperature' | 'topP'>;
  [AION_LABS_AION_1_0_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'temperature' | 'topP'>;
  [AION_LABS_AION_2_0.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'temperature' | 'topP'>;
  [AION_LABS_AION_RP_LLAMA_3_1_8B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'temperature' | 'topP'>;
  [ALFREDPROS_CODELLAMA_7B_INSTRUCT_SOLIDITY.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [ALIBABA_TONGYI_DEEPRESEARCH_30B_A3B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ALLENAI_OLMO_2_0325_32B_INSTRUCT.id]: OpenRouterCommonOptions & OpenRouterBaseOptions;
  [ALLENAI_OLMO_3_32B_THINK.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [ALLENAI_OLMO_3_1_32B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ALPINDALE_GOLIATH_120B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topA' | 'topK' | 'topLogprobs' | 'topP'>;
  [AMAZON_NOVA_2_LITE_V1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [AMAZON_NOVA_LITE_V1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [AMAZON_NOVA_MICRO_V1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [AMAZON_NOVA_PREMIER_V1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [AMAZON_NOVA_PRO_V1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [ANTHRACITE_ORG_MAGNUM_V4_72B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topA' | 'topK' | 'topLogprobs' | 'topP'>;
  [ANTHROPIC_CLAUDE_3_HAIKU.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ANTHROPIC_CLAUDE_3_5_HAIKU.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ANTHROPIC_CLAUDE_3_7_SONNET.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ANTHROPIC_CLAUDE_3_7_SONNET_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [ANTHROPIC_CLAUDE_HAIKU_4_5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ANTHROPIC_CLAUDE_OPUS_4.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ANTHROPIC_CLAUDE_OPUS_4_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ANTHROPIC_CLAUDE_OPUS_4_5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'verbosity'>;
  [ANTHROPIC_CLAUDE_OPUS_4_6.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP' | 'verbosity'>;
  [ANTHROPIC_CLAUDE_OPUS_4_6_FAST.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topP' | 'verbosity'>;
  [ANTHROPIC_CLAUDE_SONNET_4.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ANTHROPIC_CLAUDE_SONNET_4_5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ANTHROPIC_CLAUDE_SONNET_4_6.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP' | 'verbosity'>;
  [ARCEE_AI_CODER_LARGE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [ARCEE_AI_MAESTRO_REASONING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [ARCEE_AI_SPOTLIGHT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [ARCEE_AI_TRINITY_LARGE_PREVIEW_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'temperature' | 'topK' | 'topP'>;
  [ARCEE_AI_TRINITY_LARGE_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [ARCEE_AI_TRINITY_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [ARCEE_AI_VIRTUOSO_LARGE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [BAIDU_ERNIE_4_5_21B_A3B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [BAIDU_ERNIE_4_5_21B_A3B_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [BAIDU_ERNIE_4_5_300B_A47B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [BAIDU_ERNIE_4_5_VL_28B_A3B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [BAIDU_ERNIE_4_5_VL_424B_A47B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [BYTEDANCE_SEED_SEED_1_6.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [BYTEDANCE_SEED_SEED_1_6_FLASH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [BYTEDANCE_SEED_SEED_2_0_LITE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [BYTEDANCE_SEED_SEED_2_0_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [BYTEDANCE_UI_TARS_1_5_7B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [COGNITIVECOMPUTATIONS_DOLPHIN_MISTRAL_24B_VENICE_EDITION_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [COHERE_COMMAND_A.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [COHERE_COMMAND_R_08_2024.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [COHERE_COMMAND_R_PLUS_08_2024.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [COHERE_COMMAND_R7B_12_2024.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [DEEPCOGITO_COGITO_V2_1_671B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_CHAT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_CHAT_V3_0324.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_CHAT_V3_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_R1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_R1_0528.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_LLAMA_70B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_32B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'topLogprobs' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_V3_1_TERMINUS.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_V3_2.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_V3_2_EXP.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [DEEPSEEK_DEEPSEEK_V3_2_SPECIALE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [ESSENTIALAI_RNJ_1_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [GOOGLE_GEMINI_2_0_FLASH_001.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_2_0_FLASH_LITE_001.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_2_5_FLASH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_2_5_FLASH_IMAGE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topP'>;
  [GOOGLE_GEMINI_2_5_FLASH_LITE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_2_5_FLASH_LITE_PREVIEW_09_2025.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_2_5_PRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_2_5_PRO_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_2_5_PRO_PREVIEW_05_06.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_3_FLASH_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topP'>;
  [GOOGLE_GEMINI_3_1_FLASH_IMAGE_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topP'>;
  [GOOGLE_GEMINI_3_1_FLASH_LITE_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_3_1_PRO_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMINI_3_1_PRO_PREVIEW_CUSTOMTOOLS.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMMA_2_27B_IT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'stop' | 'temperature' | 'topP'>;
  [GOOGLE_GEMMA_3_12B_IT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [GOOGLE_GEMMA_3_12B_IT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'seed' | 'stop' | 'temperature' | 'topP'>;
  [GOOGLE_GEMMA_3_27B_IT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [GOOGLE_GEMMA_3_27B_IT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topP'>;
  [GOOGLE_GEMMA_3_4B_IT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [GOOGLE_GEMMA_3_4B_IT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topP'>;
  [GOOGLE_GEMMA_3N_E2B_IT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed' | 'temperature' | 'topP'>;
  [GOOGLE_GEMMA_3N_E4B_IT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [GOOGLE_GEMMA_3N_E4B_IT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed' | 'temperature' | 'topP'>;
  [GOOGLE_GEMMA_4_26B_A4B_IT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [GOOGLE_GEMMA_4_26B_A4B_IT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_GEMMA_4_31B_IT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [GOOGLE_GEMMA_4_31B_IT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [GOOGLE_LYRIA_3_CLIP_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed' | 'temperature' | 'topP'>;
  [GOOGLE_LYRIA_3_PRO_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed' | 'temperature' | 'topP'>;
  [GRYPHE_MYTHOMAX_L2_13B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topA' | 'topK' | 'topLogprobs' | 'topP'>;
  [IBM_GRANITE_GRANITE_4_0_H_MICRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'temperature' | 'topK' | 'topP'>;
  [INCEPTION_MERCURY_2.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice'>;
  [INFLECTION_INFLECTION_3_PI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature' | 'topP'>;
  [INFLECTION_INFLECTION_3_PRODUCTIVITY.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature' | 'topP'>;
  [KWAIPILOT_KAT_CODER_PRO_V2.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [LIQUID_LFM_2_24B_A2B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [LIQUID_LFM_2_5_1_2B_INSTRUCT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [LIQUID_LFM_2_5_1_2B_THINKING_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [MANCER_WEAVER.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topA' | 'topK' | 'topLogprobs' | 'topP'>;
  [META_LLAMA_LLAMA_3_70B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_3_8B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_3_1_70B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_3_1_8B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [META_LLAMA_LLAMA_3_2_11B_VISION_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_3_2_1B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'temperature' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_3_2_3B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'temperature' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_3_2_3B_INSTRUCT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_3_3_70B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [META_LLAMA_LLAMA_3_3_70B_INSTRUCT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_4_MAVERICK.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_4_SCOUT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_GUARD_3_8B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'temperature' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_GUARD_4_12B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [META_LLAMA_LLAMA_GUARD_4_12B_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'seed' | 'temperature' | 'topP'>;
  [MICROSOFT_PHI_4.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topLogprobs' | 'topP'>;
  [MICROSOFT_WIZARDLM_2_8X22B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [MINIMAX_MINIMAX_01.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'temperature' | 'topP'>;
  [MINIMAX_MINIMAX_M1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MINIMAX_MINIMAX_M2.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MINIMAX_MINIMAX_M2_HER.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'temperature' | 'topP'>;
  [MINIMAX_MINIMAX_M2_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MINIMAX_MINIMAX_M2_5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'parallelToolCalls' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [MINIMAX_MINIMAX_M2_5_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature'>;
  [MINIMAX_MINIMAX_M2_7.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [MISTRALAI_CODESTRAL_2508.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_DEVSTRAL_2512.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_DEVSTRAL_MEDIUM.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_DEVSTRAL_SMALL.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_MINISTRAL_14B_2512.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [MISTRALAI_MINISTRAL_3B_2512.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [MISTRALAI_MINISTRAL_8B_2512.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [MISTRALAI_MISTRAL_7B_INSTRUCT_V0_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'temperature' | 'topK' | 'topP'>;
  [MISTRALAI_MISTRAL_LARGE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_MISTRAL_LARGE_2407.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_MISTRAL_LARGE_2411.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_MISTRAL_LARGE_2512.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_MISTRAL_MEDIUM_3.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_MISTRAL_MEDIUM_3_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_MISTRAL_NEMO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MISTRALAI_MISTRAL_SABA.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_MISTRAL_SMALL_24B_INSTRUCT_2501.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [MISTRALAI_MISTRAL_SMALL_2603.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'temperature' | 'topK' | 'topP'>;
  [MISTRALAI_MISTRAL_SMALL_3_2_24B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MISTRALAI_MISTRAL_SMALL_CREATIVE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'toolChoice'>;
  [MISTRALAI_MIXTRAL_8X22B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_MIXTRAL_8X7B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MISTRALAI_PIXTRAL_LARGE_2411.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MISTRALAI_VOXTRAL_SMALL_24B_2507.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [MOONSHOTAI_KIMI_K2.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MOONSHOTAI_KIMI_K2_0905.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MOONSHOTAI_KIMI_K2_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [MOONSHOTAI_KIMI_K2_5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'parallelToolCalls' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [MORPH_MORPH_V3_FAST.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature'>;
  [MORPH_MORPH_V3_LARGE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature'>;
  [NEX_AGI_DEEPSEEK_V3_1_NEX_N1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'responseFormat' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [NOUSRESEARCH_HERMES_2_PRO_LLAMA_3_8B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_70B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [NOUSRESEARCH_HERMES_4_405B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'temperature' | 'topK' | 'topP'>;
  [NOUSRESEARCH_HERMES_4_70B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'temperature' | 'topK' | 'topP'>;
  [NVIDIA_LLAMA_3_1_NEMOTRON_70B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [NVIDIA_LLAMA_3_3_NEMOTRON_SUPER_49B_V1_5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [NVIDIA_NEMOTRON_3_NANO_30B_A3B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [NVIDIA_NEMOTRON_3_NANO_30B_A3B_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [NVIDIA_NEMOTRON_3_SUPER_120B_A12B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [NVIDIA_NEMOTRON_3_SUPER_120B_A12B_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [NVIDIA_NEMOTRON_NANO_12B_V2_VL.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [NVIDIA_NEMOTRON_NANO_12B_V2_VL_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [NVIDIA_NEMOTRON_NANO_9B_V2.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [NVIDIA_NEMOTRON_NANO_9B_V2_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [OPENAI_GPT_3_5_TURBO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_3_5_TURBO_0613.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_3_5_TURBO_16K.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_3_5_TURBO_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_4.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_4_0314.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_4_1106_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_4_TURBO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_4_TURBO_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_4_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'maxCompletionTokens' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [OPENAI_GPT_4_1_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'maxCompletionTokens' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [OPENAI_GPT_4_1_NANO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'maxCompletionTokens' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [OPENAI_GPT_4O.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP' | 'webSearchOptions'>;
  [OPENAI_GPT_4O_2024_05_13.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP' | 'webSearchOptions'>;
  [OPENAI_GPT_4O_2024_08_06.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP' | 'webSearchOptions'>;
  [OPENAI_GPT_4O_2024_11_20.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP' | 'webSearchOptions'>;
  [OPENAI_GPT_4O_AUDIO_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_4O_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP' | 'webSearchOptions'>;
  [OPENAI_GPT_4O_MINI_2024_07_18.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP' | 'webSearchOptions'>;
  [OPENAI_GPT_4O_MINI_SEARCH_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'webSearchOptions'>;
  [OPENAI_GPT_4O_SEARCH_PREVIEW.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'webSearchOptions'>;
  [OPENAI_GPT_4O_EXTENDED.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP' | 'webSearchOptions'>;
  [OPENAI_GPT_5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_CHAT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'seed'>;
  [OPENAI_GPT_5_CODEX.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_IMAGE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_5_IMAGE_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_5_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_NANO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_PRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_1_CHAT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'maxCompletionTokens' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_1_CODEX.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_1_CODEX_MAX.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_1_CODEX_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_2.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_2_CHAT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'maxCompletionTokens' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_2_CODEX.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_2_PRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_3_CHAT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'maxCompletionTokens' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_3_CODEX.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_4.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_4_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_4_NANO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_5_4_PRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_GPT_AUDIO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_AUDIO_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_OSS_120B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_OSS_120B_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'seed' | 'stop' | 'temperature' | 'toolChoice'>;
  [OPENAI_GPT_OSS_20B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [OPENAI_GPT_OSS_20B_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'seed' | 'stop' | 'temperature' | 'toolChoice'>;
  [OPENAI_GPT_OSS_SAFEGUARD_20B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [OPENAI_O1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_O1_PRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed'>;
  [OPENAI_O3.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_O3_DEEP_RESEARCH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_O3_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_O3_MINI_HIGH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_O3_PRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_O4_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENAI_O4_MINI_DEEP_RESEARCH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [OPENAI_O4_MINI_HIGH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'toolChoice'>;
  [OPENROUTER_AUTO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP' | 'webSearchOptions'>;
  [OPENROUTER_BODYBUILDER.id]: OpenRouterCommonOptions & OpenRouterBaseOptions;
  [OPENROUTER_ELEPHANT_ALPHA.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'responseFormat' | 'temperature' | 'toolChoice' | 'topP'>;
  [OPENROUTER_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [PERPLEXITY_SONAR.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'temperature' | 'topK' | 'topP' | 'webSearchOptions'>;
  [PERPLEXITY_SONAR_DEEP_RESEARCH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'temperature' | 'topK' | 'topP' | 'webSearchOptions'>;
  [PERPLEXITY_SONAR_PRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'temperature' | 'topK' | 'topP' | 'webSearchOptions'>;
  [PERPLEXITY_SONAR_PRO_SEARCH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'temperature' | 'topK' | 'topP' | 'webSearchOptions'>;
  [PERPLEXITY_SONAR_REASONING_PRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'temperature' | 'topK' | 'topP' | 'webSearchOptions'>;
  [PRIME_INTELLECT_INTELLECT_3.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN_2_5_72B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN_2_5_7B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN_2_5_CODER_32B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'temperature' | 'topK' | 'topP'>;
  [QWEN_QWEN_MAX.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN_PLUS.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN_PLUS_2025_07_28.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN_PLUS_2025_07_28_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN_TURBO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN_VL_MAX.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN_VL_PLUS.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'topP'>;
  [QWEN_QWEN2_5_VL_32B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [QWEN_QWEN2_5_VL_72B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [QWEN_QWEN3_14B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [QWEN_QWEN3_235B_A22B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN3_235B_A22B_2507.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [QWEN_QWEN3_235B_A22B_THINKING_2507.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_30B_A3B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [QWEN_QWEN3_30B_A3B_INSTRUCT_2507.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_30B_A3B_THINKING_2507.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_32B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_8B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_CODER.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_CODER_30B_A3B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_CODER_FLASH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN3_CODER_NEXT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_CODER_PLUS.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN3_CODER_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_MAX.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN3_MAX_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_NEXT_80B_A3B_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_VL_235B_A22B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_VL_235B_A22B_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_VL_30B_A3B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_VL_30B_A3B_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_VL_32B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN3_VL_8B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_VL_8B_THINKING.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN3_5_122B_A10B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [QWEN_QWEN3_5_27B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [QWEN_QWEN3_5_35B_A3B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [QWEN_QWEN3_5_397B_A17B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [QWEN_QWEN3_5_9B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [QWEN_QWEN3_5_FLASH_02_23.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN3_5_PLUS_02_15.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWEN3_6_PLUS.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topP'>;
  [QWEN_QWQ_32B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'reasoning' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [REKAAI_REKA_EDGE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [REKAAI_REKA_FLASH_3.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [RELACE_RELACE_APPLY_3.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'seed' | 'stop'>;
  [RELACE_RELACE_SEARCH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [SAO10K_L3_EURYALE_70B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [SAO10K_L3_LUNARIS_8B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [SAO10K_L3_1_70B_HANAMI_X1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [SAO10K_L3_1_EURYALE_70B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [SAO10K_L3_3_EURYALE_70B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topLogprobs' | 'topP'>;
  [STEPFUN_STEP_3_5_FLASH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [SWITCHPOINT_ROUTER.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [TENCENT_HUNYUAN_A13B_INSTRUCT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'reasoning' | 'responseFormat' | 'temperature' | 'topK' | 'topP'>;
  [THEDRUMMER_CYDONIA_24B_V4_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [THEDRUMMER_ROCINANTE_12B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [THEDRUMMER_SKYFALL_36B_V2.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [THEDRUMMER_UNSLOPNEMO_12B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [TNGTECH_DEEPSEEK_R1T2_CHIMERA.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [UNDI95_REMM_SLERP_L2_13B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'topA' | 'topK' | 'topLogprobs' | 'topP'>;
  [UPSTAGE_SOLAR_PRO_3.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'temperature' | 'toolChoice'>;
  [WRITER_PALMYRA_X5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'stop' | 'temperature' | 'topK' | 'topP'>;
  [X_AI_GROK_3.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [X_AI_GROK_3_BETA.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'logprobs' | 'maxCompletionTokens' | 'presencePenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [X_AI_GROK_3_MINI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [X_AI_GROK_3_MINI_BETA.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [X_AI_GROK_4.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [X_AI_GROK_4_FAST.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [X_AI_GROK_4_1_FAST.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [X_AI_GROK_4_20.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [X_AI_GROK_4_20_MULTI_AGENT.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'temperature' | 'topLogprobs' | 'topP'>;
  [X_AI_GROK_CODE_FAST_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'logprobs' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topLogprobs' | 'topP'>;
  [XIAOMI_MIMO_V2_FLASH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [XIAOMI_MIMO_V2_OMNI.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [XIAOMI_MIMO_V2_PRO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'responseFormat' | 'stop' | 'temperature' | 'toolChoice' | 'topP'>;
  [Z_AI_GLM_4_32B.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'maxCompletionTokens' | 'temperature' | 'toolChoice' | 'topP'>;
  [Z_AI_GLM_4_5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [Z_AI_GLM_4_5_AIR.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [Z_AI_GLM_4_5_AIR_FREE.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'temperature' | 'toolChoice' | 'topP'>;
  [Z_AI_GLM_4_5V.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [Z_AI_GLM_4_6.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [Z_AI_GLM_4_6V.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [Z_AI_GLM_4_7.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [Z_AI_GLM_4_7_FLASH.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [Z_AI_GLM_5.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [Z_AI_GLM_5_TURBO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'maxCompletionTokens' | 'minP' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topP'>;
  [Z_AI_GLM_5_1.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'frequencyPenalty' | 'includeReasoning' | 'logitBias' | 'logprobs' | 'maxCompletionTokens' | 'minP' | 'parallelToolCalls' | 'presencePenalty' | 'reasoning' | 'repetitionPenalty' | 'responseFormat' | 'seed' | 'stop' | 'temperature' | 'toolChoice' | 'topK' | 'topLogprobs' | 'topP'>;
  [Z_AI_GLM_5V_TURBO.id]: OpenRouterCommonOptions & Pick<OpenRouterBaseOptions,'includeReasoning' | 'maxCompletionTokens' | 'reasoning' | 'responseFormat' | 'temperature' | 'toolChoice' | 'topP'>;
}


export type OpenRouterModelInputModalitiesByName  = {
  [AI21_JAMBA_LARGE_1_7.id]: ReadonlyArray<'text'>;
  [AION_LABS_AION_1_0.id]: ReadonlyArray<'text'>;
  [AION_LABS_AION_1_0_MINI.id]: ReadonlyArray<'text'>;
  [AION_LABS_AION_2_0.id]: ReadonlyArray<'text'>;
  [AION_LABS_AION_RP_LLAMA_3_1_8B.id]: ReadonlyArray<'text'>;
  [ALFREDPROS_CODELLAMA_7B_INSTRUCT_SOLIDITY.id]: ReadonlyArray<'text'>;
  [ALIBABA_TONGYI_DEEPRESEARCH_30B_A3B.id]: ReadonlyArray<'text'>;
  [ALLENAI_OLMO_2_0325_32B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [ALLENAI_OLMO_3_32B_THINK.id]: ReadonlyArray<'text'>;
  [ALLENAI_OLMO_3_1_32B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [ALPINDALE_GOLIATH_120B.id]: ReadonlyArray<'text'>;
  [AMAZON_NOVA_2_LITE_V1.id]: ReadonlyArray<'text' | 'image' | 'video' | 'document'>;
  [AMAZON_NOVA_LITE_V1.id]: ReadonlyArray<'text' | 'image'>;
  [AMAZON_NOVA_MICRO_V1.id]: ReadonlyArray<'text'>;
  [AMAZON_NOVA_PREMIER_V1.id]: ReadonlyArray<'text' | 'image'>;
  [AMAZON_NOVA_PRO_V1.id]: ReadonlyArray<'text' | 'image'>;
  [ANTHRACITE_ORG_MAGNUM_V4_72B.id]: ReadonlyArray<'text'>;
  [ANTHROPIC_CLAUDE_3_HAIKU.id]: ReadonlyArray<'text' | 'image'>;
  [ANTHROPIC_CLAUDE_3_5_HAIKU.id]: ReadonlyArray<'text' | 'image'>;
  [ANTHROPIC_CLAUDE_3_7_SONNET.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [ANTHROPIC_CLAUDE_3_7_SONNET_THINKING.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [ANTHROPIC_CLAUDE_HAIKU_4_5.id]: ReadonlyArray<'image' | 'text'>;
  [ANTHROPIC_CLAUDE_OPUS_4.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [ANTHROPIC_CLAUDE_OPUS_4_1.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [ANTHROPIC_CLAUDE_OPUS_4_5.id]: ReadonlyArray<'document' | 'image' | 'text'>;
  [ANTHROPIC_CLAUDE_OPUS_4_6.id]: ReadonlyArray<'text' | 'image'>;
  [ANTHROPIC_CLAUDE_OPUS_4_6_FAST.id]: ReadonlyArray<'text' | 'image'>;
  [ANTHROPIC_CLAUDE_SONNET_4.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [ANTHROPIC_CLAUDE_SONNET_4_5.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [ANTHROPIC_CLAUDE_SONNET_4_6.id]: ReadonlyArray<'text' | 'image'>;
  [ARCEE_AI_CODER_LARGE.id]: ReadonlyArray<'text'>;
  [ARCEE_AI_MAESTRO_REASONING.id]: ReadonlyArray<'text'>;
  [ARCEE_AI_SPOTLIGHT.id]: ReadonlyArray<'image' | 'text'>;
  [ARCEE_AI_TRINITY_LARGE_PREVIEW_FREE.id]: ReadonlyArray<'text'>;
  [ARCEE_AI_TRINITY_LARGE_THINKING.id]: ReadonlyArray<'text'>;
  [ARCEE_AI_TRINITY_MINI.id]: ReadonlyArray<'text'>;
  [ARCEE_AI_VIRTUOSO_LARGE.id]: ReadonlyArray<'text'>;
  [BAIDU_ERNIE_4_5_21B_A3B.id]: ReadonlyArray<'text'>;
  [BAIDU_ERNIE_4_5_21B_A3B_THINKING.id]: ReadonlyArray<'text'>;
  [BAIDU_ERNIE_4_5_300B_A47B.id]: ReadonlyArray<'text'>;
  [BAIDU_ERNIE_4_5_VL_28B_A3B.id]: ReadonlyArray<'text' | 'image'>;
  [BAIDU_ERNIE_4_5_VL_424B_A47B.id]: ReadonlyArray<'image' | 'text'>;
  [BYTEDANCE_SEED_SEED_1_6.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [BYTEDANCE_SEED_SEED_1_6_FLASH.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [BYTEDANCE_SEED_SEED_2_0_LITE.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [BYTEDANCE_SEED_SEED_2_0_MINI.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [BYTEDANCE_UI_TARS_1_5_7B.id]: ReadonlyArray<'image' | 'text'>;
  [COGNITIVECOMPUTATIONS_DOLPHIN_MISTRAL_24B_VENICE_EDITION_FREE.id]: ReadonlyArray<'text'>;
  [COHERE_COMMAND_A.id]: ReadonlyArray<'text'>;
  [COHERE_COMMAND_R_08_2024.id]: ReadonlyArray<'text'>;
  [COHERE_COMMAND_R_PLUS_08_2024.id]: ReadonlyArray<'text'>;
  [COHERE_COMMAND_R7B_12_2024.id]: ReadonlyArray<'text'>;
  [DEEPCOGITO_COGITO_V2_1_671B.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_CHAT.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_CHAT_V3_0324.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_CHAT_V3_1.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_R1.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_R1_0528.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_LLAMA_70B.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_32B.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_V3_1_TERMINUS.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_V3_2.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_V3_2_EXP.id]: ReadonlyArray<'text'>;
  [DEEPSEEK_DEEPSEEK_V3_2_SPECIALE.id]: ReadonlyArray<'text'>;
  [ESSENTIALAI_RNJ_1_INSTRUCT.id]: ReadonlyArray<'text'>;
  [GOOGLE_GEMINI_2_0_FLASH_001.id]: ReadonlyArray<'text' | 'image' | 'document' | 'audio' | 'video'>;
  [GOOGLE_GEMINI_2_0_FLASH_LITE_001.id]: ReadonlyArray<'text' | 'image' | 'document' | 'audio' | 'video'>;
  [GOOGLE_GEMINI_2_5_FLASH.id]: ReadonlyArray<'document' | 'image' | 'text' | 'audio' | 'video'>;
  [GOOGLE_GEMINI_2_5_FLASH_IMAGE.id]: ReadonlyArray<'image' | 'text'>;
  [GOOGLE_GEMINI_2_5_FLASH_LITE.id]: ReadonlyArray<'text' | 'image' | 'document' | 'audio' | 'video'>;
  [GOOGLE_GEMINI_2_5_FLASH_LITE_PREVIEW_09_2025.id]: ReadonlyArray<'text' | 'image' | 'document' | 'audio' | 'video'>;
  [GOOGLE_GEMINI_2_5_PRO.id]: ReadonlyArray<'text' | 'image' | 'document' | 'audio' | 'video'>;
  [GOOGLE_GEMINI_2_5_PRO_PREVIEW.id]: ReadonlyArray<'document' | 'image' | 'text' | 'audio'>;
  [GOOGLE_GEMINI_2_5_PRO_PREVIEW_05_06.id]: ReadonlyArray<'text' | 'image' | 'document' | 'audio' | 'video'>;
  [GOOGLE_GEMINI_3_FLASH_PREVIEW.id]: ReadonlyArray<'text' | 'image' | 'document' | 'audio' | 'video'>;
  [GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW.id]: ReadonlyArray<'image' | 'text'>;
  [GOOGLE_GEMINI_3_1_FLASH_IMAGE_PREVIEW.id]: ReadonlyArray<'image' | 'text'>;
  [GOOGLE_GEMINI_3_1_FLASH_LITE_PREVIEW.id]: ReadonlyArray<'text' | 'image' | 'video' | 'document' | 'audio'>;
  [GOOGLE_GEMINI_3_1_PRO_PREVIEW.id]: ReadonlyArray<'audio' | 'document' | 'image' | 'text' | 'video'>;
  [GOOGLE_GEMINI_3_1_PRO_PREVIEW_CUSTOMTOOLS.id]: ReadonlyArray<'text' | 'audio' | 'image' | 'video' | 'document'>;
  [GOOGLE_GEMMA_2_27B_IT.id]: ReadonlyArray<'text'>;
  [GOOGLE_GEMMA_3_12B_IT.id]: ReadonlyArray<'text' | 'image'>;
  [GOOGLE_GEMMA_3_12B_IT_FREE.id]: ReadonlyArray<'text' | 'image'>;
  [GOOGLE_GEMMA_3_27B_IT.id]: ReadonlyArray<'text' | 'image'>;
  [GOOGLE_GEMMA_3_27B_IT_FREE.id]: ReadonlyArray<'text' | 'image'>;
  [GOOGLE_GEMMA_3_4B_IT.id]: ReadonlyArray<'text' | 'image'>;
  [GOOGLE_GEMMA_3_4B_IT_FREE.id]: ReadonlyArray<'text' | 'image'>;
  [GOOGLE_GEMMA_3N_E2B_IT_FREE.id]: ReadonlyArray<'text'>;
  [GOOGLE_GEMMA_3N_E4B_IT.id]: ReadonlyArray<'text'>;
  [GOOGLE_GEMMA_3N_E4B_IT_FREE.id]: ReadonlyArray<'text'>;
  [GOOGLE_GEMMA_4_26B_A4B_IT.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [GOOGLE_GEMMA_4_26B_A4B_IT_FREE.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [GOOGLE_GEMMA_4_31B_IT.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [GOOGLE_GEMMA_4_31B_IT_FREE.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [GOOGLE_LYRIA_3_CLIP_PREVIEW.id]: ReadonlyArray<'text' | 'image'>;
  [GOOGLE_LYRIA_3_PRO_PREVIEW.id]: ReadonlyArray<'text' | 'image'>;
  [GRYPHE_MYTHOMAX_L2_13B.id]: ReadonlyArray<'text'>;
  [IBM_GRANITE_GRANITE_4_0_H_MICRO.id]: ReadonlyArray<'text'>;
  [INCEPTION_MERCURY_2.id]: ReadonlyArray<'text'>;
  [INFLECTION_INFLECTION_3_PI.id]: ReadonlyArray<'text'>;
  [INFLECTION_INFLECTION_3_PRODUCTIVITY.id]: ReadonlyArray<'text'>;
  [KWAIPILOT_KAT_CODER_PRO_V2.id]: ReadonlyArray<'text'>;
  [LIQUID_LFM_2_24B_A2B.id]: ReadonlyArray<'text'>;
  [LIQUID_LFM_2_5_1_2B_INSTRUCT_FREE.id]: ReadonlyArray<'text'>;
  [LIQUID_LFM_2_5_1_2B_THINKING_FREE.id]: ReadonlyArray<'text'>;
  [MANCER_WEAVER.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_3_70B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_3_8B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_3_1_70B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_3_1_8B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_3_2_11B_VISION_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>;
  [META_LLAMA_LLAMA_3_2_1B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_3_2_3B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_3_2_3B_INSTRUCT_FREE.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_3_3_70B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_3_3_70B_INSTRUCT_FREE.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_4_MAVERICK.id]: ReadonlyArray<'text' | 'image'>;
  [META_LLAMA_LLAMA_4_SCOUT.id]: ReadonlyArray<'text' | 'image'>;
  [META_LLAMA_LLAMA_GUARD_3_8B.id]: ReadonlyArray<'text'>;
  [META_LLAMA_LLAMA_GUARD_4_12B.id]: ReadonlyArray<'image' | 'text'>;
  [META_LLAMA_LLAMA_GUARD_4_12B_FREE.id]: ReadonlyArray<'image' | 'text'>;
  [MICROSOFT_PHI_4.id]: ReadonlyArray<'text'>;
  [MICROSOFT_WIZARDLM_2_8X22B.id]: ReadonlyArray<'text'>;
  [MINIMAX_MINIMAX_01.id]: ReadonlyArray<'text' | 'image'>;
  [MINIMAX_MINIMAX_M1.id]: ReadonlyArray<'text'>;
  [MINIMAX_MINIMAX_M2.id]: ReadonlyArray<'text'>;
  [MINIMAX_MINIMAX_M2_HER.id]: ReadonlyArray<'text'>;
  [MINIMAX_MINIMAX_M2_1.id]: ReadonlyArray<'text'>;
  [MINIMAX_MINIMAX_M2_5.id]: ReadonlyArray<'text'>;
  [MINIMAX_MINIMAX_M2_5_FREE.id]: ReadonlyArray<'text'>;
  [MINIMAX_MINIMAX_M2_7.id]: ReadonlyArray<'text'>;
  [MISTRALAI_CODESTRAL_2508.id]: ReadonlyArray<'text'>;
  [MISTRALAI_DEVSTRAL_2512.id]: ReadonlyArray<'text'>;
  [MISTRALAI_DEVSTRAL_MEDIUM.id]: ReadonlyArray<'text'>;
  [MISTRALAI_DEVSTRAL_SMALL.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MINISTRAL_14B_2512.id]: ReadonlyArray<'text' | 'image'>;
  [MISTRALAI_MINISTRAL_3B_2512.id]: ReadonlyArray<'text' | 'image'>;
  [MISTRALAI_MINISTRAL_8B_2512.id]: ReadonlyArray<'text' | 'image'>;
  [MISTRALAI_MISTRAL_7B_INSTRUCT_V0_1.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MISTRAL_LARGE.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MISTRAL_LARGE_2407.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MISTRAL_LARGE_2411.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MISTRAL_LARGE_2512.id]: ReadonlyArray<'text' | 'image'>;
  [MISTRALAI_MISTRAL_MEDIUM_3.id]: ReadonlyArray<'text' | 'image'>;
  [MISTRALAI_MISTRAL_MEDIUM_3_1.id]: ReadonlyArray<'text' | 'image'>;
  [MISTRALAI_MISTRAL_NEMO.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MISTRAL_SABA.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MISTRAL_SMALL_24B_INSTRUCT_2501.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MISTRAL_SMALL_2603.id]: ReadonlyArray<'text' | 'image'>;
  [MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>;
  [MISTRALAI_MISTRAL_SMALL_3_2_24B_INSTRUCT.id]: ReadonlyArray<'image' | 'text'>;
  [MISTRALAI_MISTRAL_SMALL_CREATIVE.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MIXTRAL_8X22B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [MISTRALAI_MIXTRAL_8X7B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [MISTRALAI_PIXTRAL_LARGE_2411.id]: ReadonlyArray<'text' | 'image'>;
  [MISTRALAI_VOXTRAL_SMALL_24B_2507.id]: ReadonlyArray<'text' | 'audio'>;
  [MOONSHOTAI_KIMI_K2.id]: ReadonlyArray<'text'>;
  [MOONSHOTAI_KIMI_K2_0905.id]: ReadonlyArray<'text'>;
  [MOONSHOTAI_KIMI_K2_THINKING.id]: ReadonlyArray<'text'>;
  [MOONSHOTAI_KIMI_K2_5.id]: ReadonlyArray<'text' | 'image'>;
  [MORPH_MORPH_V3_FAST.id]: ReadonlyArray<'text'>;
  [MORPH_MORPH_V3_LARGE.id]: ReadonlyArray<'text'>;
  [NEX_AGI_DEEPSEEK_V3_1_NEX_N1.id]: ReadonlyArray<'text'>;
  [NOUSRESEARCH_HERMES_2_PRO_LLAMA_3_8B.id]: ReadonlyArray<'text'>;
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B.id]: ReadonlyArray<'text'>;
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B_FREE.id]: ReadonlyArray<'text'>;
  [NOUSRESEARCH_HERMES_3_LLAMA_3_1_70B.id]: ReadonlyArray<'text'>;
  [NOUSRESEARCH_HERMES_4_405B.id]: ReadonlyArray<'text'>;
  [NOUSRESEARCH_HERMES_4_70B.id]: ReadonlyArray<'text'>;
  [NVIDIA_LLAMA_3_1_NEMOTRON_70B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [NVIDIA_LLAMA_3_3_NEMOTRON_SUPER_49B_V1_5.id]: ReadonlyArray<'text'>;
  [NVIDIA_NEMOTRON_3_NANO_30B_A3B.id]: ReadonlyArray<'text'>;
  [NVIDIA_NEMOTRON_3_NANO_30B_A3B_FREE.id]: ReadonlyArray<'text'>;
  [NVIDIA_NEMOTRON_3_SUPER_120B_A12B.id]: ReadonlyArray<'text'>;
  [NVIDIA_NEMOTRON_3_SUPER_120B_A12B_FREE.id]: ReadonlyArray<'text'>;
  [NVIDIA_NEMOTRON_NANO_12B_V2_VL.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [NVIDIA_NEMOTRON_NANO_12B_V2_VL_FREE.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [NVIDIA_NEMOTRON_NANO_9B_V2.id]: ReadonlyArray<'text'>;
  [NVIDIA_NEMOTRON_NANO_9B_V2_FREE.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_3_5_TURBO.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_3_5_TURBO_0613.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_3_5_TURBO_16K.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_3_5_TURBO_INSTRUCT.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_4.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_4_0314.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_4_1106_PREVIEW.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_4_TURBO.id]: ReadonlyArray<'text' | 'image'>;
  [OPENAI_GPT_4_TURBO_PREVIEW.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_4_1.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_GPT_4_1_MINI.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_GPT_4_1_NANO.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_GPT_4O.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_4O_2024_05_13.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_4O_2024_08_06.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_4O_2024_11_20.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_4O_AUDIO_PREVIEW.id]: ReadonlyArray<'audio' | 'text'>;
  [OPENAI_GPT_4O_MINI.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_4O_MINI_2024_07_18.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_4O_MINI_SEARCH_PREVIEW.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_4O_SEARCH_PREVIEW.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_4O_EXTENDED.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_5.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_5_CHAT.id]: ReadonlyArray<'document' | 'image' | 'text'>;
  [OPENAI_GPT_5_CODEX.id]: ReadonlyArray<'text' | 'image'>;
  [OPENAI_GPT_5_IMAGE.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_GPT_5_IMAGE_MINI.id]: ReadonlyArray<'document' | 'image' | 'text'>;
  [OPENAI_GPT_5_MINI.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_5_NANO.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_5_PRO.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_GPT_5_1.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_GPT_5_1_CHAT.id]: ReadonlyArray<'document' | 'image' | 'text'>;
  [OPENAI_GPT_5_1_CODEX.id]: ReadonlyArray<'text' | 'image'>;
  [OPENAI_GPT_5_1_CODEX_MAX.id]: ReadonlyArray<'text' | 'image'>;
  [OPENAI_GPT_5_1_CODEX_MINI.id]: ReadonlyArray<'image' | 'text'>;
  [OPENAI_GPT_5_2.id]: ReadonlyArray<'document' | 'image' | 'text'>;
  [OPENAI_GPT_5_2_CHAT.id]: ReadonlyArray<'document' | 'image' | 'text'>;
  [OPENAI_GPT_5_2_CODEX.id]: ReadonlyArray<'text' | 'image'>;
  [OPENAI_GPT_5_2_PRO.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_GPT_5_3_CHAT.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_5_3_CODEX.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_5_4.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_5_4_MINI.id]: ReadonlyArray<'document' | 'image' | 'text'>;
  [OPENAI_GPT_5_4_NANO.id]: ReadonlyArray<'document' | 'image' | 'text'>;
  [OPENAI_GPT_5_4_PRO.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_GPT_AUDIO.id]: ReadonlyArray<'text' | 'audio'>;
  [OPENAI_GPT_AUDIO_MINI.id]: ReadonlyArray<'text' | 'audio'>;
  [OPENAI_GPT_OSS_120B.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_OSS_120B_FREE.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_OSS_20B.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_OSS_20B_FREE.id]: ReadonlyArray<'text'>;
  [OPENAI_GPT_OSS_SAFEGUARD_20B.id]: ReadonlyArray<'text'>;
  [OPENAI_O1.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_O1_PRO.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [OPENAI_O3.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_O3_DEEP_RESEARCH.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_O3_MINI.id]: ReadonlyArray<'text' | 'document'>;
  [OPENAI_O3_MINI_HIGH.id]: ReadonlyArray<'text' | 'document'>;
  [OPENAI_O3_PRO.id]: ReadonlyArray<'text' | 'document' | 'image'>;
  [OPENAI_O4_MINI.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENAI_O4_MINI_DEEP_RESEARCH.id]: ReadonlyArray<'document' | 'image' | 'text'>;
  [OPENAI_O4_MINI_HIGH.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [OPENROUTER_AUTO.id]: ReadonlyArray<'text' | 'image' | 'audio' | 'document' | 'video'>;
  [OPENROUTER_BODYBUILDER.id]: ReadonlyArray<'text'>;
  [OPENROUTER_ELEPHANT_ALPHA.id]: ReadonlyArray<'text'>;
  [OPENROUTER_FREE.id]: ReadonlyArray<'text' | 'image'>;
  [PERPLEXITY_SONAR.id]: ReadonlyArray<'text' | 'image'>;
  [PERPLEXITY_SONAR_DEEP_RESEARCH.id]: ReadonlyArray<'text'>;
  [PERPLEXITY_SONAR_PRO.id]: ReadonlyArray<'text' | 'image'>;
  [PERPLEXITY_SONAR_PRO_SEARCH.id]: ReadonlyArray<'text' | 'image'>;
  [PERPLEXITY_SONAR_REASONING_PRO.id]: ReadonlyArray<'text' | 'image'>;
  [PRIME_INTELLECT_INTELLECT_3.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN_2_5_72B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN_2_5_7B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN_2_5_CODER_32B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN_MAX.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN_PLUS.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN_PLUS_2025_07_28.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN_PLUS_2025_07_28_THINKING.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN_TURBO.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN_VL_MAX.id]: ReadonlyArray<'text' | 'image'>;
  [QWEN_QWEN_VL_PLUS.id]: ReadonlyArray<'text' | 'image'>;
  [QWEN_QWEN2_5_VL_32B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>;
  [QWEN_QWEN2_5_VL_72B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>;
  [QWEN_QWEN3_14B.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_235B_A22B.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_235B_A22B_2507.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_235B_A22B_THINKING_2507.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_30B_A3B.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_30B_A3B_INSTRUCT_2507.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_30B_A3B_THINKING_2507.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_32B.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_8B.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_CODER.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_CODER_30B_A3B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_CODER_FLASH.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_CODER_NEXT.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_CODER_PLUS.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_CODER_FREE.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_MAX.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_MAX_THINKING.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT_FREE.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_NEXT_80B_A3B_THINKING.id]: ReadonlyArray<'text'>;
  [QWEN_QWEN3_VL_235B_A22B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>;
  [QWEN_QWEN3_VL_235B_A22B_THINKING.id]: ReadonlyArray<'text' | 'image'>;
  [QWEN_QWEN3_VL_30B_A3B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>;
  [QWEN_QWEN3_VL_30B_A3B_THINKING.id]: ReadonlyArray<'text' | 'image'>;
  [QWEN_QWEN3_VL_32B_INSTRUCT.id]: ReadonlyArray<'text' | 'image'>;
  [QWEN_QWEN3_VL_8B_INSTRUCT.id]: ReadonlyArray<'image' | 'text'>;
  [QWEN_QWEN3_VL_8B_THINKING.id]: ReadonlyArray<'image' | 'text'>;
  [QWEN_QWEN3_5_122B_A10B.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [QWEN_QWEN3_5_27B.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [QWEN_QWEN3_5_35B_A3B.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [QWEN_QWEN3_5_397B_A17B.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [QWEN_QWEN3_5_9B.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [QWEN_QWEN3_5_FLASH_02_23.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [QWEN_QWEN3_5_PLUS_02_15.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [QWEN_QWEN3_6_PLUS.id]: ReadonlyArray<'text' | 'image' | 'video'>;
  [QWEN_QWQ_32B.id]: ReadonlyArray<'text'>;
  [REKAAI_REKA_EDGE.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [REKAAI_REKA_FLASH_3.id]: ReadonlyArray<'text'>;
  [RELACE_RELACE_APPLY_3.id]: ReadonlyArray<'text'>;
  [RELACE_RELACE_SEARCH.id]: ReadonlyArray<'text'>;
  [SAO10K_L3_EURYALE_70B.id]: ReadonlyArray<'text'>;
  [SAO10K_L3_LUNARIS_8B.id]: ReadonlyArray<'text'>;
  [SAO10K_L3_1_70B_HANAMI_X1.id]: ReadonlyArray<'text'>;
  [SAO10K_L3_1_EURYALE_70B.id]: ReadonlyArray<'text'>;
  [SAO10K_L3_3_EURYALE_70B.id]: ReadonlyArray<'text'>;
  [STEPFUN_STEP_3_5_FLASH.id]: ReadonlyArray<'text'>;
  [SWITCHPOINT_ROUTER.id]: ReadonlyArray<'text'>;
  [TENCENT_HUNYUAN_A13B_INSTRUCT.id]: ReadonlyArray<'text'>;
  [THEDRUMMER_CYDONIA_24B_V4_1.id]: ReadonlyArray<'text'>;
  [THEDRUMMER_ROCINANTE_12B.id]: ReadonlyArray<'text'>;
  [THEDRUMMER_SKYFALL_36B_V2.id]: ReadonlyArray<'text'>;
  [THEDRUMMER_UNSLOPNEMO_12B.id]: ReadonlyArray<'text'>;
  [TNGTECH_DEEPSEEK_R1T2_CHIMERA.id]: ReadonlyArray<'text'>;
  [UNDI95_REMM_SLERP_L2_13B.id]: ReadonlyArray<'text'>;
  [UPSTAGE_SOLAR_PRO_3.id]: ReadonlyArray<'text'>;
  [WRITER_PALMYRA_X5.id]: ReadonlyArray<'text'>;
  [X_AI_GROK_3.id]: ReadonlyArray<'text'>;
  [X_AI_GROK_3_BETA.id]: ReadonlyArray<'text'>;
  [X_AI_GROK_3_MINI.id]: ReadonlyArray<'text'>;
  [X_AI_GROK_3_MINI_BETA.id]: ReadonlyArray<'text'>;
  [X_AI_GROK_4.id]: ReadonlyArray<'image' | 'text' | 'document'>;
  [X_AI_GROK_4_FAST.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [X_AI_GROK_4_1_FAST.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [X_AI_GROK_4_20.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [X_AI_GROK_4_20_MULTI_AGENT.id]: ReadonlyArray<'text' | 'image' | 'document'>;
  [X_AI_GROK_CODE_FAST_1.id]: ReadonlyArray<'text'>;
  [XIAOMI_MIMO_V2_FLASH.id]: ReadonlyArray<'text'>;
  [XIAOMI_MIMO_V2_OMNI.id]: ReadonlyArray<'text' | 'audio' | 'image' | 'video'>;
  [XIAOMI_MIMO_V2_PRO.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_4_32B.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_4_5.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_4_5_AIR.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_4_5_AIR_FREE.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_4_5V.id]: ReadonlyArray<'text' | 'image'>;
  [Z_AI_GLM_4_6.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_4_6V.id]: ReadonlyArray<'image' | 'text' | 'video'>;
  [Z_AI_GLM_4_7.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_4_7_FLASH.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_5.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_5_TURBO.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_5_1.id]: ReadonlyArray<'text'>;
  [Z_AI_GLM_5V_TURBO.id]: ReadonlyArray<'image' | 'text' | 'video'>;
}

export const OPENROUTER_CHAT_MODELS = [
  AI21_JAMBA_LARGE_1_7.id,
  AION_LABS_AION_1_0.id,
  AION_LABS_AION_1_0_MINI.id,
  AION_LABS_AION_2_0.id,
  AION_LABS_AION_RP_LLAMA_3_1_8B.id,
  ALFREDPROS_CODELLAMA_7B_INSTRUCT_SOLIDITY.id,
  ALIBABA_TONGYI_DEEPRESEARCH_30B_A3B.id,
  ALLENAI_OLMO_2_0325_32B_INSTRUCT.id,
  ALLENAI_OLMO_3_32B_THINK.id,
  ALLENAI_OLMO_3_1_32B_INSTRUCT.id,
  ALPINDALE_GOLIATH_120B.id,
  AMAZON_NOVA_2_LITE_V1.id,
  AMAZON_NOVA_LITE_V1.id,
  AMAZON_NOVA_MICRO_V1.id,
  AMAZON_NOVA_PREMIER_V1.id,
  AMAZON_NOVA_PRO_V1.id,
  ANTHRACITE_ORG_MAGNUM_V4_72B.id,
  ANTHROPIC_CLAUDE_3_HAIKU.id,
  ANTHROPIC_CLAUDE_3_5_HAIKU.id,
  ANTHROPIC_CLAUDE_3_7_SONNET.id,
  ANTHROPIC_CLAUDE_3_7_SONNET_THINKING.id,
  ANTHROPIC_CLAUDE_HAIKU_4_5.id,
  ANTHROPIC_CLAUDE_OPUS_4.id,
  ANTHROPIC_CLAUDE_OPUS_4_1.id,
  ANTHROPIC_CLAUDE_OPUS_4_5.id,
  ANTHROPIC_CLAUDE_OPUS_4_6.id,
  ANTHROPIC_CLAUDE_OPUS_4_6_FAST.id,
  ANTHROPIC_CLAUDE_SONNET_4.id,
  ANTHROPIC_CLAUDE_SONNET_4_5.id,
  ANTHROPIC_CLAUDE_SONNET_4_6.id,
  ARCEE_AI_CODER_LARGE.id,
  ARCEE_AI_MAESTRO_REASONING.id,
  ARCEE_AI_SPOTLIGHT.id,
  ARCEE_AI_TRINITY_LARGE_PREVIEW_FREE.id,
  ARCEE_AI_TRINITY_LARGE_THINKING.id,
  ARCEE_AI_TRINITY_MINI.id,
  ARCEE_AI_VIRTUOSO_LARGE.id,
  BAIDU_ERNIE_4_5_21B_A3B.id,
  BAIDU_ERNIE_4_5_21B_A3B_THINKING.id,
  BAIDU_ERNIE_4_5_300B_A47B.id,
  BAIDU_ERNIE_4_5_VL_28B_A3B.id,
  BAIDU_ERNIE_4_5_VL_424B_A47B.id,
  BYTEDANCE_SEED_SEED_1_6.id,
  BYTEDANCE_SEED_SEED_1_6_FLASH.id,
  BYTEDANCE_SEED_SEED_2_0_LITE.id,
  BYTEDANCE_SEED_SEED_2_0_MINI.id,
  BYTEDANCE_UI_TARS_1_5_7B.id,
  COGNITIVECOMPUTATIONS_DOLPHIN_MISTRAL_24B_VENICE_EDITION_FREE.id,
  COHERE_COMMAND_A.id,
  COHERE_COMMAND_R_08_2024.id,
  COHERE_COMMAND_R_PLUS_08_2024.id,
  COHERE_COMMAND_R7B_12_2024.id,
  DEEPCOGITO_COGITO_V2_1_671B.id,
  DEEPSEEK_DEEPSEEK_CHAT.id,
  DEEPSEEK_DEEPSEEK_CHAT_V3_0324.id,
  DEEPSEEK_DEEPSEEK_CHAT_V3_1.id,
  DEEPSEEK_DEEPSEEK_R1.id,
  DEEPSEEK_DEEPSEEK_R1_0528.id,
  DEEPSEEK_DEEPSEEK_R1_DISTILL_LLAMA_70B.id,
  DEEPSEEK_DEEPSEEK_R1_DISTILL_QWEN_32B.id,
  DEEPSEEK_DEEPSEEK_V3_1_TERMINUS.id,
  DEEPSEEK_DEEPSEEK_V3_2.id,
  DEEPSEEK_DEEPSEEK_V3_2_EXP.id,
  DEEPSEEK_DEEPSEEK_V3_2_SPECIALE.id,
  ESSENTIALAI_RNJ_1_INSTRUCT.id,
  GOOGLE_GEMINI_2_0_FLASH_001.id,
  GOOGLE_GEMINI_2_0_FLASH_LITE_001.id,
  GOOGLE_GEMINI_2_5_FLASH.id,
  GOOGLE_GEMINI_2_5_FLASH_IMAGE.id,
  GOOGLE_GEMINI_2_5_FLASH_LITE.id,
  GOOGLE_GEMINI_2_5_FLASH_LITE_PREVIEW_09_2025.id,
  GOOGLE_GEMINI_2_5_PRO.id,
  GOOGLE_GEMINI_2_5_PRO_PREVIEW.id,
  GOOGLE_GEMINI_2_5_PRO_PREVIEW_05_06.id,
  GOOGLE_GEMINI_3_FLASH_PREVIEW.id,
  GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW.id,
  GOOGLE_GEMINI_3_1_FLASH_IMAGE_PREVIEW.id,
  GOOGLE_GEMINI_3_1_FLASH_LITE_PREVIEW.id,
  GOOGLE_GEMINI_3_1_PRO_PREVIEW.id,
  GOOGLE_GEMINI_3_1_PRO_PREVIEW_CUSTOMTOOLS.id,
  GOOGLE_GEMMA_2_27B_IT.id,
  GOOGLE_GEMMA_3_12B_IT.id,
  GOOGLE_GEMMA_3_12B_IT_FREE.id,
  GOOGLE_GEMMA_3_27B_IT.id,
  GOOGLE_GEMMA_3_27B_IT_FREE.id,
  GOOGLE_GEMMA_3_4B_IT.id,
  GOOGLE_GEMMA_3_4B_IT_FREE.id,
  GOOGLE_GEMMA_3N_E2B_IT_FREE.id,
  GOOGLE_GEMMA_3N_E4B_IT.id,
  GOOGLE_GEMMA_3N_E4B_IT_FREE.id,
  GOOGLE_GEMMA_4_26B_A4B_IT.id,
  GOOGLE_GEMMA_4_26B_A4B_IT_FREE.id,
  GOOGLE_GEMMA_4_31B_IT.id,
  GOOGLE_GEMMA_4_31B_IT_FREE.id,
  GRYPHE_MYTHOMAX_L2_13B.id,
  IBM_GRANITE_GRANITE_4_0_H_MICRO.id,
  INCEPTION_MERCURY_2.id,
  INFLECTION_INFLECTION_3_PI.id,
  INFLECTION_INFLECTION_3_PRODUCTIVITY.id,
  KWAIPILOT_KAT_CODER_PRO_V2.id,
  LIQUID_LFM_2_24B_A2B.id,
  LIQUID_LFM_2_5_1_2B_INSTRUCT_FREE.id,
  LIQUID_LFM_2_5_1_2B_THINKING_FREE.id,
  MANCER_WEAVER.id,
  META_LLAMA_LLAMA_3_70B_INSTRUCT.id,
  META_LLAMA_LLAMA_3_8B_INSTRUCT.id,
  META_LLAMA_LLAMA_3_1_70B_INSTRUCT.id,
  META_LLAMA_LLAMA_3_1_8B_INSTRUCT.id,
  META_LLAMA_LLAMA_3_2_11B_VISION_INSTRUCT.id,
  META_LLAMA_LLAMA_3_2_1B_INSTRUCT.id,
  META_LLAMA_LLAMA_3_2_3B_INSTRUCT.id,
  META_LLAMA_LLAMA_3_2_3B_INSTRUCT_FREE.id,
  META_LLAMA_LLAMA_3_3_70B_INSTRUCT.id,
  META_LLAMA_LLAMA_3_3_70B_INSTRUCT_FREE.id,
  META_LLAMA_LLAMA_4_MAVERICK.id,
  META_LLAMA_LLAMA_4_SCOUT.id,
  META_LLAMA_LLAMA_GUARD_3_8B.id,
  META_LLAMA_LLAMA_GUARD_4_12B.id,
  META_LLAMA_LLAMA_GUARD_4_12B_FREE.id,
  MICROSOFT_PHI_4.id,
  MICROSOFT_WIZARDLM_2_8X22B.id,
  MINIMAX_MINIMAX_01.id,
  MINIMAX_MINIMAX_M1.id,
  MINIMAX_MINIMAX_M2.id,
  MINIMAX_MINIMAX_M2_HER.id,
  MINIMAX_MINIMAX_M2_1.id,
  MINIMAX_MINIMAX_M2_5.id,
  MINIMAX_MINIMAX_M2_5_FREE.id,
  MINIMAX_MINIMAX_M2_7.id,
  MISTRALAI_CODESTRAL_2508.id,
  MISTRALAI_DEVSTRAL_2512.id,
  MISTRALAI_DEVSTRAL_MEDIUM.id,
  MISTRALAI_DEVSTRAL_SMALL.id,
  MISTRALAI_MINISTRAL_14B_2512.id,
  MISTRALAI_MINISTRAL_3B_2512.id,
  MISTRALAI_MINISTRAL_8B_2512.id,
  MISTRALAI_MISTRAL_7B_INSTRUCT_V0_1.id,
  MISTRALAI_MISTRAL_LARGE.id,
  MISTRALAI_MISTRAL_LARGE_2407.id,
  MISTRALAI_MISTRAL_LARGE_2411.id,
  MISTRALAI_MISTRAL_LARGE_2512.id,
  MISTRALAI_MISTRAL_MEDIUM_3.id,
  MISTRALAI_MISTRAL_MEDIUM_3_1.id,
  MISTRALAI_MISTRAL_NEMO.id,
  MISTRALAI_MISTRAL_SABA.id,
  MISTRALAI_MISTRAL_SMALL_24B_INSTRUCT_2501.id,
  MISTRALAI_MISTRAL_SMALL_2603.id,
  MISTRALAI_MISTRAL_SMALL_3_1_24B_INSTRUCT.id,
  MISTRALAI_MISTRAL_SMALL_3_2_24B_INSTRUCT.id,
  MISTRALAI_MISTRAL_SMALL_CREATIVE.id,
  MISTRALAI_MIXTRAL_8X22B_INSTRUCT.id,
  MISTRALAI_MIXTRAL_8X7B_INSTRUCT.id,
  MISTRALAI_PIXTRAL_LARGE_2411.id,
  MISTRALAI_VOXTRAL_SMALL_24B_2507.id,
  MOONSHOTAI_KIMI_K2.id,
  MOONSHOTAI_KIMI_K2_0905.id,
  MOONSHOTAI_KIMI_K2_THINKING.id,
  MOONSHOTAI_KIMI_K2_5.id,
  MORPH_MORPH_V3_FAST.id,
  MORPH_MORPH_V3_LARGE.id,
  NEX_AGI_DEEPSEEK_V3_1_NEX_N1.id,
  NOUSRESEARCH_HERMES_2_PRO_LLAMA_3_8B.id,
  NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B.id,
  NOUSRESEARCH_HERMES_3_LLAMA_3_1_405B_FREE.id,
  NOUSRESEARCH_HERMES_3_LLAMA_3_1_70B.id,
  NOUSRESEARCH_HERMES_4_405B.id,
  NOUSRESEARCH_HERMES_4_70B.id,
  NVIDIA_LLAMA_3_1_NEMOTRON_70B_INSTRUCT.id,
  NVIDIA_LLAMA_3_3_NEMOTRON_SUPER_49B_V1_5.id,
  NVIDIA_NEMOTRON_3_NANO_30B_A3B.id,
  NVIDIA_NEMOTRON_3_NANO_30B_A3B_FREE.id,
  NVIDIA_NEMOTRON_3_SUPER_120B_A12B.id,
  NVIDIA_NEMOTRON_3_SUPER_120B_A12B_FREE.id,
  NVIDIA_NEMOTRON_NANO_12B_V2_VL.id,
  NVIDIA_NEMOTRON_NANO_12B_V2_VL_FREE.id,
  NVIDIA_NEMOTRON_NANO_9B_V2.id,
  NVIDIA_NEMOTRON_NANO_9B_V2_FREE.id,
  OPENAI_GPT_3_5_TURBO.id,
  OPENAI_GPT_3_5_TURBO_0613.id,
  OPENAI_GPT_3_5_TURBO_16K.id,
  OPENAI_GPT_3_5_TURBO_INSTRUCT.id,
  OPENAI_GPT_4.id,
  OPENAI_GPT_4_0314.id,
  OPENAI_GPT_4_1106_PREVIEW.id,
  OPENAI_GPT_4_TURBO.id,
  OPENAI_GPT_4_TURBO_PREVIEW.id,
  OPENAI_GPT_4_1.id,
  OPENAI_GPT_4_1_MINI.id,
  OPENAI_GPT_4_1_NANO.id,
  OPENAI_GPT_4O.id,
  OPENAI_GPT_4O_2024_05_13.id,
  OPENAI_GPT_4O_2024_08_06.id,
  OPENAI_GPT_4O_2024_11_20.id,
  OPENAI_GPT_4O_AUDIO_PREVIEW.id,
  OPENAI_GPT_4O_MINI.id,
  OPENAI_GPT_4O_MINI_2024_07_18.id,
  OPENAI_GPT_4O_MINI_SEARCH_PREVIEW.id,
  OPENAI_GPT_4O_SEARCH_PREVIEW.id,
  OPENAI_GPT_4O_EXTENDED.id,
  OPENAI_GPT_5.id,
  OPENAI_GPT_5_CHAT.id,
  OPENAI_GPT_5_CODEX.id,
  OPENAI_GPT_5_IMAGE.id,
  OPENAI_GPT_5_IMAGE_MINI.id,
  OPENAI_GPT_5_MINI.id,
  OPENAI_GPT_5_NANO.id,
  OPENAI_GPT_5_PRO.id,
  OPENAI_GPT_5_1.id,
  OPENAI_GPT_5_1_CHAT.id,
  OPENAI_GPT_5_1_CODEX.id,
  OPENAI_GPT_5_1_CODEX_MAX.id,
  OPENAI_GPT_5_1_CODEX_MINI.id,
  OPENAI_GPT_5_2.id,
  OPENAI_GPT_5_2_CHAT.id,
  OPENAI_GPT_5_2_CODEX.id,
  OPENAI_GPT_5_2_PRO.id,
  OPENAI_GPT_5_3_CHAT.id,
  OPENAI_GPT_5_3_CODEX.id,
  OPENAI_GPT_5_4.id,
  OPENAI_GPT_5_4_MINI.id,
  OPENAI_GPT_5_4_NANO.id,
  OPENAI_GPT_5_4_PRO.id,
  OPENAI_GPT_AUDIO.id,
  OPENAI_GPT_AUDIO_MINI.id,
  OPENAI_GPT_OSS_120B.id,
  OPENAI_GPT_OSS_120B_FREE.id,
  OPENAI_GPT_OSS_20B.id,
  OPENAI_GPT_OSS_20B_FREE.id,
  OPENAI_GPT_OSS_SAFEGUARD_20B.id,
  OPENAI_O1.id,
  OPENAI_O1_PRO.id,
  OPENAI_O3.id,
  OPENAI_O3_DEEP_RESEARCH.id,
  OPENAI_O3_MINI.id,
  OPENAI_O3_MINI_HIGH.id,
  OPENAI_O3_PRO.id,
  OPENAI_O4_MINI.id,
  OPENAI_O4_MINI_DEEP_RESEARCH.id,
  OPENAI_O4_MINI_HIGH.id,
  OPENROUTER_AUTO.id,
  OPENROUTER_BODYBUILDER.id,
  OPENROUTER_ELEPHANT_ALPHA.id,
  OPENROUTER_FREE.id,
  PERPLEXITY_SONAR.id,
  PERPLEXITY_SONAR_DEEP_RESEARCH.id,
  PERPLEXITY_SONAR_PRO.id,
  PERPLEXITY_SONAR_PRO_SEARCH.id,
  PERPLEXITY_SONAR_REASONING_PRO.id,
  PRIME_INTELLECT_INTELLECT_3.id,
  QWEN_QWEN_2_5_72B_INSTRUCT.id,
  QWEN_QWEN_2_5_7B_INSTRUCT.id,
  QWEN_QWEN_2_5_CODER_32B_INSTRUCT.id,
  QWEN_QWEN_MAX.id,
  QWEN_QWEN_PLUS.id,
  QWEN_QWEN_PLUS_2025_07_28.id,
  QWEN_QWEN_PLUS_2025_07_28_THINKING.id,
  QWEN_QWEN_TURBO.id,
  QWEN_QWEN_VL_MAX.id,
  QWEN_QWEN_VL_PLUS.id,
  QWEN_QWEN2_5_VL_32B_INSTRUCT.id,
  QWEN_QWEN2_5_VL_72B_INSTRUCT.id,
  QWEN_QWEN3_14B.id,
  QWEN_QWEN3_235B_A22B.id,
  QWEN_QWEN3_235B_A22B_2507.id,
  QWEN_QWEN3_235B_A22B_THINKING_2507.id,
  QWEN_QWEN3_30B_A3B.id,
  QWEN_QWEN3_30B_A3B_INSTRUCT_2507.id,
  QWEN_QWEN3_30B_A3B_THINKING_2507.id,
  QWEN_QWEN3_32B.id,
  QWEN_QWEN3_8B.id,
  QWEN_QWEN3_CODER.id,
  QWEN_QWEN3_CODER_30B_A3B_INSTRUCT.id,
  QWEN_QWEN3_CODER_FLASH.id,
  QWEN_QWEN3_CODER_NEXT.id,
  QWEN_QWEN3_CODER_PLUS.id,
  QWEN_QWEN3_CODER_FREE.id,
  QWEN_QWEN3_MAX.id,
  QWEN_QWEN3_MAX_THINKING.id,
  QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT.id,
  QWEN_QWEN3_NEXT_80B_A3B_INSTRUCT_FREE.id,
  QWEN_QWEN3_NEXT_80B_A3B_THINKING.id,
  QWEN_QWEN3_VL_235B_A22B_INSTRUCT.id,
  QWEN_QWEN3_VL_235B_A22B_THINKING.id,
  QWEN_QWEN3_VL_30B_A3B_INSTRUCT.id,
  QWEN_QWEN3_VL_30B_A3B_THINKING.id,
  QWEN_QWEN3_VL_32B_INSTRUCT.id,
  QWEN_QWEN3_VL_8B_INSTRUCT.id,
  QWEN_QWEN3_VL_8B_THINKING.id,
  QWEN_QWEN3_5_122B_A10B.id,
  QWEN_QWEN3_5_27B.id,
  QWEN_QWEN3_5_35B_A3B.id,
  QWEN_QWEN3_5_397B_A17B.id,
  QWEN_QWEN3_5_9B.id,
  QWEN_QWEN3_5_FLASH_02_23.id,
  QWEN_QWEN3_5_PLUS_02_15.id,
  QWEN_QWEN3_6_PLUS.id,
  QWEN_QWQ_32B.id,
  REKAAI_REKA_EDGE.id,
  REKAAI_REKA_FLASH_3.id,
  RELACE_RELACE_APPLY_3.id,
  RELACE_RELACE_SEARCH.id,
  SAO10K_L3_EURYALE_70B.id,
  SAO10K_L3_LUNARIS_8B.id,
  SAO10K_L3_1_70B_HANAMI_X1.id,
  SAO10K_L3_1_EURYALE_70B.id,
  SAO10K_L3_3_EURYALE_70B.id,
  STEPFUN_STEP_3_5_FLASH.id,
  SWITCHPOINT_ROUTER.id,
  TENCENT_HUNYUAN_A13B_INSTRUCT.id,
  THEDRUMMER_CYDONIA_24B_V4_1.id,
  THEDRUMMER_ROCINANTE_12B.id,
  THEDRUMMER_SKYFALL_36B_V2.id,
  THEDRUMMER_UNSLOPNEMO_12B.id,
  TNGTECH_DEEPSEEK_R1T2_CHIMERA.id,
  UNDI95_REMM_SLERP_L2_13B.id,
  UPSTAGE_SOLAR_PRO_3.id,
  WRITER_PALMYRA_X5.id,
  X_AI_GROK_3.id,
  X_AI_GROK_3_BETA.id,
  X_AI_GROK_3_MINI.id,
  X_AI_GROK_3_MINI_BETA.id,
  X_AI_GROK_4.id,
  X_AI_GROK_4_FAST.id,
  X_AI_GROK_4_1_FAST.id,
  X_AI_GROK_4_20.id,
  X_AI_GROK_4_20_MULTI_AGENT.id,
  X_AI_GROK_CODE_FAST_1.id,
  XIAOMI_MIMO_V2_FLASH.id,
  XIAOMI_MIMO_V2_OMNI.id,
  XIAOMI_MIMO_V2_PRO.id,
  Z_AI_GLM_4_32B.id,
  Z_AI_GLM_4_5.id,
  Z_AI_GLM_4_5_AIR.id,
  Z_AI_GLM_4_5_AIR_FREE.id,
  Z_AI_GLM_4_5V.id,
  Z_AI_GLM_4_6.id,
  Z_AI_GLM_4_6V.id,
  Z_AI_GLM_4_7.id,
  Z_AI_GLM_4_7_FLASH.id,
  Z_AI_GLM_5.id,
  Z_AI_GLM_5_TURBO.id,
  Z_AI_GLM_5_1.id,
  Z_AI_GLM_5V_TURBO.id,
] as const

export const OPENROUTER_IMAGE_MODELS = [
  GOOGLE_GEMINI_2_5_FLASH_IMAGE.id,
  GOOGLE_GEMINI_3_PRO_IMAGE_PREVIEW.id,
  GOOGLE_GEMINI_3_1_FLASH_IMAGE_PREVIEW.id,
  OPENAI_GPT_5_IMAGE.id,
  OPENAI_GPT_5_IMAGE_MINI.id,
  OPENROUTER_AUTO.id,
] as const
