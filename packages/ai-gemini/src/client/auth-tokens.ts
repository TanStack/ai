// The `authTokens.create` body of @google/genai 2.10.0 for the Gemini
// Developer API, with the Live API setup it locks. Loaded on the first
// token call, so the text adapters do not bundle it.
import {
  contentToWire,
  pick,
  rejectVertexOnly,
  safetySettingToWire,
  tContent,
  tModel,
  toolsToWire,
} from './convert'
import type { WireObject } from './convert'
import type {
  AudioTranscriptionConfig,
  CreateAuthTokenConfig,
  LiveConnectConfig,
  LiveConnectConstraints,
  SpeechConfig,
} from '@google/genai'

function tLiveSpeechConfig(speechConfig: SpeechConfig) {
  if ('multiSpeakerVoiceConfig' in speechConfig) {
    throw new Error('multiSpeakerVoiceConfig is not supported in the live API.')
  }
  return speechConfig
}

function transcriptionToWire(config: AudioTranscriptionConfig) {
  rejectVertexOnly(config, ['languageCodes'])
  return pick(config, ['languageAuto', 'languageHints', 'adaptationPhrases'])
}

function liveConnectConfigToWire(config: LiveConnectConfig, setup: WireObject) {
  rejectVertexOnly(config, ['explicitVadSignal'])
  const generationConfig: WireObject = {
    ...config.generationConfig,
    ...pick(config, [
      'responseModalities',
      'temperature',
      'topP',
      'topK',
      'maxOutputTokens',
      'mediaResolution',
      'seed',
      'speechConfig',
      'thinkingConfig',
      'enableAffectiveDialog',
      'translationConfig',
    ]),
  }
  if (config.speechConfig != null) {
    generationConfig.speechConfig = tLiveSpeechConfig(config.speechConfig)
  }
  if (config.generationConfig != null || Object.keys(generationConfig).length) {
    setup.generationConfig = generationConfig
  }
  if (config.systemInstruction != null) {
    setup.systemInstruction = contentToWire(tContent(config.systemInstruction))
  }
  if (config.tools != null) setup.tools = toolsToWire(config.tools)
  if (config.sessionResumption != null) {
    rejectVertexOnly(config.sessionResumption, ['transparent'])
    setup.sessionResumption = pick(config.sessionResumption, ['handle'])
  }
  if (config.inputAudioTranscription != null) {
    setup.inputAudioTranscription = transcriptionToWire(
      config.inputAudioTranscription,
    )
  }
  if (config.outputAudioTranscription != null) {
    setup.outputAudioTranscription = transcriptionToWire(
      config.outputAudioTranscription,
    )
  }
  Object.assign(
    setup,
    pick(config, [
      'realtimeInputConfig',
      'contextWindowCompression',
      'proactivity',
      'avatarConfig',
    ]),
  )
  if (config.safetySettings != null) {
    setup.safetySettings = config.safetySettings.map(safetySettingToWire)
  }
}

function liveConnectConstraintsToWire(constraints: LiveConnectConstraints) {
  const setup: WireObject = {}
  if (constraints.model != null) setup.model = tModel(constraints.model)
  if (constraints.config != null) {
    liveConnectConfigToWire(constraints.config, setup)
  }
  return setup
}

/**
 * The `authTokens.create` config this client supports. `lockAdditionalFields`
 * (a field mask) is left out because no adapter sends it.
 */
export type GeminiAuthTokenConfig = Omit<
  CreateAuthTokenConfig,
  'lockAdditionalFields'
>

/** Port of the SDK `authTokens.create` body for the Gemini Developer API. */
export function authTokenToWire(config: GeminiAuthTokenConfig) {
  const body: WireObject = pick(config, [
    'expireTime',
    'newSessionExpireTime',
    'uses',
  ])
  if (config.liveConnectConstraints != null) {
    const setup = liveConnectConstraintsToWire(config.liveConnectConstraints)
    // The SDK drops a setup that has no fields.
    if (Object.keys(setup).length > 0) body.bidiGenerateContentSetup = setup
  }
  return body
}
