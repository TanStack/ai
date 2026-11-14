// The video calls of @google/genai 2.10.0 for the Gemini Developer API:
// `models.generateVideos` and `operations.getVideosOperation`. Loaded on the
// first video call, so the text adapters do not bundle it.
import { pick, rejectVertexOnly, tBytes } from './convert'
import type { WireObject } from './convert'
import type { GeminiPostV1BetaModelsModelsidPredictlongrunningBody } from '../generated/client/types'
import type {
  GenerateVideosOperation,
  GenerateVideosParameters,
  GeneratedVideo,
  Image,
  Video,
  VideoGenerationReferenceImage,
} from '@google/genai'

/** The fields of a video operation that the SDK fills. */
export type GeminiVideosOperation = Pick<
  GenerateVideosOperation,
  'name' | 'metadata' | 'done' | 'error' | 'response'
>

function imageToWire(image: Image) {
  rejectVertexOnly(image, ['gcsUri'])
  const to: WireObject = {}
  if (image.imageBytes != null) {
    to.bytesBase64Encoded = tBytes(image.imageBytes)
  }
  if (image.mimeType != null) to.mimeType = image.mimeType
  return to
}

function videoToWire(video: Video) {
  const to: WireObject = {}
  if (video.uri != null) to.uri = video.uri
  if (video.videoBytes != null) to.encodedVideo = tBytes(video.videoBytes)
  if (video.mimeType != null) to.encoding = video.mimeType
  return to
}

function referenceImageToWire(reference: VideoGenerationReferenceImage) {
  const to: WireObject = {}
  if (reference.image != null) to.image = imageToWire(reference.image)
  if (reference.referenceType != null) {
    to.referenceType = reference.referenceType
  }
  return to
}

// The Gemini API does not take video bytes when a URI is set.
function withoutVideoBytes(video: Video | undefined) {
  return video?.uri && video.videoBytes
    ? { uri: video.uri, mimeType: video.mimeType }
    : video
}

/** Port of the SDK `generateVideos` request for the Gemini Developer API. */
export function generateVideosToWire(params: GenerateVideosParameters) {
  if ((params.prompt || params.image || params.video) && params.source) {
    throw new Error(
      'Source and prompt/image/video are mutually exclusive. Please only use source.',
    )
  }
  const body: GeminiPostV1BetaModelsModelsidPredictlongrunningBody = {}
  const instance: WireObject = {}
  const parameters: WireObject = {}
  const inputs = [
    { ...params, video: withoutVideoBytes(params.video) },
    {
      ...params.source,
      video: withoutVideoBytes(params.source?.video),
    },
  ]
  for (const input of inputs) {
    if (input.prompt != null) instance.prompt = input.prompt
    if (input.image != null) instance.image = imageToWire(input.image)
    if (input.video != null) instance.video = videoToWire(input.video)
  }
  const { config } = params
  if (config != null) {
    rejectVertexOnly(config, [
      'outputGcsUri',
      'fps',
      'seed',
      'pubsubTopic',
      'generateAudio',
      'mask',
      'compressionQuality',
      'labels',
      'resizeMode',
    ])
    if (config.numberOfVideos != null) {
      parameters.sampleCount = config.numberOfVideos
    }
    Object.assign(
      parameters,
      pick(config, [
        'durationSeconds',
        'aspectRatio',
        'resolution',
        'personGeneration',
        'negativePrompt',
        'enhancePrompt',
      ]),
    )
    if (config.lastFrame != null) {
      instance.lastFrame = imageToWire(config.lastFrame)
    }
    if (config.referenceImages != null) {
      instance.referenceImages =
        config.referenceImages.map(referenceImageToWire)
    }
    if (config.webhookConfig != null) {
      // @ts-expect-error modelschemas gap: PredictLongRunningRequest has no webhookConfig, the SDK sends it to the Gemini API
      body.webhookConfig = config.webhookConfig
    }
  }
  if (Object.keys(instance).length > 0) body.instances = [instance]
  if (Object.keys(parameters).length > 0) body.parameters = parameters
  return body
}

type WireVideo = { uri?: string; encodedVideo?: string; encoding?: string }

/** The JSON of a video long-running operation. */
export type WireVideosOperation = Omit<GeminiVideosOperation, 'response'> & {
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: WireVideo }>
      raiMediaFilteredCount?: number
      raiMediaFilteredReasons?: Array<string>
    }
  }
}

function videoFromWire(video: WireVideo) {
  const to: Video = {}
  if (video.uri != null) to.uri = video.uri
  if (video.encodedVideo != null) to.videoBytes = tBytes(video.encodedVideo)
  if (video.encoding != null) to.mimeType = video.encoding
  return to
}

/** Port of `generateVideosOperationFromMldev`. */
export function videosOperationFromWire(json: WireVideosOperation) {
  const to: GeminiVideosOperation = pick(json, [
    'name',
    'metadata',
    'done',
    'error',
  ])
  const response = json.response?.generateVideoResponse
  if (response != null) {
    to.response = pick(response, [
      'raiMediaFilteredCount',
      'raiMediaFilteredReasons',
    ])
    if (response.generatedSamples != null) {
      to.response.generatedVideos = response.generatedSamples.map((sample) => {
        const video: GeneratedVideo = {}
        if (sample.video != null) video.video = videoFromWire(sample.video)
        return video
      })
    }
  }
  return to
}
