import { BaseTTSAdapter } from '@tanstack/ai/adapters'
import {
  createGeminiClient,
  generateId,
  getGeminiApiKeyFromEnv,
} from '../utils'
import { GEMINI_TTS_VOICES } from '../model-meta'
import { buildGeminiUsage } from '../usage'
import type { GEMINI_TTS_MODELS, GeminiTTSVoice } from '../model-meta'
import type { TTSOptions, TTSResult } from '@tanstack/ai'
import type {
  GenerateContentResponse,
  GoogleGenAI,
  SpeechConfig,
} from '@google/genai'
import type { GeminiClientConfig } from '../utils/client'

export interface GeminiSpeakerVoiceConfig {
  /** A name used in the prompt to refer to this speaker */
  speaker: string
  /** Voice configuration for this speaker */
  voiceConfig: {
    prebuiltVoiceConfig: {
      voiceName: GeminiTTSVoice
    }
  }
}

export interface GeminiTTSProviderOptions {
  voiceConfig?: {
    prebuiltVoiceConfig?: {
      voiceName?: GeminiTTSVoice
    }
  }

  multiSpeakerVoiceConfig?: {
    speakerVoiceConfigs: Array<GeminiSpeakerVoiceConfig>
  }

  systemInstruction?: string

  languageCode?: string
}

export interface GeminiTTSConfig extends GeminiClientConfig {}

/** Model type for Gemini TTS */
export type GeminiTTSModel = (typeof GEMINI_TTS_MODELS)[number]

export class GeminiTTSAdapter<
  TModel extends GeminiTTSModel,
> extends BaseTTSAdapter<TModel, GeminiTTSProviderOptions> {
  readonly name = 'gemini' as const

  private readonly client: GoogleGenAI

  constructor(config: GeminiTTSConfig, model: TModel) {
    super(model, config)
    this.client = createGeminiClient(config)
  }

  async generateSpeech(
    options: TTSOptions<GeminiTTSProviderOptions>,
  ): Promise<TTSResult> {
    const { model, text, modelOptions, voice, logger } = options

    logger.request(`activity=generateSpeech provider=gemini model=${model}`, {
      provider: 'gemini',
      model,
    })

    const speechConfig = buildSpeechConfig(modelOptions, voice)

    try {
      const response = await this.client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig,
          ...(modelOptions?.systemInstruction && {
            systemInstruction: modelOptions.systemInstruction,
          }),
        },
      })

      return speechResultFromResponse(response, this.name, model)
    } catch (error) {
      logger.errors('gemini.generateSpeech fatal', {
        error,
        source: 'gemini.generateSpeech',
      })
      throw error
    }
  }
}

function buildSpeechConfig(
  modelOptions: GeminiTTSProviderOptions | undefined,
  voice: string | undefined,
): SpeechConfig {
  const speechConfig: SpeechConfig = {}

  if (modelOptions?.multiSpeakerVoiceConfig) {
    const speakerConfigs =
      modelOptions.multiSpeakerVoiceConfig.speakerVoiceConfigs
    if (
      !Array.isArray(speakerConfigs) ||
      speakerConfigs.length < 1 ||
      speakerConfigs.length > 2
    ) {
      throw new Error(
        `Gemini TTS multiSpeakerVoiceConfig.speakerVoiceConfigs must contain 1 or 2 speakers; received ${Array.isArray(speakerConfigs) ? speakerConfigs.length : 'non-array'}.`,
      )
    }
    speechConfig.multiSpeakerVoiceConfig = modelOptions.multiSpeakerVoiceConfig
  } else {
    if (
      voice !== undefined &&
      !(GEMINI_TTS_VOICES as ReadonlyArray<string>).includes(voice)
    ) {
      throw new Error(
        `Invalid Gemini TTS voice "${voice}". Valid voices are: ${GEMINI_TTS_VOICES.join(', ')}.`,
      )
    }
    const defaultVoiceName = (voice as GeminiTTSVoice | undefined) ?? 'Kore'
    const supplied = modelOptions?.voiceConfig
    const resolvedVoiceName =
      supplied?.prebuiltVoiceConfig?.voiceName ?? defaultVoiceName
    speechConfig.voiceConfig = {
      prebuiltVoiceConfig: { voiceName: resolvedVoiceName },
    }
  }

  if (modelOptions?.languageCode) {
    speechConfig.languageCode = modelOptions.languageCode
  }

  return speechConfig
}

function speechResultFromResponse(
  response: GenerateContentResponse,
  adapterName: string,
  model: string,
): TTSResult {
  const parts = response.candidates?.[0]?.content?.parts

  if (!parts) {
    throw new Error('No audio output received from Gemini TTS')
  }
  if (parts.length === 0) {
    throw new Error('No audio output received from Gemini TTS')
  }

  const audioPart = parts.find((part: any) =>
    part.inlineData?.mimeType?.startsWith('audio/'),
  )

  if (!audioPart) {
    throw new Error('No audio data in Gemini TTS response')
  }
  if (!audioPart.inlineData) {
    throw new Error('No audio data in Gemini TTS response')
  }
  if (!audioPart.inlineData.data) {
    throw new Error('No audio data in Gemini TTS response')
  }

  const audioBase64 = audioPart.inlineData.data
  const mimeType = audioPart.inlineData.mimeType as string
  const usageField = response.usageMetadata
    ? { usage: buildGeminiUsage(response.usageMetadata) }
    : {}

  const pcm = parsePcmMimeType(mimeType)
  if (pcm) {
    const wavBase64 = wrapPcmBase64AsWav(
      audioBase64,
      pcm.sampleRate,
      pcm.channels,
      pcm.bitsPerSample,
    )
    return {
      id: generateId(adapterName),
      model,
      audio: wavBase64,
      format: 'wav',
      contentType: 'audio/wav',
      ...usageField,
    }
  }

  const format = (mimeType.split(';')[0] ?? '').split('/')[1] || 'wav'

  return {
    id: generateId(adapterName),
    model,
    audio: audioBase64,
    format,
    contentType: mimeType,
    ...usageField,
  }
}

function parsePcmMimeType(
  mimeType: string,
): { sampleRate: number; channels: number; bitsPerSample: number } | undefined {
  const normalized = mimeType.toLowerCase()
  const subtype = (normalized.split(';')[0] ?? '').split('/')[1] ?? ''
  // Exclude containerized wav (e.g. `audio/wav;codec=pcm`) — those already
  // carry a RIFF header and must not be re-wrapped.
  if (subtype.includes('wav')) return undefined

  const bitDepthMatch = /^audio\/l(\d+)/.exec(normalized)
  const isPcm =
    bitDepthMatch !== null ||
    normalized.startsWith('audio/pcm') ||
    normalized.startsWith('audio/x-pcm') ||
    normalized.includes('codec=pcm')
  if (!isPcm) return undefined

  const rateMatch = /rate=(\d+)/.exec(normalized)
  const channelsMatch = /channels=(\d+)/.exec(normalized)
  // Default to 16-bit when the mime type doesn't specify — matches Gemini's
  // audio/L16;codec=pcm;rate=24000 response.
  const bitsPerSample = bitDepthMatch ? Number(bitDepthMatch[1]) : 16
  return {
    sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
    channels: channelsMatch ? Number(channelsMatch[1]) : 1,
    bitsPerSample,
  }
}

function wrapPcmBase64AsWav(
  pcmBase64: string,
  sampleRate: number,
  channels = 1,
  bitsPerSample = 16,
): string {
  if (bitsPerSample !== 16) {
    throw new Error(
      `Unsupported PCM bit depth ${bitsPerSample}: only 16-bit PCM can be wrapped as WAV.`,
    )
  }

  const pcmBytes =
    typeof Buffer !== 'undefined'
      ? new Uint8Array(Buffer.from(pcmBase64, 'base64'))
      : decodeBase64(pcmBase64)

  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcmBytes.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  new Uint8Array(buffer, 44).set(pcmBytes)

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64')
  }
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function decodeBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i))
  }
}

export function createGeminiSpeech<TModel extends GeminiTTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiTTSConfig, 'apiKey'>,
): GeminiTTSAdapter<TModel> {
  // Put apiKey LAST so caller-supplied config can't silently override the
  // explicit argument.
  return new GeminiTTSAdapter({ ...config, apiKey }, model)
}

export function geminiSpeech<TModel extends GeminiTTSModel>(
  model: TModel,
  config?: Omit<GeminiTTSConfig, 'apiKey'>,
): GeminiTTSAdapter<TModel> {
  const apiKey = getGeminiApiKeyFromEnv()
  return createGeminiSpeech(model, apiKey, config)
}
