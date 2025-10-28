# OpenAI Models Reference

Updated from: https://platform.openai.com/docs/models (October 28, 2025)

## Chat/Text Completion Models (48 models)

### Frontier Models
- **gpt-5** - The best model for coding and agentic tasks across domains
- **gpt-5-mini** - A faster, cost-efficient version of GPT-5 for well-defined tasks
- **gpt-5-nano** - Fastest, most cost-efficient version of GPT-5
- **gpt-5-pro** - Version of GPT-5 that produces smarter and more precise responses
- **gpt-4.1** - Smartest non-reasoning model
- **gpt-4.1-mini** - Smaller, faster version of GPT-4.1
- **gpt-4.1-nano** - Fastest version of GPT-4.1

### Open-Weight Models (Apache 2.0 License)
- **gpt-oss-120b** - Most powerful open-weight model, fits into an H100 GPU
- **gpt-oss-20b** - Medium-sized open-weight model for low latency

### Reasoning Models
- **o3** - Reasoning model for complex tasks, succeeded by GPT-5
- **o3-pro** - Version of o3 with more compute for better responses
- **o3-mini** - A small model alternative to o3
- **o4-mini** - Fast, cost-efficient reasoning model, succeeded by GPT-5 mini
- **o3-deep-research** - Our most powerful deep research model
- **o4-mini-deep-research** - Faster, more affordable deep research model

### Legacy Models
- **gpt-4** - An older high-intelligence GPT model
- **gpt-4-turbo** - An older high-intelligence GPT model
- **gpt-4-turbo-preview** - Deprecated fast GPT model
- **gpt-4o** - Fast, intelligent, flexible GPT model
- **gpt-4o-mini** - Fast, affordable small model for focused tasks
- **gpt-3.5-turbo** - Legacy GPT model for cheaper chat and non-chat tasks

### Audio-Enabled Chat Models
- **gpt-audio** - For audio inputs and outputs with Chat Completions API
- **gpt-audio-mini** - A cost-efficient version of GPT Audio
- **gpt-4o-audio-preview** - GPT-4o models capable of audio inputs and outputs
- **gpt-4o-mini-audio-preview** - Smaller model capable of audio inputs and outputs

### Realtime Models
- **gpt-realtime** - Model capable of realtime text and audio inputs and outputs
- **gpt-realtime-mini** - A cost-efficient version of GPT Realtime
- **gpt-4o-realtime-preview** - Model capable of realtime text and audio inputs and outputs
- **gpt-4o-mini-realtime-preview** - Smaller realtime model for text and audio inputs and outputs

### ChatGPT Models (Not Recommended for API Use)
- **gpt-5-chat-latest** - GPT-5 model used in ChatGPT
- **chatgpt-4o-latest** - GPT-4o model used in ChatGPT

### Specialized/Preview Models
- **gpt-5-codex** - A version of GPT-5 optimized for agentic coding in Codex
- **codex-mini-latest** - Fast reasoning model optimized for the Codex CLI
- **gpt-4o-search-preview** - GPT model for web search in Chat Completions
- **gpt-4o-mini-search-preview** - Fast, affordable small model for web search
- **computer-use-preview** - Computer use preview tool

### Legacy Reasoning (Still Available)
- **o1** - Previous full o-series reasoning model
- **o1-mini** - Deprecated small model alternative to o1
- **o1-preview** - Deprecated preview of our first o-series reasoning model

### Legacy Base Models
- **davinci-002** - Replacement for the GPT-3 curie and davinci base models
- **babbage-002** - Replacement for the GPT-3 ada and babbage base models

## Image Generation Models (4 models)

- **gpt-image-1** - State-of-the-art image generation model
- **gpt-image-1-mini** - A cost-efficient version of GPT Image 1
- **dall-e-3** - Previous generation image generation model
- **dall-e-2** - Our first image generation model

## Embedding Models (3 models)

- **text-embedding-3-large** - Most capable embedding model
- **text-embedding-3-small** - Small embedding model
- **text-embedding-ada-002** - Legacy embedding model

## Audio Models (7 models)

### Transcription (Speech-to-Text)
- **whisper-1** - General-purpose speech recognition model
- **gpt-4o-transcribe** - Speech-to-text model powered by GPT-4o
- **gpt-4o-mini-transcribe** - Speech-to-text model powered by GPT-4o mini
- **gpt-4o-transcribe-diarize** - Transcription model that identifies who's speaking when

### Text-to-Speech
- **tts-1** - Text-to-speech model optimized for speed
- **tts-1-hd** - Text-to-speech model optimized for quality
- **gpt-4o-mini-tts** - Text-to-speech model powered by GPT-4o mini

## Video Generation Models (2 models)

- **sora-2** - Flagship video generation with synced audio
- **sora-2-pro** - Most advanced synced-audio video generation

## Moderation Models

- **omni-moderation-latest** - Identify potentially harmful content in text and images
- **text-moderation-latest** - Legacy text-only moderation model
- **text-moderation-stable** - Deprecated previous generation text-only moderation model

## Total Models by Category

- **Chat/Completion**: 48 models
- **Image Generation**: 4 models
- **Embeddings**: 3 models
- **Audio**: 7 models (4 transcription + 3 text-to-speech)
- **Video**: 2 models
- **Total**: 64 models

## Provider Options by Endpoint

### Chat Provider Options
- reasoningEffort, parallelToolCalls, store, maxToolCalls, metadata, user, reasoningSummary, strictJsonSchema, serviceTier, textVerbosity, logitBias, prediction, maxCompletionTokens, modalities, audio, etc.

### Image Provider Options
- quality (standard/hd), style (natural/vivid), seed, background (transparent/opaque), outputFormat (png/webp/jpeg)

### Embedding Provider Options
- encodingFormat (float/base64), user, dimensions

### Audio Transcription Provider Options
- prompt, language, temperature, responseFormat (json/text/srt/verbose_json/vtt/diarized_json), timestampGranularities, chunkingStrategy, knownSpeakerNames, knownSpeakerReferences, stream, logprobs

### Audio Text-to-Speech Provider Options
- voice (alloy/ash/ballad/coral/echo/sage/shimmer/verse), responseFormat (mp3/opus/aac/flac/wav/pcm), speed (0.25-4.0)

### Video Provider Options
- (To be documented when API details are released)
