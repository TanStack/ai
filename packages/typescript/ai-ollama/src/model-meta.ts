// constants
import { ATHENE_MODELS } from './meta/model-meta-athene'
import { AYA_MODELS } from './meta/model-meta-aya'
import { CODEGEMMA_MODELS } from './meta/model-meta-codegemma'
import { CODELLAMA_MODELS } from './meta/model-meta-codellama'
import { COMMAND_R_MODELS } from './meta/model-meta-command-r'
import { COMMAND_R_PLUS_MODELS } from './meta/model-meta-command-r-plus'
import { COMMAND_R_7b_MODELS } from './meta/model-meta-command-r7b'
import { DEEPSEEK_CODER_V2_MODELS } from './meta/model-meta-deepseek-coder-v2'
import { DEEPSEEK_OCR_MODELS } from './meta/model-meta-deepseek-ocr'
import { DEEPSEEK_R1_MODELS } from './meta/model-meta-deepseek-r1'
import { DEEPSEEK_V3_1_MODELS } from './meta/model-meta-deepseek-v3.1'
import { DEVSTRAL_MODELS } from './meta/model-meta-devstral'
import { DOLPHIN3_MODELS } from './meta/model-meta-dolphin3'
import { EXAONE3_5MODELS } from './meta/model-meta-exaone3.5'
import { FALCON2_MODELS } from './meta/model-meta-falcon2'
import { FALCON3_MODELS } from './meta/model-meta-falcon3'
import { FIREFUNCTION_V2_MODELS } from './meta/model-meta-firefunction-v2'
import { GEMMA_MODELS } from './meta/model-meta-gemma'
import { GEMMA2_MODELS } from './meta/model-meta-gemma2'
import { GEMMA3_MODELS } from './meta/model-meta-gemma3'
import { GPT_OSS_MODELS } from './meta/model-meta-gpt-oss'
import { GRANITE3_DENSE_MODELS } from './meta/model-meta-granite3-dense'
import { GRANITE3_GUARDIAN_MODELS } from './meta/model-meta-granite3-guardian'
import { GRANITE3_MOE_MODELS } from './meta/model-meta-granite3-moe'
import { GRANITE3_1_DENSE_MODELS } from './meta/model-meta-granite3.1-dense'
import { GRANITE3_1_MOE_MODELS } from './meta/model-meta-granite3.1-moe'
import { LLAMA_GUARD3_MODELS } from './meta/model-meta-llama-guard3'
import { LLAMA2_MODELS } from './meta/model-meta-llama2'
import { LLAMA3_MODELS } from './meta/model-meta-llama3'
import { LLAMA3_CHATQA_MODELS } from './meta/model-meta-llama3-chatqa'
import { LLAMA3_GRADIENT_MODELS } from './meta/model-meta-llama3-gradient'
import { LLAMA3_1_MODELS } from './meta/model-meta-llama3.1'
import { LLAMA3_2_MODELS } from './meta/model-meta-llama3.2'
import { LLAMA3_2_VISION_MODELS } from './meta/model-meta-llama3.2-vision'
import { LLAMA3_3_MODELS } from './meta/model-meta-llama3.3'
import { LLAMA4_MODELS } from './meta/model-meta-llama4'
import { LLAVA_MODELS } from './meta/model-meta-llava'
import { LLAVA_LLAMA3_MODELS } from './meta/model-meta-llava-llama3'
import { LLAVA_PHI3_MODELS } from './meta/model-meta-llava-phi3'
import { MARCO_O1_MODELS } from './meta/model-meta-marco-o1'
import { MISTRAL_MODELS } from './meta/model-meta-mistral'
import { MISTRAL_LARGE_MODELS } from './meta/model-meta-mistral-large'
import { MISTRAL_NEMO_MODELS } from './meta/model-meta-mistral-nemo'
import { MISTRAL_SMALL_MODELS } from './meta/model-meta-mistral-small'
import { MIXTRAL_MODELS } from './meta/model-meta-mixtral'
import { MOONDREAM_MODELS } from './meta/model-meta-moondream'
import { NEMOTRON_MODELS } from './meta/model-meta-nemotron'
import { NEMOTRON_MINI_MODELS } from './meta/model-meta-nemotron-mini'
import { OLMO2_MODELS } from './meta/model-meta-olmo2'
import { OPENCODER_MODELS } from './meta/model-meta-opencoder'
import { OPENHERMES_MODELS } from './meta/model-meta-openhermes'
import { PHI3_MODELS } from './meta/model-meta-phi3'
import { PHI4_MODELS } from './meta/model-meta-phi4'
import { QWEN_MODELS } from './meta/model-meta-qwen'
import { QWEN2_MODELS } from './meta/model-meta-qwen2'
import { QWEN2_5_MODELS } from './meta/model-meta-qwen2.5'
import { QWEN2_5_CODER_MODELS } from './meta/model-meta-qwen2.5-coder'
import { QWEN3_MODELS } from './meta/model-meta-qwen3'
import { QWQ_MODELS } from './meta/model-meta-qwq'
import { SAILOR2_MODELS } from './meta/model-meta-sailor2'
import { SHIELDGEMMA_MODELS } from './meta/model-meta-shieldgemma'
import { SMALLTINKER_MODELS } from './meta/model-meta-smalltinker'
import { SMOLLM_MODELS } from './meta/model-meta-smollm'
import { TINYLLAMA_MODELS } from './meta/model-meta-tinyllama'
import { TULU3_MODELS } from './meta/model-meta-tulu3'

// types
import type {
  AtheneChatModelProviderOptionsByName,
  AtheneModelInputModalitiesByName,
} from './meta/model-meta-athene'
import type {
  AyaChatModelProviderOptionsByName,
  AyaModelInputModalitiesByName,
} from './meta/model-meta-aya'
import type {
  CodegemmaChatModelProviderOptionsByName,
  CodegemmaModelInputModalitiesByName,
} from './meta/model-meta-codegemma'
import type {
  CodellamaChatModelProviderOptionsByName,
  CodellamaModelInputModalitiesByName,
} from './meta/model-meta-codellama'
import type {
  CommandRChatModelProviderOptionsByName,
  CommandRModelInputModalitiesByName,
} from './meta/model-meta-command-r'
import type {
  CommandRPlusChatModelProviderOptionsByName,
  CommandRPlusModelInputModalitiesByName,
} from './meta/model-meta-command-r-plus'
import type {
  CommandR7bChatModelProviderOptionsByName,
  CommandR7bModelInputModalitiesByName,
} from './meta/model-meta-command-r7b'
import type {
  DeepseekCoderV2ChatModelProviderOptionsByName,
  DeepseekCoderV2ModelInputModalitiesByName,
} from './meta/model-meta-deepseek-coder-v2'
import type {
  DeepseekOcrChatModelProviderOptionsByName,
  DeepseekOcrModelInputModalitiesByName,
} from './meta/model-meta-deepseek-ocr'
import type {
  DeepseekR1ChatModelProviderOptionsByName,
  DeepseekR1ModelInputModalitiesByName,
} from './meta/model-meta-deepseek-r1'
import type {
  Deepseekv3_1ChatModelProviderOptionsByName,
  Deepseekv3_1ModelInputModalitiesByName,
} from './meta/model-meta-deepseek-v3.1'
import type {
  DevstralChatModelProviderOptionsByName,
  DevstralModelInputModalitiesByName,
} from './meta/model-meta-devstral'
import type {
  Dolphin3ChatModelProviderOptionsByName,
  Dolphin3ModelInputModalitiesByName,
} from './meta/model-meta-dolphin3'
import type {
  Exaone3_5ChatModelProviderOptionsByName,
  Exaone3_5ModelInputModalitiesByName,
} from './meta/model-meta-exaone3.5'
import type {
  Falcon2ChatModelProviderOptionsByName,
  Falcon2ModelInputModalitiesByName,
} from './meta/model-meta-falcon2'
import type {
  Falcon3ChatModelProviderOptionsByName,
  Falcon3ModelInputModalitiesByName,
} from './meta/model-meta-falcon3'
import type {
  Firefunction_V2ChatModelProviderOptionsByName,
  Firefunction_V2ModelInputModalitiesByName,
} from './meta/model-meta-firefunction-v2'
import type {
  GemmaChatModelProviderOptionsByName,
  GemmaModelInputModalitiesByName,
} from './meta/model-meta-gemma'
import type {
  Gemma2ChatModelProviderOptionsByName,
  Gemma2ModelInputModalitiesByName,
} from './meta/model-meta-gemma2'
import type {
  Gemma3ChatModelProviderOptionsByName,
  Gemma3ModelInputModalitiesByName,
} from './meta/model-meta-gemma3'
import type {
  GptOssChatModelProviderOptionsByName,
  GptOssModelInputModalitiesByName,
} from './meta/model-meta-gpt-oss'
import type {
  Granite3DenseChatModelProviderOptionsByName,
  Granite3DenseModelInputModalitiesByName,
} from './meta/model-meta-granite3-dense'
import type {
  Granite3GuardianChatModelProviderOptionsByName,
  Granite3GuardianModelInputModalitiesByName,
} from './meta/model-meta-granite3-guardian'
import type {
  Granite3MoeChatModelProviderOptionsByName,
  Granite3MoeModelInputModalitiesByName,
} from './meta/model-meta-granite3-moe'
import type {
  Granite3_1DenseChatModelProviderOptionsByName,
  Granite3_1DenseModelInputModalitiesByName,
} from './meta/model-meta-granite3.1-dense'
import type {
  Granite3_1MoeChatModelProviderOptionsByName,
  Granite3_1MoeModelInputModalitiesByName,
} from './meta/model-meta-granite3.1-moe'
import type {
  LlamaGuard3ChatModelProviderOptionsByName,
  LlamaGuard3ModelInputModalitiesByName,
} from './meta/model-meta-llama-guard3'
import type {
  Llama2ChatModelProviderOptionsByName,
  Llama2ModelInputModalitiesByName,
} from './meta/model-meta-llama2'
import type {
  Llama3ChatModelProviderOptionsByName,
  Llama3ModelInputModalitiesByName,
} from './meta/model-meta-llama3'
import type {
  Llama3ChatQaChatModelProviderOptionsByName,
  Llama3ChatQaModelInputModalitiesByName,
} from './meta/model-meta-llama3-chatqa'
import type {
  Llama3GradientChatModelProviderOptionsByName,
  Llama3GradientModelInputModalitiesByName,
} from './meta/model-meta-llama3-gradient'
import type {
  Llama3_1ChatModelProviderOptionsByName,
  Llama3_1ModelInputModalitiesByName,
} from './meta/model-meta-llama3.1'
import type {
  Llama3_2ChatModelProviderOptionsByName,
  Llama3_2ModelInputModalitiesByName,
} from './meta/model-meta-llama3.2'
import type {
  Llama3_2VisionChatModelProviderOptionsByName,
  Llama3_2VisionModelInputModalitiesByName,
} from './meta/model-meta-llama3.2-vision'
import type {
  Llama3_3ChatModelProviderOptionsByName,
  Llama3_3ModelInputModalitiesByName,
} from './meta/model-meta-llama3.3'
import type {
  Llama4ChatModelProviderOptionsByName,
  Llama4ModelInputModalitiesByName,
} from './meta/model-meta-llama4'
import type {
  LlavaChatModelProviderOptionsByName,
  LlavaModelInputModalitiesByName,
} from './meta/model-meta-llava'
import type {
  LlavaLlamaChatModelProviderOptionsByName,
  LlavaLlamaModelInputModalitiesByName,
} from './meta/model-meta-llava-llama3'
import type {
  LlavaPhi3ChatModelProviderOptionsByName,
  LlavaPhi3ModelInputModalitiesByName,
} from './meta/model-meta-llava-phi3'
import type {
  MarcoO1ChatModelProviderOptionsByName,
  MarcoO1ModelInputModalitiesByName,
} from './meta/model-meta-marco-o1'
import type {
  MistralChatModelProviderOptionsByName,
  MistralModelInputModalitiesByName,
} from './meta/model-meta-mistral'
import type {
  MistralLargeChatModelProviderOptionsByName,
  MistralLargeModelInputModalitiesByName,
} from './meta/model-meta-mistral-large'
import type {
  MistralNemoChatModelProviderOptionsByName,
  MistralNemoModelInputModalitiesByName,
} from './meta/model-meta-mistral-nemo'
import type {
  MistralSmallChatModelProviderOptionsByName,
  MistralSmallModelInputModalitiesByName,
} from './meta/model-meta-mistral-small'
import type {
  MixtralChatModelProviderOptionsByName,
  MixtralModelInputModalitiesByName,
} from './meta/model-meta-mixtral'
import type {
  MoondreamChatModelProviderOptionsByName,
  MoondreamModelInputModalitiesByName,
} from './meta/model-meta-moondream'
import type {
  NemotronChatModelProviderOptionsByName,
  NemotronModelInputModalitiesByName,
} from './meta/model-meta-nemotron'
import type {
  NemotronMiniChatModelProviderOptionsByName,
  NemotronMiniModelInputModalitiesByName,
} from './meta/model-meta-nemotron-mini'
import type {
  Olmo2ChatModelProviderOptionsByName,
  Olmo2ModelInputModalitiesByName,
} from './meta/model-meta-olmo2'
import type {
  OpencoderChatModelProviderOptionsByName,
  OpencoderModelInputModalitiesByName,
} from './meta/model-meta-opencoder'
import type {
  OpenhermesChatModelProviderOptionsByName,
  OpenhermesModelInputModalitiesByName,
} from './meta/model-meta-openhermes'
import type {
  Phi3ChatModelProviderOptionsByName,
  Phi3ModelInputModalitiesByName,
} from './meta/model-meta-phi3'
import type {
  Phi4ChatModelProviderOptionsByName,
  Phi4ModelInputModalitiesByName,
} from './meta/model-meta-phi4'
import type {
  QwenChatModelProviderOptionsByName,
  QwenModelInputModalitiesByName,
} from './meta/model-meta-qwen'
import type {
  Qwen2ChatModelProviderOptionsByName,
  Qwen2ModelInputModalitiesByName,
} from './meta/model-meta-qwen2'
import type {
  Qwen2_5ChatModelProviderOptionsByName,
  Qwen2_5ModelInputModalitiesByName,
} from './meta/model-meta-qwen2.5'
import type {
  Qwen2_5CoderChatModelProviderOptionsByName,
  Qwen2_5CoderModelInputModalitiesByName,
} from './meta/model-meta-qwen2.5-coder'
import type {
  Qwen3ChatModelProviderOptionsByName,
  Qwen3ModelInputModalitiesByName,
} from './meta/model-meta-qwen3'
import type {
  QwqChatModelProviderOptionsByName,
  QwqModelInputModalitiesByName,
} from './meta/model-meta-qwq'
import type {
  Sailor2ChatModelProviderOptionsByName,
  Sailor2ModelInputModalitiesByName,
} from './meta/model-meta-sailor2'
import type {
  ShieldgemmaChatModelProviderOptionsByName,
  ShieldgemmaModelInputModalitiesByName,
} from './meta/model-meta-shieldgemma'
import type {
  SmalltinkerChatModelProviderOptionsByName,
  SmalltinkerModelInputModalitiesByName,
} from './meta/model-meta-smalltinker'
import type {
  SmollmChatModelProviderOptionsByName,
  SmollmModelInputModalitiesByName,
} from './meta/model-meta-smollm'
import type {
  TinyllamaChatModelProviderOptionsByName,
  TinyllamaModelInputModalitiesByName,
} from './meta/model-meta-tinyllama'
import type {
  Tulu3ChatModelProviderOptionsByName,
  Tulu3ModelInputModalitiesByName,
} from './meta/model-meta-tulu3'

export const OLLAMA_TEXT_MODELS = [
  ...ATHENE_MODELS,
  ...AYA_MODELS,
  ...CODEGEMMA_MODELS,
  ...CODELLAMA_MODELS,
  ...COMMAND_R_PLUS_MODELS,
  ...COMMAND_R_MODELS,
  ...COMMAND_R_7b_MODELS,
  ...DEEPSEEK_CODER_V2_MODELS,
  ...DEEPSEEK_OCR_MODELS,
  ...DEEPSEEK_R1_MODELS,
  ...DEEPSEEK_V3_1_MODELS,
  ...DEVSTRAL_MODELS,
  ...DOLPHIN3_MODELS,
  ...EXAONE3_5MODELS,
  ...FALCON2_MODELS,
  ...FALCON3_MODELS,
  ...FIREFUNCTION_V2_MODELS,
  ...GEMMA_MODELS,
  ...GEMMA2_MODELS,
  ...GEMMA3_MODELS,
  ...GPT_OSS_MODELS,
  ...GRANITE3_DENSE_MODELS,
  ...GRANITE3_GUARDIAN_MODELS,
  ...GRANITE3_MOE_MODELS,
  ...GRANITE3_1_DENSE_MODELS,
  ...GRANITE3_1_MOE_MODELS,
  ...LLAMA_GUARD3_MODELS,
  ...LLAMA2_MODELS,
  ...LLAMA3_CHATQA_MODELS,
  ...LLAMA3_GRADIENT_MODELS,
  ...LLAMA3_1_MODELS,
  ...LLAMA3_2_MODELS,
  ...LLAMA3_2_VISION_MODELS,
  ...LLAMA3_3_MODELS,
  ...LLAMA3_MODELS,
  ...LLAMA4_MODELS,
  ...LLAVA_LLAMA3_MODELS,
  ...LLAVA_PHI3_MODELS,
  ...LLAVA_MODELS,
  ...MARCO_O1_MODELS,
  ...MISTRAL_LARGE_MODELS,
  ...MISTRAL_NEMO_MODELS,
  ...MISTRAL_SMALL_MODELS,
  ...MISTRAL_MODELS,
  ...MIXTRAL_MODELS,
  ...MOONDREAM_MODELS,
  ...NEMOTRON_MINI_MODELS,
  ...NEMOTRON_MODELS,
  ...OLMO2_MODELS,
  ...OPENCODER_MODELS,
  ...OPENHERMES_MODELS,
  ...PHI3_MODELS,
  ...PHI4_MODELS,
  ...QWEN_MODELS,
  ...QWEN2_5_CODER_MODELS,
  ...QWEN2_5_MODELS,
  ...QWEN2_MODELS,
  ...QWEN3_MODELS,
  ...QWQ_MODELS,
  ...SAILOR2_MODELS,
  ...SHIELDGEMMA_MODELS,
  ...SMALLTINKER_MODELS,
  ...SMOLLM_MODELS,
  ...TINYLLAMA_MODELS,
  ...TULU3_MODELS,
] as const

export type OllamaChatModelOptionsByName =
  AtheneChatModelProviderOptionsByName &
    AyaChatModelProviderOptionsByName &
    CodegemmaChatModelProviderOptionsByName &
    CodellamaChatModelProviderOptionsByName &
    CommandRPlusChatModelProviderOptionsByName &
    CommandRChatModelProviderOptionsByName &
    CommandR7bChatModelProviderOptionsByName &
    DeepseekCoderV2ChatModelProviderOptionsByName &
    DeepseekOcrChatModelProviderOptionsByName &
    DeepseekR1ChatModelProviderOptionsByName &
    Deepseekv3_1ChatModelProviderOptionsByName &
    DevstralChatModelProviderOptionsByName &
    Dolphin3ChatModelProviderOptionsByName &
    Exaone3_5ChatModelProviderOptionsByName &
    Falcon2ChatModelProviderOptionsByName &
    Falcon3ChatModelProviderOptionsByName &
    Firefunction_V2ChatModelProviderOptionsByName &
    GemmaChatModelProviderOptionsByName &
    Gemma2ChatModelProviderOptionsByName &
    Gemma3ChatModelProviderOptionsByName &
    GptOssChatModelProviderOptionsByName &
    Granite3DenseChatModelProviderOptionsByName &
    Granite3GuardianChatModelProviderOptionsByName &
    Granite3MoeChatModelProviderOptionsByName &
    Granite3_1DenseChatModelProviderOptionsByName &
    Granite3_1MoeChatModelProviderOptionsByName &
    LlamaGuard3ChatModelProviderOptionsByName &
    Llama2ChatModelProviderOptionsByName &
    Llama3ChatQaChatModelProviderOptionsByName &
    Llama3GradientChatModelProviderOptionsByName &
    Llama3_1ChatModelProviderOptionsByName &
    Llama3_2VisionChatModelProviderOptionsByName &
    Llama3_2ChatModelProviderOptionsByName &
    Llama3_3ChatModelProviderOptionsByName &
    Llama3ChatModelProviderOptionsByName &
    Llama4ChatModelProviderOptionsByName &
    LlavaLlamaChatModelProviderOptionsByName &
    LlavaPhi3ChatModelProviderOptionsByName &
    LlavaChatModelProviderOptionsByName &
    MarcoO1ChatModelProviderOptionsByName &
    MistralLargeChatModelProviderOptionsByName &
    MistralNemoChatModelProviderOptionsByName &
    MistralSmallChatModelProviderOptionsByName &
    MistralChatModelProviderOptionsByName &
    MixtralChatModelProviderOptionsByName &
    MoondreamChatModelProviderOptionsByName &
    NemotronMiniChatModelProviderOptionsByName &
    NemotronChatModelProviderOptionsByName &
    Olmo2ChatModelProviderOptionsByName &
    OpencoderChatModelProviderOptionsByName &
    OpenhermesChatModelProviderOptionsByName &
    Phi3ChatModelProviderOptionsByName &
    Phi4ChatModelProviderOptionsByName &
    QwenChatModelProviderOptionsByName &
    Qwen2_5CoderChatModelProviderOptionsByName &
    Qwen2_5ChatModelProviderOptionsByName &
    Qwen2ChatModelProviderOptionsByName &
    Qwen3ChatModelProviderOptionsByName &
    QwqChatModelProviderOptionsByName &
    Sailor2ChatModelProviderOptionsByName &
    ShieldgemmaChatModelProviderOptionsByName &
    SmalltinkerChatModelProviderOptionsByName &
    SmollmChatModelProviderOptionsByName &
    TinyllamaChatModelProviderOptionsByName &
    Tulu3ChatModelProviderOptionsByName

export type OllamaModelInputModalitiesByName =
  AtheneModelInputModalitiesByName &
    AyaModelInputModalitiesByName &
    CodegemmaModelInputModalitiesByName &
    CodellamaModelInputModalitiesByName &
    CommandRPlusModelInputModalitiesByName &
    CommandRModelInputModalitiesByName &
    CommandR7bModelInputModalitiesByName &
    DeepseekCoderV2ModelInputModalitiesByName &
    DeepseekOcrModelInputModalitiesByName &
    DeepseekR1ModelInputModalitiesByName &
    Deepseekv3_1ModelInputModalitiesByName &
    DevstralModelInputModalitiesByName &
    Dolphin3ModelInputModalitiesByName &
    Exaone3_5ModelInputModalitiesByName &
    Falcon2ModelInputModalitiesByName &
    Falcon3ModelInputModalitiesByName &
    Firefunction_V2ModelInputModalitiesByName &
    GemmaModelInputModalitiesByName &
    Gemma2ModelInputModalitiesByName &
    Gemma3ModelInputModalitiesByName &
    GptOssModelInputModalitiesByName &
    Granite3DenseModelInputModalitiesByName &
    Granite3GuardianModelInputModalitiesByName &
    Granite3MoeModelInputModalitiesByName &
    Granite3_1DenseModelInputModalitiesByName &
    Granite3_1MoeModelInputModalitiesByName &
    LlamaGuard3ModelInputModalitiesByName &
    Llama2ModelInputModalitiesByName &
    Llama3ChatQaModelInputModalitiesByName &
    Llama3GradientModelInputModalitiesByName &
    Llama3_1ModelInputModalitiesByName &
    Llama3_2VisionModelInputModalitiesByName &
    Llama3_2ModelInputModalitiesByName &
    Llama3_3ModelInputModalitiesByName &
    Llama3ModelInputModalitiesByName &
    Llama4ModelInputModalitiesByName &
    LlavaLlamaModelInputModalitiesByName &
    LlavaPhi3ModelInputModalitiesByName &
    LlavaModelInputModalitiesByName &
    MarcoO1ModelInputModalitiesByName &
    MistralLargeModelInputModalitiesByName &
    MistralNemoModelInputModalitiesByName &
    MistralSmallModelInputModalitiesByName &
    MistralModelInputModalitiesByName &
    MixtralModelInputModalitiesByName &
    MoondreamModelInputModalitiesByName &
    NemotronMiniModelInputModalitiesByName &
    NemotronModelInputModalitiesByName &
    Olmo2ModelInputModalitiesByName &
    OpencoderModelInputModalitiesByName &
    OpenhermesModelInputModalitiesByName &
    Phi3ModelInputModalitiesByName &
    Phi4ModelInputModalitiesByName &
    QwenModelInputModalitiesByName &
    Qwen2_5CoderModelInputModalitiesByName &
    Qwen2_5ModelInputModalitiesByName &
    Qwen2ModelInputModalitiesByName &
    Qwen3ModelInputModalitiesByName &
    QwqModelInputModalitiesByName &
    Sailor2ModelInputModalitiesByName &
    ShieldgemmaModelInputModalitiesByName &
    SmalltinkerModelInputModalitiesByName &
    SmollmModelInputModalitiesByName &
    TinyllamaModelInputModalitiesByName &
    Tulu3ModelInputModalitiesByName
