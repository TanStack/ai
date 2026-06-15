// AUTO-GENERATED - Do not edit manually
// Generated via scripts/generate-endpoint-maps.ts

import {
  zAceStepAudioInpaintInput,
  zAceStepAudioInpaintOutput,
  zAceStepAudioOutpaintInput,
  zAceStepAudioOutpaintOutput,
  zAceStepAudioToAudioInput,
  zAceStepAudioToAudioOutput,
  zAceStepInput,
  zAceStepOutput,
  zAceStepPromptToAudioInput,
  zAceStepPromptToAudioOutput,
  zAudioUnderstandingInput,
  zAudioUnderstandingOutput,
  zBytedanceSeedSpeechTtsV2Input,
  zBytedanceSeedSpeechTtsV2Output,
  zChatterboxSpeechToSpeechInput,
  zChatterboxSpeechToSpeechOutput,
  zChatterboxTextToSpeechInput,
  zChatterboxTextToSpeechMultilingualInput,
  zChatterboxTextToSpeechMultilingualOutput,
  zChatterboxTextToSpeechOutput,
  zChatterboxhdSpeechToSpeechInput,
  zChatterboxhdSpeechToSpeechOutput,
  zChatterboxhdTextToSpeechInput,
  zChatterboxhdTextToSpeechOutput,
  zCohereTranscribeInput,
  zCohereTranscribeOutput,
  zCsm1bInput,
  zCsm1bOutput,
  zDeepfilternet3Input,
  zDeepfilternet3Output,
  zDemucsInput,
  zDemucsOutput,
  zDiaTtsInput,
  zDiaTtsOutput,
  zDiaTtsVoiceCloneInput,
  zDiaTtsVoiceCloneOutput,
  zDiffrhythmInput,
  zDiffrhythmOutput,
  zElevenlabsAudioIsolationInput,
  zElevenlabsAudioIsolationOutput,
  zElevenlabsMusicInput,
  zElevenlabsMusicOutput,
  zElevenlabsSoundEffectsV2Input,
  zElevenlabsSoundEffectsV2Output,
  zElevenlabsSpeechToTextInput,
  zElevenlabsSpeechToTextOutput,
  zElevenlabsSpeechToTextScribeV2Input,
  zElevenlabsSpeechToTextScribeV2Output,
  zElevenlabsTextToDialogueElevenV3Input,
  zElevenlabsTextToDialogueElevenV3Output,
  zElevenlabsTtsElevenV3Input,
  zElevenlabsTtsElevenV3Output,
  zElevenlabsTtsMultilingualV2Input,
  zElevenlabsTtsMultilingualV2Output,
  zElevenlabsTtsTurboV25Input,
  zElevenlabsTtsTurboV25Output,
  zElevenlabsVoiceChangerInput,
  zElevenlabsVoiceChangerOutput,
  zF5TtsInput,
  zF5TtsOutput,
  zFfmpegApiMergeAudiosInput,
  zFfmpegApiMergeAudiosOutput,
  zGemini31FlashTtsInput,
  zGemini31FlashTtsOutput,
  zGeminiTtsInput,
  zGeminiTtsOutput,
  zIndexTts2TextToSpeechInput,
  zIndexTts2TextToSpeechOutput,
  zInworldTtsInput,
  zInworldTtsOutput,
  zKlingVideoCreateVoiceInput,
  zKlingVideoCreateVoiceOutput,
  zKlingVideoV1TtsInput,
  zKlingVideoV1TtsOutput,
  zKlingVideoVideoToAudioInput,
  zKlingVideoVideoToAudioOutput,
  zKokoroAmericanEnglishInput,
  zKokoroAmericanEnglishOutput,
  zKokoroBrazilianPortugueseInput,
  zKokoroBrazilianPortugueseOutput,
  zKokoroBritishEnglishInput,
  zKokoroBritishEnglishOutput,
  zKokoroFrenchInput,
  zKokoroFrenchOutput,
  zKokoroHindiInput,
  zKokoroHindiOutput,
  zKokoroItalianInput,
  zKokoroItalianOutput,
  zKokoroJapaneseInput,
  zKokoroJapaneseOutput,
  zKokoroMandarinChineseInput,
  zKokoroMandarinChineseOutput,
  zKokoroSpanishInput,
  zKokoroSpanishOutput,
  zLyria2Input,
  zLyria2Output,
  zLyria3Input,
  zLyria3Output,
  zLyria3ProInput,
  zLyria3ProOutput,
  zMayaBatchInput,
  zMayaBatchOutput,
  zMayaInput,
  zMayaOutput,
  zMayaStreamInput,
  zMayaStreamOutput,
  zMinimaxMusicInput,
  zMinimaxMusicOutput,
  zMinimaxMusicV15Input,
  zMinimaxMusicV15Output,
  zMinimaxMusicV25Input,
  zMinimaxMusicV25Output,
  zMinimaxMusicV26Input,
  zMinimaxMusicV26Output,
  zMinimaxMusicV2Input,
  zMinimaxMusicV2Output,
  zMinimaxPreviewSpeech25HdInput,
  zMinimaxPreviewSpeech25HdOutput,
  zMinimaxPreviewSpeech25TurboInput,
  zMinimaxPreviewSpeech25TurboOutput,
  zMinimaxSpeech02HdInput,
  zMinimaxSpeech02HdOutput,
  zMinimaxSpeech02TurboInput,
  zMinimaxSpeech02TurboOutput,
  zMinimaxSpeech26HdInput,
  zMinimaxSpeech26HdOutput,
  zMinimaxSpeech26TurboInput,
  zMinimaxSpeech26TurboOutput,
  zMinimaxSpeech28HdInput,
  zMinimaxSpeech28HdOutput,
  zMinimaxSpeech28TurboInput,
  zMinimaxSpeech28TurboOutput,
  zMinimaxVoiceCloneInput,
  zMinimaxVoiceCloneOutput,
  zMinimaxVoiceDesignInput,
  zMinimaxVoiceDesignOutput,
  zMmaudioV2TextToAudioInput,
  zMmaudioV2TextToAudioOutput,
  zMusicGeneratorInput,
  zMusicGeneratorOutput,
  zNemotron3NanoOmniAudioInput,
  zNemotron3NanoOmniAudioOutput,
  zNemotronAsrMultilingualAsrInput,
  zNemotronAsrMultilingualAsrOutput,
  zOrpheusTtsInput,
  zOrpheusTtsOutput,
  zQwen3TtsCloneVoice06bInput,
  zQwen3TtsCloneVoice06bOutput,
  zQwen3TtsCloneVoice17bInput,
  zQwen3TtsCloneVoice17bOutput,
  zQwen3TtsTextToSpeech06bInput,
  zQwen3TtsTextToSpeech06bOutput,
  zQwen3TtsTextToSpeech17bInput,
  zQwen3TtsTextToSpeech17bOutput,
  zQwen3TtsVoiceDesign17bInput,
  zQwen3TtsVoiceDesign17bOutput,
  zSamAudioSeparateInput,
  zSamAudioSeparateOutput,
  zSamAudioSpanSeparateInput,
  zSamAudioSpanSeparateOutput,
  zSamAudioVisualSeparateInput,
  zSamAudioVisualSeparateOutput,
  zSfx16ExtendAudioInput,
  zSfx16ExtendAudioOutput,
  zSfx16InpaintAudioInput,
  zSfx16InpaintAudioOutput,
  zSfx16TextToAudioInput,
  zSfx16TextToAudioOutput,
  zSfxV15VideoToAudioInput,
  zSfxV15VideoToAudioOutput,
  zSfxV1VideoToAudioInput,
  zSfxV1VideoToAudioOutput,
  zSileroVadInput,
  zSileroVadOutput,
  zSmartTurnInput,
  zSmartTurnOutput,
  zSoundEffectsGeneratorInput,
  zSoundEffectsGeneratorOutput,
  zSpeechToTextInput,
  zSpeechToTextOutput,
  zSpeechToTextStreamInput,
  zSpeechToTextStreamOutput,
  zSpeechToTextTurboInput,
  zSpeechToTextTurboOutput,
  zSpeechToTextTurboStreamInput,
  zSpeechToTextTurboStreamOutput,
  zStableAudio25AudioToAudioInput,
  zStableAudio25AudioToAudioOutput,
  zStableAudio25InpaintInput,
  zStableAudio25InpaintOutput,
  zStableAudio25TextToAudioInput,
  zStableAudio25TextToAudioOutput,
  zStableAudio3MediumAudioInpaintingInput,
  zStableAudio3MediumAudioInpaintingOutput,
  zStableAudio3MediumAudioOutpaintingInput,
  zStableAudio3MediumAudioOutpaintingOutput,
  zStableAudio3MediumAudioToAudioInput,
  zStableAudio3MediumAudioToAudioOutput,
  zStableAudio3MediumBaseAudioInpaintingInput,
  zStableAudio3MediumBaseAudioInpaintingOutput,
  zStableAudio3MediumBaseAudioOutpaintingInput,
  zStableAudio3MediumBaseAudioOutpaintingOutput,
  zStableAudio3MediumBaseAudioToAudioInput,
  zStableAudio3MediumBaseAudioToAudioOutput,
  zStableAudio3MediumBaseTextToAudioInput,
  zStableAudio3MediumBaseTextToAudioOutput,
  zStableAudio3MediumTextToAudioInput,
  zStableAudio3MediumTextToAudioOutput,
  zStableAudio3SmallMusicAudioInpaintingInput,
  zStableAudio3SmallMusicAudioInpaintingOutput,
  zStableAudio3SmallMusicAudioOutpaintingInput,
  zStableAudio3SmallMusicAudioOutpaintingOutput,
  zStableAudio3SmallMusicAudioToAudioInput,
  zStableAudio3SmallMusicAudioToAudioOutput,
  zStableAudio3SmallMusicBaseAudioInpaintingInput,
  zStableAudio3SmallMusicBaseAudioInpaintingOutput,
  zStableAudio3SmallMusicBaseAudioOutpaintingInput,
  zStableAudio3SmallMusicBaseAudioOutpaintingOutput,
  zStableAudio3SmallMusicBaseAudioToAudioInput,
  zStableAudio3SmallMusicBaseAudioToAudioOutput,
  zStableAudio3SmallMusicBaseTextToAudioInput,
  zStableAudio3SmallMusicBaseTextToAudioOutput,
  zStableAudio3SmallMusicTextToAudioInput,
  zStableAudio3SmallMusicTextToAudioOutput,
  zStableAudio3SmallSfxAudioInpaintingInput,
  zStableAudio3SmallSfxAudioInpaintingOutput,
  zStableAudio3SmallSfxAudioOutpaintingInput,
  zStableAudio3SmallSfxAudioOutpaintingOutput,
  zStableAudio3SmallSfxAudioToAudioInput,
  zStableAudio3SmallSfxAudioToAudioOutput,
  zStableAudio3SmallSfxBaseAudioInpaintingInput,
  zStableAudio3SmallSfxBaseAudioInpaintingOutput,
  zStableAudio3SmallSfxBaseAudioOutpaintingInput,
  zStableAudio3SmallSfxBaseAudioOutpaintingOutput,
  zStableAudio3SmallSfxBaseAudioToAudioInput,
  zStableAudio3SmallSfxBaseAudioToAudioOutput,
  zStableAudio3SmallSfxBaseTextToAudioInput,
  zStableAudio3SmallSfxBaseTextToAudioOutput,
  zStableAudio3SmallSfxTextToAudioInput,
  zStableAudio3SmallSfxTextToAudioOutput,
  zStableAudioInput,
  zStableAudioOutput,
  zTada1bTextToSpeechInput,
  zTada1bTextToSpeechOutput,
  zTada3bTextToSpeechInput,
  zTada3bTextToSpeechOutput,
  zTtsV1Input,
  zTtsV1Output,
  zV11TextToMusicInput,
  zV11TextToMusicOutput,
  zV11VideoToMusicInput,
  zV11VideoToMusicOutput,
  zVibevoice05bInput,
  zVibevoice05bOutput,
  zVibevoice7bInput,
  zVibevoice7bOutput,
  zVibevoiceInput,
  zVibevoiceOutput,
  zWizperInput,
  zWizperOutput,
  zWorkflowUtilitiesAudioCompressorInput,
  zWorkflowUtilitiesAudioCompressorOutput,
  zWorkflowUtilitiesImpulseResponseInput,
  zWorkflowUtilitiesImpulseResponseOutput,
  zZonosInput,
  zZonosOutput,
} from './zod.gen.js'

/**
 * Map of fal-audio endpoint id -> Zod input/output schemas.
 * Entries without `output` stream binary media (audio/video) rather
 * than returning JSON.
 */
export const falAudioEndpointZodMap: {
  readonly 'cassetteai/music-generator': {
    readonly input: typeof zMusicGeneratorInput
    readonly output: typeof zMusicGeneratorOutput
  }
  readonly 'cassetteai/sound-effects-generator': {
    readonly input: typeof zSoundEffectsGeneratorInput
    readonly output: typeof zSoundEffectsGeneratorOutput
  }
  readonly 'fal-ai/ace-step': {
    readonly input: typeof zAceStepInput
    readonly output: typeof zAceStepOutput
  }
  readonly 'fal-ai/ace-step/audio-inpaint': {
    readonly input: typeof zAceStepAudioInpaintInput
    readonly output: typeof zAceStepAudioInpaintOutput
  }
  readonly 'fal-ai/ace-step/audio-outpaint': {
    readonly input: typeof zAceStepAudioOutpaintInput
    readonly output: typeof zAceStepAudioOutpaintOutput
  }
  readonly 'fal-ai/ace-step/audio-to-audio': {
    readonly input: typeof zAceStepAudioToAudioInput
    readonly output: typeof zAceStepAudioToAudioOutput
  }
  readonly 'fal-ai/ace-step/prompt-to-audio': {
    readonly input: typeof zAceStepPromptToAudioInput
    readonly output: typeof zAceStepPromptToAudioOutput
  }
  readonly 'fal-ai/audio-understanding': {
    readonly input: typeof zAudioUnderstandingInput
    readonly output: typeof zAudioUnderstandingOutput
  }
  readonly 'fal-ai/bytedance/seed-speech/tts/v2': {
    readonly input: typeof zBytedanceSeedSpeechTtsV2Input
    readonly output: typeof zBytedanceSeedSpeechTtsV2Output
  }
  readonly 'fal-ai/chatterbox/speech-to-speech': {
    readonly input: typeof zChatterboxSpeechToSpeechInput
    readonly output: typeof zChatterboxSpeechToSpeechOutput
  }
  readonly 'fal-ai/chatterbox/text-to-speech': {
    readonly input: typeof zChatterboxTextToSpeechInput
    readonly output: typeof zChatterboxTextToSpeechOutput
  }
  readonly 'fal-ai/chatterbox/text-to-speech/multilingual': {
    readonly input: typeof zChatterboxTextToSpeechMultilingualInput
    readonly output: typeof zChatterboxTextToSpeechMultilingualOutput
  }
  readonly 'fal-ai/cohere-transcribe': {
    readonly input: typeof zCohereTranscribeInput
    readonly output: typeof zCohereTranscribeOutput
  }
  readonly 'fal-ai/csm-1b': {
    readonly input: typeof zCsm1bInput
    readonly output: typeof zCsm1bOutput
  }
  readonly 'fal-ai/deepfilternet3': {
    readonly input: typeof zDeepfilternet3Input
    readonly output: typeof zDeepfilternet3Output
  }
  readonly 'fal-ai/demucs': {
    readonly input: typeof zDemucsInput
    readonly output: typeof zDemucsOutput
  }
  readonly 'fal-ai/dia-tts': {
    readonly input: typeof zDiaTtsInput
    readonly output: typeof zDiaTtsOutput
  }
  readonly 'fal-ai/dia-tts/voice-clone': {
    readonly input: typeof zDiaTtsVoiceCloneInput
    readonly output: typeof zDiaTtsVoiceCloneOutput
  }
  readonly 'fal-ai/diffrhythm': {
    readonly input: typeof zDiffrhythmInput
    readonly output: typeof zDiffrhythmOutput
  }
  readonly 'fal-ai/elevenlabs/audio-isolation': {
    readonly input: typeof zElevenlabsAudioIsolationInput
    readonly output: typeof zElevenlabsAudioIsolationOutput
  }
  readonly 'fal-ai/elevenlabs/music': {
    readonly input: typeof zElevenlabsMusicInput
    readonly output: typeof zElevenlabsMusicOutput
  }
  readonly 'fal-ai/elevenlabs/sound-effects/v2': {
    readonly input: typeof zElevenlabsSoundEffectsV2Input
    readonly output: typeof zElevenlabsSoundEffectsV2Output
  }
  readonly 'fal-ai/elevenlabs/speech-to-text': {
    readonly input: typeof zElevenlabsSpeechToTextInput
    readonly output: typeof zElevenlabsSpeechToTextOutput
  }
  readonly 'fal-ai/elevenlabs/speech-to-text/scribe-v2': {
    readonly input: typeof zElevenlabsSpeechToTextScribeV2Input
    readonly output: typeof zElevenlabsSpeechToTextScribeV2Output
  }
  readonly 'fal-ai/elevenlabs/text-to-dialogue/eleven-v3': {
    readonly input: typeof zElevenlabsTextToDialogueElevenV3Input
    readonly output: typeof zElevenlabsTextToDialogueElevenV3Output
  }
  readonly 'fal-ai/elevenlabs/tts/eleven-v3': {
    readonly input: typeof zElevenlabsTtsElevenV3Input
    readonly output: typeof zElevenlabsTtsElevenV3Output
  }
  readonly 'fal-ai/elevenlabs/tts/multilingual-v2': {
    readonly input: typeof zElevenlabsTtsMultilingualV2Input
    readonly output: typeof zElevenlabsTtsMultilingualV2Output
  }
  readonly 'fal-ai/elevenlabs/tts/turbo-v2.5': {
    readonly input: typeof zElevenlabsTtsTurboV25Input
    readonly output: typeof zElevenlabsTtsTurboV25Output
  }
  readonly 'fal-ai/elevenlabs/voice-changer': {
    readonly input: typeof zElevenlabsVoiceChangerInput
    readonly output: typeof zElevenlabsVoiceChangerOutput
  }
  readonly 'fal-ai/f5-tts': {
    readonly input: typeof zF5TtsInput
    readonly output: typeof zF5TtsOutput
  }
  readonly 'fal-ai/ffmpeg-api/merge-audios': {
    readonly input: typeof zFfmpegApiMergeAudiosInput
    readonly output: typeof zFfmpegApiMergeAudiosOutput
  }
  readonly 'fal-ai/gemini-3.1-flash-tts': {
    readonly input: typeof zGemini31FlashTtsInput
    readonly output: typeof zGemini31FlashTtsOutput
  }
  readonly 'fal-ai/gemini-tts': {
    readonly input: typeof zGeminiTtsInput
    readonly output: typeof zGeminiTtsOutput
  }
  readonly 'fal-ai/index-tts-2/text-to-speech': {
    readonly input: typeof zIndexTts2TextToSpeechInput
    readonly output: typeof zIndexTts2TextToSpeechOutput
  }
  readonly 'fal-ai/inworld-tts': {
    readonly input: typeof zInworldTtsInput
    readonly output: typeof zInworldTtsOutput
  }
  readonly 'fal-ai/kling-video/create-voice': {
    readonly input: typeof zKlingVideoCreateVoiceInput
    readonly output: typeof zKlingVideoCreateVoiceOutput
  }
  readonly 'fal-ai/kling-video/v1/tts': {
    readonly input: typeof zKlingVideoV1TtsInput
    readonly output: typeof zKlingVideoV1TtsOutput
  }
  readonly 'fal-ai/kling-video/video-to-audio': {
    readonly input: typeof zKlingVideoVideoToAudioInput
    readonly output: typeof zKlingVideoVideoToAudioOutput
  }
  readonly 'fal-ai/kokoro/american-english': {
    readonly input: typeof zKokoroAmericanEnglishInput
    readonly output: typeof zKokoroAmericanEnglishOutput
  }
  readonly 'fal-ai/kokoro/brazilian-portuguese': {
    readonly input: typeof zKokoroBrazilianPortugueseInput
    readonly output: typeof zKokoroBrazilianPortugueseOutput
  }
  readonly 'fal-ai/kokoro/british-english': {
    readonly input: typeof zKokoroBritishEnglishInput
    readonly output: typeof zKokoroBritishEnglishOutput
  }
  readonly 'fal-ai/kokoro/french': {
    readonly input: typeof zKokoroFrenchInput
    readonly output: typeof zKokoroFrenchOutput
  }
  readonly 'fal-ai/kokoro/hindi': {
    readonly input: typeof zKokoroHindiInput
    readonly output: typeof zKokoroHindiOutput
  }
  readonly 'fal-ai/kokoro/italian': {
    readonly input: typeof zKokoroItalianInput
    readonly output: typeof zKokoroItalianOutput
  }
  readonly 'fal-ai/kokoro/japanese': {
    readonly input: typeof zKokoroJapaneseInput
    readonly output: typeof zKokoroJapaneseOutput
  }
  readonly 'fal-ai/kokoro/mandarin-chinese': {
    readonly input: typeof zKokoroMandarinChineseInput
    readonly output: typeof zKokoroMandarinChineseOutput
  }
  readonly 'fal-ai/kokoro/spanish': {
    readonly input: typeof zKokoroSpanishInput
    readonly output: typeof zKokoroSpanishOutput
  }
  readonly 'fal-ai/lyria2': {
    readonly input: typeof zLyria2Input
    readonly output: typeof zLyria2Output
  }
  readonly 'fal-ai/lyria3': {
    readonly input: typeof zLyria3Input
    readonly output: typeof zLyria3Output
  }
  readonly 'fal-ai/lyria3/pro': {
    readonly input: typeof zLyria3ProInput
    readonly output: typeof zLyria3ProOutput
  }
  readonly 'fal-ai/maya': {
    readonly input: typeof zMayaInput
    readonly output: typeof zMayaOutput
  }
  readonly 'fal-ai/maya/batch': {
    readonly input: typeof zMayaBatchInput
    readonly output: typeof zMayaBatchOutput
  }
  readonly 'fal-ai/maya/stream': {
    readonly input: typeof zMayaStreamInput
    readonly output: typeof zMayaStreamOutput
  }
  readonly 'fal-ai/minimax-music': {
    readonly input: typeof zMinimaxMusicInput
    readonly output: typeof zMinimaxMusicOutput
  }
  readonly 'fal-ai/minimax-music/v1.5': {
    readonly input: typeof zMinimaxMusicV15Input
    readonly output: typeof zMinimaxMusicV15Output
  }
  readonly 'fal-ai/minimax-music/v2': {
    readonly input: typeof zMinimaxMusicV2Input
    readonly output: typeof zMinimaxMusicV2Output
  }
  readonly 'fal-ai/minimax-music/v2.5': {
    readonly input: typeof zMinimaxMusicV25Input
    readonly output: typeof zMinimaxMusicV25Output
  }
  readonly 'fal-ai/minimax-music/v2.6': {
    readonly input: typeof zMinimaxMusicV26Input
    readonly output: typeof zMinimaxMusicV26Output
  }
  readonly 'fal-ai/minimax/preview/speech-2.5-hd': {
    readonly input: typeof zMinimaxPreviewSpeech25HdInput
    readonly output: typeof zMinimaxPreviewSpeech25HdOutput
  }
  readonly 'fal-ai/minimax/preview/speech-2.5-turbo': {
    readonly input: typeof zMinimaxPreviewSpeech25TurboInput
    readonly output: typeof zMinimaxPreviewSpeech25TurboOutput
  }
  readonly 'fal-ai/minimax/speech-02-hd': {
    readonly input: typeof zMinimaxSpeech02HdInput
    readonly output: typeof zMinimaxSpeech02HdOutput
  }
  readonly 'fal-ai/minimax/speech-02-turbo': {
    readonly input: typeof zMinimaxSpeech02TurboInput
    readonly output: typeof zMinimaxSpeech02TurboOutput
  }
  readonly 'fal-ai/minimax/speech-2.6-hd': {
    readonly input: typeof zMinimaxSpeech26HdInput
    readonly output: typeof zMinimaxSpeech26HdOutput
  }
  readonly 'fal-ai/minimax/speech-2.6-turbo': {
    readonly input: typeof zMinimaxSpeech26TurboInput
    readonly output: typeof zMinimaxSpeech26TurboOutput
  }
  readonly 'fal-ai/minimax/speech-2.8-hd': {
    readonly input: typeof zMinimaxSpeech28HdInput
    readonly output: typeof zMinimaxSpeech28HdOutput
  }
  readonly 'fal-ai/minimax/speech-2.8-turbo': {
    readonly input: typeof zMinimaxSpeech28TurboInput
    readonly output: typeof zMinimaxSpeech28TurboOutput
  }
  readonly 'fal-ai/minimax/voice-clone': {
    readonly input: typeof zMinimaxVoiceCloneInput
    readonly output: typeof zMinimaxVoiceCloneOutput
  }
  readonly 'fal-ai/minimax/voice-design': {
    readonly input: typeof zMinimaxVoiceDesignInput
    readonly output: typeof zMinimaxVoiceDesignOutput
  }
  readonly 'fal-ai/mmaudio-v2/text-to-audio': {
    readonly input: typeof zMmaudioV2TextToAudioInput
    readonly output: typeof zMmaudioV2TextToAudioOutput
  }
  readonly 'fal-ai/orpheus-tts': {
    readonly input: typeof zOrpheusTtsInput
    readonly output: typeof zOrpheusTtsOutput
  }
  readonly 'fal-ai/qwen-3-tts/clone-voice/0.6b': {
    readonly input: typeof zQwen3TtsCloneVoice06bInput
    readonly output: typeof zQwen3TtsCloneVoice06bOutput
  }
  readonly 'fal-ai/qwen-3-tts/clone-voice/1.7b': {
    readonly input: typeof zQwen3TtsCloneVoice17bInput
    readonly output: typeof zQwen3TtsCloneVoice17bOutput
  }
  readonly 'fal-ai/qwen-3-tts/text-to-speech/0.6b': {
    readonly input: typeof zQwen3TtsTextToSpeech06bInput
    readonly output: typeof zQwen3TtsTextToSpeech06bOutput
  }
  readonly 'fal-ai/qwen-3-tts/text-to-speech/1.7b': {
    readonly input: typeof zQwen3TtsTextToSpeech17bInput
    readonly output: typeof zQwen3TtsTextToSpeech17bOutput
  }
  readonly 'fal-ai/qwen-3-tts/voice-design/1.7b': {
    readonly input: typeof zQwen3TtsVoiceDesign17bInput
    readonly output: typeof zQwen3TtsVoiceDesign17bOutput
  }
  readonly 'fal-ai/sam-audio/separate': {
    readonly input: typeof zSamAudioSeparateInput
    readonly output: typeof zSamAudioSeparateOutput
  }
  readonly 'fal-ai/sam-audio/span-separate': {
    readonly input: typeof zSamAudioSpanSeparateInput
    readonly output: typeof zSamAudioSpanSeparateOutput
  }
  readonly 'fal-ai/sam-audio/visual-separate': {
    readonly input: typeof zSamAudioVisualSeparateInput
    readonly output: typeof zSamAudioVisualSeparateOutput
  }
  readonly 'fal-ai/silero-vad': {
    readonly input: typeof zSileroVadInput
    readonly output: typeof zSileroVadOutput
  }
  readonly 'fal-ai/smart-turn': {
    readonly input: typeof zSmartTurnInput
    readonly output: typeof zSmartTurnOutput
  }
  readonly 'fal-ai/speech-to-text': {
    readonly input: typeof zSpeechToTextInput
    readonly output: typeof zSpeechToTextOutput
  }
  readonly 'fal-ai/speech-to-text/stream': {
    readonly input: typeof zSpeechToTextStreamInput
    readonly output: typeof zSpeechToTextStreamOutput
  }
  readonly 'fal-ai/speech-to-text/turbo': {
    readonly input: typeof zSpeechToTextTurboInput
    readonly output: typeof zSpeechToTextTurboOutput
  }
  readonly 'fal-ai/speech-to-text/turbo/stream': {
    readonly input: typeof zSpeechToTextTurboStreamInput
    readonly output: typeof zSpeechToTextTurboStreamOutput
  }
  readonly 'fal-ai/stable-audio': {
    readonly input: typeof zStableAudioInput
    readonly output: typeof zStableAudioOutput
  }
  readonly 'fal-ai/stable-audio-25/audio-to-audio': {
    readonly input: typeof zStableAudio25AudioToAudioInput
    readonly output: typeof zStableAudio25AudioToAudioOutput
  }
  readonly 'fal-ai/stable-audio-25/inpaint': {
    readonly input: typeof zStableAudio25InpaintInput
    readonly output: typeof zStableAudio25InpaintOutput
  }
  readonly 'fal-ai/stable-audio-25/text-to-audio': {
    readonly input: typeof zStableAudio25TextToAudioInput
    readonly output: typeof zStableAudio25TextToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/medium/audio-inpainting': {
    readonly input: typeof zStableAudio3MediumAudioInpaintingInput
    readonly output: typeof zStableAudio3MediumAudioInpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/medium/audio-outpainting': {
    readonly input: typeof zStableAudio3MediumAudioOutpaintingInput
    readonly output: typeof zStableAudio3MediumAudioOutpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/medium/audio-to-audio': {
    readonly input: typeof zStableAudio3MediumAudioToAudioInput
    readonly output: typeof zStableAudio3MediumAudioToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/medium/base/audio-inpainting': {
    readonly input: typeof zStableAudio3MediumBaseAudioInpaintingInput
    readonly output: typeof zStableAudio3MediumBaseAudioInpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/medium/base/audio-outpainting': {
    readonly input: typeof zStableAudio3MediumBaseAudioOutpaintingInput
    readonly output: typeof zStableAudio3MediumBaseAudioOutpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/medium/base/audio-to-audio': {
    readonly input: typeof zStableAudio3MediumBaseAudioToAudioInput
    readonly output: typeof zStableAudio3MediumBaseAudioToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/medium/base/text-to-audio': {
    readonly input: typeof zStableAudio3MediumBaseTextToAudioInput
    readonly output: typeof zStableAudio3MediumBaseTextToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/medium/text-to-audio': {
    readonly input: typeof zStableAudio3MediumTextToAudioInput
    readonly output: typeof zStableAudio3MediumTextToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/small/music/audio-inpainting': {
    readonly input: typeof zStableAudio3SmallMusicAudioInpaintingInput
    readonly output: typeof zStableAudio3SmallMusicAudioInpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/small/music/audio-outpainting': {
    readonly input: typeof zStableAudio3SmallMusicAudioOutpaintingInput
    readonly output: typeof zStableAudio3SmallMusicAudioOutpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/small/music/audio-to-audio': {
    readonly input: typeof zStableAudio3SmallMusicAudioToAudioInput
    readonly output: typeof zStableAudio3SmallMusicAudioToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/small/music/base/audio-inpainting': {
    readonly input: typeof zStableAudio3SmallMusicBaseAudioInpaintingInput
    readonly output: typeof zStableAudio3SmallMusicBaseAudioInpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/small/music/base/audio-outpainting': {
    readonly input: typeof zStableAudio3SmallMusicBaseAudioOutpaintingInput
    readonly output: typeof zStableAudio3SmallMusicBaseAudioOutpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/small/music/base/audio-to-audio': {
    readonly input: typeof zStableAudio3SmallMusicBaseAudioToAudioInput
    readonly output: typeof zStableAudio3SmallMusicBaseAudioToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/small/music/base/text-to-audio': {
    readonly input: typeof zStableAudio3SmallMusicBaseTextToAudioInput
    readonly output: typeof zStableAudio3SmallMusicBaseTextToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/small/music/text-to-audio': {
    readonly input: typeof zStableAudio3SmallMusicTextToAudioInput
    readonly output: typeof zStableAudio3SmallMusicTextToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/small/sfx/audio-inpainting': {
    readonly input: typeof zStableAudio3SmallSfxAudioInpaintingInput
    readonly output: typeof zStableAudio3SmallSfxAudioInpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/small/sfx/audio-outpainting': {
    readonly input: typeof zStableAudio3SmallSfxAudioOutpaintingInput
    readonly output: typeof zStableAudio3SmallSfxAudioOutpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/small/sfx/audio-to-audio': {
    readonly input: typeof zStableAudio3SmallSfxAudioToAudioInput
    readonly output: typeof zStableAudio3SmallSfxAudioToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/small/sfx/base/audio-inpainting': {
    readonly input: typeof zStableAudio3SmallSfxBaseAudioInpaintingInput
    readonly output: typeof zStableAudio3SmallSfxBaseAudioInpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/small/sfx/base/audio-outpainting': {
    readonly input: typeof zStableAudio3SmallSfxBaseAudioOutpaintingInput
    readonly output: typeof zStableAudio3SmallSfxBaseAudioOutpaintingOutput
  }
  readonly 'fal-ai/stable-audio-3/small/sfx/base/audio-to-audio': {
    readonly input: typeof zStableAudio3SmallSfxBaseAudioToAudioInput
    readonly output: typeof zStableAudio3SmallSfxBaseAudioToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/small/sfx/base/text-to-audio': {
    readonly input: typeof zStableAudio3SmallSfxBaseTextToAudioInput
    readonly output: typeof zStableAudio3SmallSfxBaseTextToAudioOutput
  }
  readonly 'fal-ai/stable-audio-3/small/sfx/text-to-audio': {
    readonly input: typeof zStableAudio3SmallSfxTextToAudioInput
    readonly output: typeof zStableAudio3SmallSfxTextToAudioOutput
  }
  readonly 'fal-ai/tada/1b/text-to-speech': {
    readonly input: typeof zTada1bTextToSpeechInput
    readonly output: typeof zTada1bTextToSpeechOutput
  }
  readonly 'fal-ai/tada/3b/text-to-speech': {
    readonly input: typeof zTada3bTextToSpeechInput
    readonly output: typeof zTada3bTextToSpeechOutput
  }
  readonly 'fal-ai/vibevoice': {
    readonly input: typeof zVibevoiceInput
    readonly output: typeof zVibevoiceOutput
  }
  readonly 'fal-ai/vibevoice/0.5b': {
    readonly input: typeof zVibevoice05bInput
    readonly output: typeof zVibevoice05bOutput
  }
  readonly 'fal-ai/vibevoice/7b': {
    readonly input: typeof zVibevoice7bInput
    readonly output: typeof zVibevoice7bOutput
  }
  readonly 'fal-ai/wizper': {
    readonly input: typeof zWizperInput
    readonly output: typeof zWizperOutput
  }
  readonly 'fal-ai/workflow-utilities/audio-compressor': {
    readonly input: typeof zWorkflowUtilitiesAudioCompressorInput
    readonly output: typeof zWorkflowUtilitiesAudioCompressorOutput
  }
  readonly 'fal-ai/workflow-utilities/impulse-response': {
    readonly input: typeof zWorkflowUtilitiesImpulseResponseInput
    readonly output: typeof zWorkflowUtilitiesImpulseResponseOutput
  }
  readonly 'fal-ai/zonos': {
    readonly input: typeof zZonosInput
    readonly output: typeof zZonosOutput
  }
  readonly 'mirelo-ai/sfx-v1.5/video-to-audio': {
    readonly input: typeof zSfxV15VideoToAudioInput
    readonly output: typeof zSfxV15VideoToAudioOutput
  }
  readonly 'mirelo-ai/sfx-v1/video-to-audio': {
    readonly input: typeof zSfxV1VideoToAudioInput
    readonly output: typeof zSfxV1VideoToAudioOutput
  }
  readonly 'mirelo-ai/sfx1.6/extend-audio': {
    readonly input: typeof zSfx16ExtendAudioInput
    readonly output: typeof zSfx16ExtendAudioOutput
  }
  readonly 'mirelo-ai/sfx1.6/inpaint-audio': {
    readonly input: typeof zSfx16InpaintAudioInput
    readonly output: typeof zSfx16InpaintAudioOutput
  }
  readonly 'mirelo-ai/sfx1.6/text-to-audio': {
    readonly input: typeof zSfx16TextToAudioInput
    readonly output: typeof zSfx16TextToAudioOutput
  }
  readonly 'nvidia/nemotron-3-nano-omni/audio': {
    readonly input: typeof zNemotron3NanoOmniAudioInput
    readonly output: typeof zNemotron3NanoOmniAudioOutput
  }
  readonly 'nvidia/nemotron-asr-multilingual/asr': {
    readonly input: typeof zNemotronAsrMultilingualAsrInput
    readonly output: typeof zNemotronAsrMultilingualAsrOutput
  }
  readonly 'resemble-ai/chatterboxhd/speech-to-speech': {
    readonly input: typeof zChatterboxhdSpeechToSpeechInput
    readonly output: typeof zChatterboxhdSpeechToSpeechOutput
  }
  readonly 'resemble-ai/chatterboxhd/text-to-speech': {
    readonly input: typeof zChatterboxhdTextToSpeechInput
    readonly output: typeof zChatterboxhdTextToSpeechOutput
  }
  readonly 'sonilo/v1.1/text-to-music': {
    readonly input: typeof zV11TextToMusicInput
    readonly output: typeof zV11TextToMusicOutput
  }
  readonly 'sonilo/v1.1/video-to-music': {
    readonly input: typeof zV11VideoToMusicInput
    readonly output: typeof zV11VideoToMusicOutput
  }
  readonly 'xai/tts/v1': {
    readonly input: typeof zTtsV1Input
    readonly output: typeof zTtsV1Output
  }
} = {
  'cassetteai/music-generator': {
    input: zMusicGeneratorInput,
    output: zMusicGeneratorOutput,
  },
  'cassetteai/sound-effects-generator': {
    input: zSoundEffectsGeneratorInput,
    output: zSoundEffectsGeneratorOutput,
  },
  'fal-ai/ace-step': { input: zAceStepInput, output: zAceStepOutput },
  'fal-ai/ace-step/audio-inpaint': {
    input: zAceStepAudioInpaintInput,
    output: zAceStepAudioInpaintOutput,
  },
  'fal-ai/ace-step/audio-outpaint': {
    input: zAceStepAudioOutpaintInput,
    output: zAceStepAudioOutpaintOutput,
  },
  'fal-ai/ace-step/audio-to-audio': {
    input: zAceStepAudioToAudioInput,
    output: zAceStepAudioToAudioOutput,
  },
  'fal-ai/ace-step/prompt-to-audio': {
    input: zAceStepPromptToAudioInput,
    output: zAceStepPromptToAudioOutput,
  },
  'fal-ai/audio-understanding': {
    input: zAudioUnderstandingInput,
    output: zAudioUnderstandingOutput,
  },
  'fal-ai/bytedance/seed-speech/tts/v2': {
    input: zBytedanceSeedSpeechTtsV2Input,
    output: zBytedanceSeedSpeechTtsV2Output,
  },
  'fal-ai/chatterbox/speech-to-speech': {
    input: zChatterboxSpeechToSpeechInput,
    output: zChatterboxSpeechToSpeechOutput,
  },
  'fal-ai/chatterbox/text-to-speech': {
    input: zChatterboxTextToSpeechInput,
    output: zChatterboxTextToSpeechOutput,
  },
  'fal-ai/chatterbox/text-to-speech/multilingual': {
    input: zChatterboxTextToSpeechMultilingualInput,
    output: zChatterboxTextToSpeechMultilingualOutput,
  },
  'fal-ai/cohere-transcribe': {
    input: zCohereTranscribeInput,
    output: zCohereTranscribeOutput,
  },
  'fal-ai/csm-1b': { input: zCsm1bInput, output: zCsm1bOutput },
  'fal-ai/deepfilternet3': {
    input: zDeepfilternet3Input,
    output: zDeepfilternet3Output,
  },
  'fal-ai/demucs': { input: zDemucsInput, output: zDemucsOutput },
  'fal-ai/dia-tts': { input: zDiaTtsInput, output: zDiaTtsOutput },
  'fal-ai/dia-tts/voice-clone': {
    input: zDiaTtsVoiceCloneInput,
    output: zDiaTtsVoiceCloneOutput,
  },
  'fal-ai/diffrhythm': { input: zDiffrhythmInput, output: zDiffrhythmOutput },
  'fal-ai/elevenlabs/audio-isolation': {
    input: zElevenlabsAudioIsolationInput,
    output: zElevenlabsAudioIsolationOutput,
  },
  'fal-ai/elevenlabs/music': {
    input: zElevenlabsMusicInput,
    output: zElevenlabsMusicOutput,
  },
  'fal-ai/elevenlabs/sound-effects/v2': {
    input: zElevenlabsSoundEffectsV2Input,
    output: zElevenlabsSoundEffectsV2Output,
  },
  'fal-ai/elevenlabs/speech-to-text': {
    input: zElevenlabsSpeechToTextInput,
    output: zElevenlabsSpeechToTextOutput,
  },
  'fal-ai/elevenlabs/speech-to-text/scribe-v2': {
    input: zElevenlabsSpeechToTextScribeV2Input,
    output: zElevenlabsSpeechToTextScribeV2Output,
  },
  'fal-ai/elevenlabs/text-to-dialogue/eleven-v3': {
    input: zElevenlabsTextToDialogueElevenV3Input,
    output: zElevenlabsTextToDialogueElevenV3Output,
  },
  'fal-ai/elevenlabs/tts/eleven-v3': {
    input: zElevenlabsTtsElevenV3Input,
    output: zElevenlabsTtsElevenV3Output,
  },
  'fal-ai/elevenlabs/tts/multilingual-v2': {
    input: zElevenlabsTtsMultilingualV2Input,
    output: zElevenlabsTtsMultilingualV2Output,
  },
  'fal-ai/elevenlabs/tts/turbo-v2.5': {
    input: zElevenlabsTtsTurboV25Input,
    output: zElevenlabsTtsTurboV25Output,
  },
  'fal-ai/elevenlabs/voice-changer': {
    input: zElevenlabsVoiceChangerInput,
    output: zElevenlabsVoiceChangerOutput,
  },
  'fal-ai/f5-tts': { input: zF5TtsInput, output: zF5TtsOutput },
  'fal-ai/ffmpeg-api/merge-audios': {
    input: zFfmpegApiMergeAudiosInput,
    output: zFfmpegApiMergeAudiosOutput,
  },
  'fal-ai/gemini-3.1-flash-tts': {
    input: zGemini31FlashTtsInput,
    output: zGemini31FlashTtsOutput,
  },
  'fal-ai/gemini-tts': { input: zGeminiTtsInput, output: zGeminiTtsOutput },
  'fal-ai/index-tts-2/text-to-speech': {
    input: zIndexTts2TextToSpeechInput,
    output: zIndexTts2TextToSpeechOutput,
  },
  'fal-ai/inworld-tts': { input: zInworldTtsInput, output: zInworldTtsOutput },
  'fal-ai/kling-video/create-voice': {
    input: zKlingVideoCreateVoiceInput,
    output: zKlingVideoCreateVoiceOutput,
  },
  'fal-ai/kling-video/v1/tts': {
    input: zKlingVideoV1TtsInput,
    output: zKlingVideoV1TtsOutput,
  },
  'fal-ai/kling-video/video-to-audio': {
    input: zKlingVideoVideoToAudioInput,
    output: zKlingVideoVideoToAudioOutput,
  },
  'fal-ai/kokoro/american-english': {
    input: zKokoroAmericanEnglishInput,
    output: zKokoroAmericanEnglishOutput,
  },
  'fal-ai/kokoro/brazilian-portuguese': {
    input: zKokoroBrazilianPortugueseInput,
    output: zKokoroBrazilianPortugueseOutput,
  },
  'fal-ai/kokoro/british-english': {
    input: zKokoroBritishEnglishInput,
    output: zKokoroBritishEnglishOutput,
  },
  'fal-ai/kokoro/french': {
    input: zKokoroFrenchInput,
    output: zKokoroFrenchOutput,
  },
  'fal-ai/kokoro/hindi': {
    input: zKokoroHindiInput,
    output: zKokoroHindiOutput,
  },
  'fal-ai/kokoro/italian': {
    input: zKokoroItalianInput,
    output: zKokoroItalianOutput,
  },
  'fal-ai/kokoro/japanese': {
    input: zKokoroJapaneseInput,
    output: zKokoroJapaneseOutput,
  },
  'fal-ai/kokoro/mandarin-chinese': {
    input: zKokoroMandarinChineseInput,
    output: zKokoroMandarinChineseOutput,
  },
  'fal-ai/kokoro/spanish': {
    input: zKokoroSpanishInput,
    output: zKokoroSpanishOutput,
  },
  'fal-ai/lyria2': { input: zLyria2Input, output: zLyria2Output },
  'fal-ai/lyria3': { input: zLyria3Input, output: zLyria3Output },
  'fal-ai/lyria3/pro': { input: zLyria3ProInput, output: zLyria3ProOutput },
  'fal-ai/maya': { input: zMayaInput, output: zMayaOutput },
  'fal-ai/maya/batch': { input: zMayaBatchInput, output: zMayaBatchOutput },
  'fal-ai/maya/stream': { input: zMayaStreamInput, output: zMayaStreamOutput },
  'fal-ai/minimax-music': {
    input: zMinimaxMusicInput,
    output: zMinimaxMusicOutput,
  },
  'fal-ai/minimax-music/v1.5': {
    input: zMinimaxMusicV15Input,
    output: zMinimaxMusicV15Output,
  },
  'fal-ai/minimax-music/v2': {
    input: zMinimaxMusicV2Input,
    output: zMinimaxMusicV2Output,
  },
  'fal-ai/minimax-music/v2.5': {
    input: zMinimaxMusicV25Input,
    output: zMinimaxMusicV25Output,
  },
  'fal-ai/minimax-music/v2.6': {
    input: zMinimaxMusicV26Input,
    output: zMinimaxMusicV26Output,
  },
  'fal-ai/minimax/preview/speech-2.5-hd': {
    input: zMinimaxPreviewSpeech25HdInput,
    output: zMinimaxPreviewSpeech25HdOutput,
  },
  'fal-ai/minimax/preview/speech-2.5-turbo': {
    input: zMinimaxPreviewSpeech25TurboInput,
    output: zMinimaxPreviewSpeech25TurboOutput,
  },
  'fal-ai/minimax/speech-02-hd': {
    input: zMinimaxSpeech02HdInput,
    output: zMinimaxSpeech02HdOutput,
  },
  'fal-ai/minimax/speech-02-turbo': {
    input: zMinimaxSpeech02TurboInput,
    output: zMinimaxSpeech02TurboOutput,
  },
  'fal-ai/minimax/speech-2.6-hd': {
    input: zMinimaxSpeech26HdInput,
    output: zMinimaxSpeech26HdOutput,
  },
  'fal-ai/minimax/speech-2.6-turbo': {
    input: zMinimaxSpeech26TurboInput,
    output: zMinimaxSpeech26TurboOutput,
  },
  'fal-ai/minimax/speech-2.8-hd': {
    input: zMinimaxSpeech28HdInput,
    output: zMinimaxSpeech28HdOutput,
  },
  'fal-ai/minimax/speech-2.8-turbo': {
    input: zMinimaxSpeech28TurboInput,
    output: zMinimaxSpeech28TurboOutput,
  },
  'fal-ai/minimax/voice-clone': {
    input: zMinimaxVoiceCloneInput,
    output: zMinimaxVoiceCloneOutput,
  },
  'fal-ai/minimax/voice-design': {
    input: zMinimaxVoiceDesignInput,
    output: zMinimaxVoiceDesignOutput,
  },
  'fal-ai/mmaudio-v2/text-to-audio': {
    input: zMmaudioV2TextToAudioInput,
    output: zMmaudioV2TextToAudioOutput,
  },
  'fal-ai/orpheus-tts': { input: zOrpheusTtsInput, output: zOrpheusTtsOutput },
  'fal-ai/qwen-3-tts/clone-voice/0.6b': {
    input: zQwen3TtsCloneVoice06bInput,
    output: zQwen3TtsCloneVoice06bOutput,
  },
  'fal-ai/qwen-3-tts/clone-voice/1.7b': {
    input: zQwen3TtsCloneVoice17bInput,
    output: zQwen3TtsCloneVoice17bOutput,
  },
  'fal-ai/qwen-3-tts/text-to-speech/0.6b': {
    input: zQwen3TtsTextToSpeech06bInput,
    output: zQwen3TtsTextToSpeech06bOutput,
  },
  'fal-ai/qwen-3-tts/text-to-speech/1.7b': {
    input: zQwen3TtsTextToSpeech17bInput,
    output: zQwen3TtsTextToSpeech17bOutput,
  },
  'fal-ai/qwen-3-tts/voice-design/1.7b': {
    input: zQwen3TtsVoiceDesign17bInput,
    output: zQwen3TtsVoiceDesign17bOutput,
  },
  'fal-ai/sam-audio/separate': {
    input: zSamAudioSeparateInput,
    output: zSamAudioSeparateOutput,
  },
  'fal-ai/sam-audio/span-separate': {
    input: zSamAudioSpanSeparateInput,
    output: zSamAudioSpanSeparateOutput,
  },
  'fal-ai/sam-audio/visual-separate': {
    input: zSamAudioVisualSeparateInput,
    output: zSamAudioVisualSeparateOutput,
  },
  'fal-ai/silero-vad': { input: zSileroVadInput, output: zSileroVadOutput },
  'fal-ai/smart-turn': { input: zSmartTurnInput, output: zSmartTurnOutput },
  'fal-ai/speech-to-text': {
    input: zSpeechToTextInput,
    output: zSpeechToTextOutput,
  },
  'fal-ai/speech-to-text/stream': {
    input: zSpeechToTextStreamInput,
    output: zSpeechToTextStreamOutput,
  },
  'fal-ai/speech-to-text/turbo': {
    input: zSpeechToTextTurboInput,
    output: zSpeechToTextTurboOutput,
  },
  'fal-ai/speech-to-text/turbo/stream': {
    input: zSpeechToTextTurboStreamInput,
    output: zSpeechToTextTurboStreamOutput,
  },
  'fal-ai/stable-audio': {
    input: zStableAudioInput,
    output: zStableAudioOutput,
  },
  'fal-ai/stable-audio-25/audio-to-audio': {
    input: zStableAudio25AudioToAudioInput,
    output: zStableAudio25AudioToAudioOutput,
  },
  'fal-ai/stable-audio-25/inpaint': {
    input: zStableAudio25InpaintInput,
    output: zStableAudio25InpaintOutput,
  },
  'fal-ai/stable-audio-25/text-to-audio': {
    input: zStableAudio25TextToAudioInput,
    output: zStableAudio25TextToAudioOutput,
  },
  'fal-ai/stable-audio-3/medium/audio-inpainting': {
    input: zStableAudio3MediumAudioInpaintingInput,
    output: zStableAudio3MediumAudioInpaintingOutput,
  },
  'fal-ai/stable-audio-3/medium/audio-outpainting': {
    input: zStableAudio3MediumAudioOutpaintingInput,
    output: zStableAudio3MediumAudioOutpaintingOutput,
  },
  'fal-ai/stable-audio-3/medium/audio-to-audio': {
    input: zStableAudio3MediumAudioToAudioInput,
    output: zStableAudio3MediumAudioToAudioOutput,
  },
  'fal-ai/stable-audio-3/medium/base/audio-inpainting': {
    input: zStableAudio3MediumBaseAudioInpaintingInput,
    output: zStableAudio3MediumBaseAudioInpaintingOutput,
  },
  'fal-ai/stable-audio-3/medium/base/audio-outpainting': {
    input: zStableAudio3MediumBaseAudioOutpaintingInput,
    output: zStableAudio3MediumBaseAudioOutpaintingOutput,
  },
  'fal-ai/stable-audio-3/medium/base/audio-to-audio': {
    input: zStableAudio3MediumBaseAudioToAudioInput,
    output: zStableAudio3MediumBaseAudioToAudioOutput,
  },
  'fal-ai/stable-audio-3/medium/base/text-to-audio': {
    input: zStableAudio3MediumBaseTextToAudioInput,
    output: zStableAudio3MediumBaseTextToAudioOutput,
  },
  'fal-ai/stable-audio-3/medium/text-to-audio': {
    input: zStableAudio3MediumTextToAudioInput,
    output: zStableAudio3MediumTextToAudioOutput,
  },
  'fal-ai/stable-audio-3/small/music/audio-inpainting': {
    input: zStableAudio3SmallMusicAudioInpaintingInput,
    output: zStableAudio3SmallMusicAudioInpaintingOutput,
  },
  'fal-ai/stable-audio-3/small/music/audio-outpainting': {
    input: zStableAudio3SmallMusicAudioOutpaintingInput,
    output: zStableAudio3SmallMusicAudioOutpaintingOutput,
  },
  'fal-ai/stable-audio-3/small/music/audio-to-audio': {
    input: zStableAudio3SmallMusicAudioToAudioInput,
    output: zStableAudio3SmallMusicAudioToAudioOutput,
  },
  'fal-ai/stable-audio-3/small/music/base/audio-inpainting': {
    input: zStableAudio3SmallMusicBaseAudioInpaintingInput,
    output: zStableAudio3SmallMusicBaseAudioInpaintingOutput,
  },
  'fal-ai/stable-audio-3/small/music/base/audio-outpainting': {
    input: zStableAudio3SmallMusicBaseAudioOutpaintingInput,
    output: zStableAudio3SmallMusicBaseAudioOutpaintingOutput,
  },
  'fal-ai/stable-audio-3/small/music/base/audio-to-audio': {
    input: zStableAudio3SmallMusicBaseAudioToAudioInput,
    output: zStableAudio3SmallMusicBaseAudioToAudioOutput,
  },
  'fal-ai/stable-audio-3/small/music/base/text-to-audio': {
    input: zStableAudio3SmallMusicBaseTextToAudioInput,
    output: zStableAudio3SmallMusicBaseTextToAudioOutput,
  },
  'fal-ai/stable-audio-3/small/music/text-to-audio': {
    input: zStableAudio3SmallMusicTextToAudioInput,
    output: zStableAudio3SmallMusicTextToAudioOutput,
  },
  'fal-ai/stable-audio-3/small/sfx/audio-inpainting': {
    input: zStableAudio3SmallSfxAudioInpaintingInput,
    output: zStableAudio3SmallSfxAudioInpaintingOutput,
  },
  'fal-ai/stable-audio-3/small/sfx/audio-outpainting': {
    input: zStableAudio3SmallSfxAudioOutpaintingInput,
    output: zStableAudio3SmallSfxAudioOutpaintingOutput,
  },
  'fal-ai/stable-audio-3/small/sfx/audio-to-audio': {
    input: zStableAudio3SmallSfxAudioToAudioInput,
    output: zStableAudio3SmallSfxAudioToAudioOutput,
  },
  'fal-ai/stable-audio-3/small/sfx/base/audio-inpainting': {
    input: zStableAudio3SmallSfxBaseAudioInpaintingInput,
    output: zStableAudio3SmallSfxBaseAudioInpaintingOutput,
  },
  'fal-ai/stable-audio-3/small/sfx/base/audio-outpainting': {
    input: zStableAudio3SmallSfxBaseAudioOutpaintingInput,
    output: zStableAudio3SmallSfxBaseAudioOutpaintingOutput,
  },
  'fal-ai/stable-audio-3/small/sfx/base/audio-to-audio': {
    input: zStableAudio3SmallSfxBaseAudioToAudioInput,
    output: zStableAudio3SmallSfxBaseAudioToAudioOutput,
  },
  'fal-ai/stable-audio-3/small/sfx/base/text-to-audio': {
    input: zStableAudio3SmallSfxBaseTextToAudioInput,
    output: zStableAudio3SmallSfxBaseTextToAudioOutput,
  },
  'fal-ai/stable-audio-3/small/sfx/text-to-audio': {
    input: zStableAudio3SmallSfxTextToAudioInput,
    output: zStableAudio3SmallSfxTextToAudioOutput,
  },
  'fal-ai/tada/1b/text-to-speech': {
    input: zTada1bTextToSpeechInput,
    output: zTada1bTextToSpeechOutput,
  },
  'fal-ai/tada/3b/text-to-speech': {
    input: zTada3bTextToSpeechInput,
    output: zTada3bTextToSpeechOutput,
  },
  'fal-ai/vibevoice': { input: zVibevoiceInput, output: zVibevoiceOutput },
  'fal-ai/vibevoice/0.5b': {
    input: zVibevoice05bInput,
    output: zVibevoice05bOutput,
  },
  'fal-ai/vibevoice/7b': {
    input: zVibevoice7bInput,
    output: zVibevoice7bOutput,
  },
  'fal-ai/wizper': { input: zWizperInput, output: zWizperOutput },
  'fal-ai/workflow-utilities/audio-compressor': {
    input: zWorkflowUtilitiesAudioCompressorInput,
    output: zWorkflowUtilitiesAudioCompressorOutput,
  },
  'fal-ai/workflow-utilities/impulse-response': {
    input: zWorkflowUtilitiesImpulseResponseInput,
    output: zWorkflowUtilitiesImpulseResponseOutput,
  },
  'fal-ai/zonos': { input: zZonosInput, output: zZonosOutput },
  'mirelo-ai/sfx-v1.5/video-to-audio': {
    input: zSfxV15VideoToAudioInput,
    output: zSfxV15VideoToAudioOutput,
  },
  'mirelo-ai/sfx-v1/video-to-audio': {
    input: zSfxV1VideoToAudioInput,
    output: zSfxV1VideoToAudioOutput,
  },
  'mirelo-ai/sfx1.6/extend-audio': {
    input: zSfx16ExtendAudioInput,
    output: zSfx16ExtendAudioOutput,
  },
  'mirelo-ai/sfx1.6/inpaint-audio': {
    input: zSfx16InpaintAudioInput,
    output: zSfx16InpaintAudioOutput,
  },
  'mirelo-ai/sfx1.6/text-to-audio': {
    input: zSfx16TextToAudioInput,
    output: zSfx16TextToAudioOutput,
  },
  'nvidia/nemotron-3-nano-omni/audio': {
    input: zNemotron3NanoOmniAudioInput,
    output: zNemotron3NanoOmniAudioOutput,
  },
  'nvidia/nemotron-asr-multilingual/asr': {
    input: zNemotronAsrMultilingualAsrInput,
    output: zNemotronAsrMultilingualAsrOutput,
  },
  'resemble-ai/chatterboxhd/speech-to-speech': {
    input: zChatterboxhdSpeechToSpeechInput,
    output: zChatterboxhdSpeechToSpeechOutput,
  },
  'resemble-ai/chatterboxhd/text-to-speech': {
    input: zChatterboxhdTextToSpeechInput,
    output: zChatterboxhdTextToSpeechOutput,
  },
  'sonilo/v1.1/text-to-music': {
    input: zV11TextToMusicInput,
    output: zV11TextToMusicOutput,
  },
  'sonilo/v1.1/video-to-music': {
    input: zV11VideoToMusicInput,
    output: zV11VideoToMusicOutput,
  },
  'xai/tts/v1': { input: zTtsV1Input, output: zTtsV1Output },
}

/** Union of valid fal-audio endpoint ids. */
export type FalAudioEndpointId = keyof typeof falAudioEndpointZodMap
