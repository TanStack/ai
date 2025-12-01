// originates -> ollama/llama/llama.cpp/include/llama.h
// located -> ollama/llama/llama.go
interface _GoLlamaContextParams {
  n_ctx: number // n_ctx
  n_batch: number // n_batch
  // n_seq_max: number
  n_threads: number // n_threads
  // n_threads_batch: number
  // embeddings: boolean
  // flash_attn_type: number
  type_k: number // type_k
  type_v: number // type_v
  // rope_scaling_type: number
  // rope_freq_base: number
  // rope_freq_scale: number
  // causal_attn: boolean
  // embeddings_only: boolean
}

export interface ContextParams {
  n_ctx?: number
  n_batch?: number
  n_threads?: number
  type_k?: number
  type_v?: number
}

// located -> ollama/llama/llama.go
interface _GoModelParams {
  // Devices: Array<number>
  NumGpuLayers: number // num_gpu
  MainGpu: number // main_gpu
  UseMmap: boolean // use_mmap
  // TensorSplit: Array<number>
  // Progress: (type: number) => void
  VocabOnly: boolean // vocab_only
}

export interface ModelParams {
  num_gpu?: number
  main_gpu?: number
  use_mmap?: boolean
  vocab_only?: boolean
}

// located -> ollama/llama/llama.go
interface _GoSamplingParams {
  TopK: number // top_k
  TopP: number // top_p
  MinP: number // tfs_z
  TypicalP: number // typical_p
  Temp: number // temperature
  RepeatLastN: number // repeat_last_n
  PenaltyRepeat: number // repeat_penalty
  PenaltyFreq: number // frequency_penalty
  PenaltyPresent: number // presence_penalty
  // PenalizeNl: boolean
  Seed: number // seed
  // Grammar: string
}

export interface SamplingParams {
  top_k?: number
  top_p?: number
  tfs_z?: number
  typical_p?: number
  temperature?: number
  repeat_last_n?: number
  repeat_penalty?: number
  presence_penalty?: number
  frequency_penalty?: number
  seed?: number
}

interface ModelMeta<TProviderOptions = unknown> {
  name: string
  options?: ContextParams & ModelParams & SamplingParams
  providerOptions?: TProviderOptions
  supports?: {
    input?: Array<'text' | 'image' | 'video'>
    output?: Array<'text' | 'image' | 'video'>
    capabilities?: Array<'tools' | 'thinking' | 'vision' | 'embedding'>
  }
  size?: string
  context?: string
}

// llama 3.1
// Llama 3.1 is a new state-of-the-art model from Meta available in 8B, 70B and 405B parameter sizes.
const LLAMA3_1_LATEST = {
  name: 'llama3.1:latest',
  supports: { capabilities: ['tools'] },
} as const satisfies ModelMeta<any>

const LLAMA3_1_8b = {
  name: 'llama3.1:8b',
  supports: { capabilities: ['tools'] },
} as const satisfies ModelMeta<any>

const LLAMA3_1_70b = {
  name: 'llama3.1:70b',
  supports: { capabilities: ['tools'] },
} as const satisfies ModelMeta<any>

const LLAMA3_1_405b = {
  name: 'llama3.1:405b',
  supports: { capabilities: ['tools'] },
} as const satisfies ModelMeta<any>

// llama 3.2
// Meta's Llama 3.2 goes small with 1B and 3B models.
const LLAMA3_2_LATEST = {
  name: 'llama3.2:latest',
  supports: { capabilities: ['tools'] },
} as const satisfies ModelMeta<any>

const LLAMA3_2_1b = {
  name: 'llama3.2:1b',
  supports: { capabilities: ['tools'] },
} as const satisfies ModelMeta<any>

const LLAMA3_2_3b = {
  name: 'llama3.2:3b',
  supports: { capabilities: ['tools'] },
} as const satisfies ModelMeta<any>

// llama 3
// Meta Llama 3: The most capable openly available LLM to date
const LLAMA3_LATEST = {
  name: 'llama3:latest',
} as const satisfies ModelMeta<any>

const LLAMA3_8b = {
  name: 'llama3:8b',
} as const satisfies ModelMeta<any>

const LLAMA3_70b = {
  name: 'llama3:70b',
} as const satisfies ModelMeta<any>

// llama 2
// Llama 2 is a collection of foundation language models ranging from 7B to 70B parameters.
const LLAMA2_LATEST = {
  name: 'llama2:latest',
} as const satisfies ModelMeta<any>

const LLAMA2_7b = {
  name: 'llama2:7b',
} as const satisfies ModelMeta<any>

const LLAMA2_13b = {
  name: 'llama2:13b',
} as const satisfies ModelMeta<any>

const LLAMA2_70b = {
  name: 'llama2:70b',
} as const satisfies ModelMeta<any>

// llama 3.2 vision
// Llama 3.2 Vision is a collection of instruction-tuned image reasoning generative models in 11B and 90B sizes.
const LLAMA3_2_VISION_LATEST = {
  name: 'llama3.2:latest',
  supports: { capabilities: ['vision'] },
} as const satisfies ModelMeta<any>

const LLAMA3_2_VISION_11b = {
  name: 'llama3.2:11b',
  supports: { capabilities: ['vision'] },
} as const satisfies ModelMeta<any>

const LLAMA3_2_VISION_90b = {
  name: 'llama3.2:90b',
  supports: { capabilities: ['vision'] },
} as const satisfies ModelMeta<any>

// llama 3.3
// New state of the art 70B model. Llama 3.3 70B offers similar performance compared to the Llama 3.1 405B model.
const LLAMA3_3_LATEST = {
  name: 'llama3.3:latest',
  supports: { capabilities: ['tools'] },
} as const satisfies ModelMeta<any>

const LLAMA3_3_70b = {
  name: 'llama3.3:70b',
  supports: { capabilities: ['tools'] },
} as const satisfies ModelMeta<any>

// llama 2 uncensored
// Uncensored Llama 2 model by George Sung and Jarrad Hope.
const LLAMA2_UNCENSORED_LATEST = {
  name: 'llama2-uncensored:latest',
  supports: { capabilities: ['vision'] },
} as const satisfies ModelMeta<any>

const LLAMA2_UNCENSORED_7b = {
  name: 'llama2-uncensored:7b',
} as const satisfies ModelMeta<any>

const LLAMA2_UNCENSORED_70b = {
  name: 'llama2-uncensored:70b',
} as const satisfies ModelMeta<any>

// llama 4
// Meta's latest collection of multimodal models.
const LLAMA4__LATEST = {
  name: 'llama4:latest',
  supports: { capabilities: ['vision', 'tools'] },
} as const satisfies ModelMeta<any>

const LLAMA4_16X17b = {
  name: 'llama4:16x17b',
  supports: { capabilities: ['vision', 'tools'] },
} as const satisfies ModelMeta<any>

const LLAMA4_128X17b = {
  name: 'llama4:128x17b',
  supports: { capabilities: ['vision', 'tools'] },
} as const satisfies ModelMeta<any>

// llama 2 chinese
// Llama 2 based model fine tuned to improve Chinese dialogue ability.
const LLAMA2_CHINESE_LATEST = {
  name: 'llama2-chinese:latest',
} as const satisfies ModelMeta<any>

const LLAMA2_CHINESE_7b = {
  name: 'llama2-chinese:7b',
} as const satisfies ModelMeta<any>

const LLAMA2_CHINESE_13b = {
  name: 'llama2-chinese:13b',
} as const satisfies ModelMeta<any>

// llama 3 chatqa
// A model from NVIDIA based on Llama 3 that excels at conversational question answering (QA) and retrieval-augmented generation (RAG).
const LLAMA3_CHATQA_LATEST = {
  name: 'llama3-chatqa:latest',
} as const satisfies ModelMeta<any>

const LLAMA3_CHATQA_8b = {
  name: 'llama3-chatqa:8b',
} as const satisfies ModelMeta<any>

const LLAMA3_CHATQA_70b = {
  name: 'llama3-chatqa:70b',
} as const satisfies ModelMeta<any>

// llama 3 gradient
// This model extends LLama-3 8B's context length from 8k to over 1m tokens.
const LLAMA3_GRADIENT_LATEST = {
  name: 'llama3-gradient:latest',
} as const satisfies ModelMeta<any>

const LLAMA3_GRADIENT_8b = {
  name: 'llama3-gradient:8b',
} as const satisfies ModelMeta<any>

const LLAMA3_GRADIENT_70b = {
  name: 'llama3-gradient:70b',
} as const satisfies ModelMeta<any>

// llama guard 3
// Llama Guard 3 is a series of models fine-tuned for content safety classification of LLM inputs and responses.
const LLAMA_GUARD3_LATEST = {
  name: 'llama-guard3:latest',
} as const satisfies ModelMeta<any>

const LLAMA3_GUARD3_1b = {
  name: 'llama-guard3:1b',
} as const satisfies ModelMeta<any>

const LLAMA3_GUARD3_8b = {
  name: 'llama-guard3:8b',
} as const satisfies ModelMeta<any>

// llama 3 groq tool use
// A series of models from Groq that represent a significant advancement in open-source AI capabilities for tool use/function calling.
const LLAMA3_GROQ_TOOL_USE_LATEST = {
  name: 'llama3-groq-tool-use:latest',
} as const satisfies ModelMeta<any>

const LLAMA3_GROQ_TOOL_USE_8b = {
  name: 'llama3-groq-tool-use:8b',
} as const satisfies ModelMeta<any>

const LLAMA3_GROQ_TOOL_USE_70b = {
  name: 'llama3-groq-tool-use:70b',
} as const satisfies ModelMeta<any>

// llama pro
// An expansion of Llama 2 that specializes in integrating both general language understanding and domain-specific knowledge, particularly in programming and mathematics.
const LLAMA_PRO_LATEST = {
  name: 'llama-pro:latest',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_INSTRUCT = {
  name: 'llama-pro:instruct',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_TEXT = {
  name: 'llama-pro:text',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q2_K = {
  name: 'llama-pro:8b-instruct-q2_K',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q3_K_S = {
  name: 'llama-pro:8b-instruct-q3_K_S',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q3_K_M = {
  name: 'llama-pro:8b-instruct-q3_K_M',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q3_K_L = {
  name: 'llama-pro:8b-instruct-q3_K_L',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q4_0 = {
  name: 'llama-pro:8b-instruct-q4_0',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q4_1 = {
  name: 'llama-pro:8b-instruct-q4_1',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q4_K_S = {
  name: 'llama-pro:8b-instruct-q4_K_S',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q4_K_M = {
  name: 'llama-pro:8b-instruct-q4_K_M',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q5_0 = {
  name: 'llama-pro:8b-instruct-q5_0',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q5_1 = {
  name: 'llama-pro:8b-instruct-q5_1',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q5_K_S = {
  name: 'llama-pro:8b-instruct-q5_K_S',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q5_K_M = {
  name: 'llama-pro:8b-instruct-q5_K_M',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q6_K = {
  name: 'llama-pro:8b-instruct-q6_K',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_Q8_0 = {
  name: 'llama-pro:8b-instruct-q8_0',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_INSTRUCT_FP16 = {
  name: 'llama-pro:8b-instruct-fp16',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q2_K = {
  name: 'llama-pro:8b-text-q2_K',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q3_K_S = {
  name: 'llama-pro:8b-text-q3_K_S',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q3_K_M = {
  name: 'llama-pro:8b-text-q3_K_M',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q3_K_L = {
  name: 'llama-pro:8b-text-q3_K_L',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q4_0 = {
  name: 'llama-pro:8b-text-q4_0',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q4_1 = {
  name: 'llama-pro:8b-text-q4_1',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q4_K_S = {
  name: 'llama-pro:8b-text-q4_K_S',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q4_K_M = {
  name: 'llama-pro:8b-text-q4_K_M',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q5_0 = {
  name: 'llama-pro:8b-text-q5_0',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q5_1 = {
  name: 'llama-pro:8b-text-q5_1',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q5_K_S = {
  name: 'llama-pro:8b-text-q5_K_S',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q5_K_M = {
  name: 'llama-pro:8b-text-q5_K_M',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q6_K = {
  name: 'llama-pro:8b-text-q6_K',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_Q8_0 = {
  name: 'llama-pro:8b-text-q8_0',
} as const satisfies ModelMeta<any>

const LLAMA_PRO_8B_TEXT_FP16 = {
  name: 'llama-pro:8b-text-fp16',
} as const satisfies ModelMeta<any>

// dolphin 3
// Dolphin 3.0 Llama 3.1 8B is the next generation of the Dolphin series of instruct-tuned models designed to be the ultimate general purpose local model, enabling coding, math, agentic, function calling, and general use cases.
const DOLPHIN3_LATEST = {
  name: 'dolphin3:latest',
} as const satisfies ModelMeta<any>

const DOLPHIN3_8b = {
  name: 'dolphin3:8b',
} as const satisfies ModelMeta<any>

// tiny llama
// The TinyLlama project is an open endeavor to train a compact 1.1B Llama model on 3 trillion tokens.
const TINYLLAMA_LATEST = {
  name: 'tinyllama:latest',
} as const satisfies ModelMeta<any>

const TINYLLAMA_1_1b = {
  name: 'tinyllama:1.1b',
} as const satisfies ModelMeta<any>

// llava llama 3
// A LLaVA model fine-tuned from Llama 3 Instruct with better scores in several benchmarks.
const LLAVA_LLAMA3_LATEST = {
  name: 'llava-llama3:latest',
} as const satisfies ModelMeta<any>

const LLAVA_LLAMA3_8b = {
  name: 'llava-llama3:8b',
} as const satisfies ModelMeta<any>

// dolphin llama 3
// Dolphin 2.9 is a new model with 8B and 70B sizes by Eric Hartford based on Llama 3 that has a variety of instruction, conversational, and coding skills.
const DOLPHIN_LLAMA3_LATEST = {
  name: 'dolphin-llama3:latest',
} as const satisfies ModelMeta<any>

const DOLPHIN_LLAMA3_8b = {
  name: 'dolphin-llama3:8b',
} as const satisfies ModelMeta<any>

const DOLPHIN_LLAMA3_70b = {
  name: 'dolphin-llama3:70b',
} as const satisfies ModelMeta<any>

// wizard-vicuna-uncensored
// Wizard Vicuna Uncensored is a 7B, 13B, and 30B parameter model based on Llama 2 uncensored by Eric Hartford.

const WIZARD_VICUNA_UNCENSORED = {
  name: 'wizard-vicuna-uncensored:latest',
} as const satisfies ModelMeta<any>

const WIZARD_VICUNA_7b = {
  name: 'wizard-vicuna-uncensored:7b',
} as const satisfies ModelMeta<any>

const WIZARD_VICUNA_13b = {
  name: 'wizard-vicuna-uncensored:13b',
} as const satisfies ModelMeta<any>

const WIZARD_VICUNA_30b = {
  name: 'wizard-vicuna-uncensored:30b',
} as const satisfies ModelMeta<any>

// nous hermes
// General use models based on Llama and Llama 2 from Nous Research.
const NOUS_HERMES_LATEST = {
  name: 'nous-hermes:latest',
} as const satisfies ModelMeta<any>

const NOUS_HERMES_7b = {
  name: 'nous-hermes:7b',
} as const satisfies ModelMeta<any>

const NOUS_HERMES_13b = {
  name: 'nous-hermes:13b',
} as const satisfies ModelMeta<any>
