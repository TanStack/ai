import { openrouterPostVideos } from '../generated/client/sdk'
import { callGenerated, createCaller, readJSON } from './http'
import { toWire } from './remap'
import {
  OBJECTS,
  VideoGenerationRequest,
  VideoGenerationResponse,
} from './tables/video'
import type { Exchange, OpenRouterClientOptions } from './http'
import type { OpenRouterClient } from './types'
import type { VideoGenerationResponse as VideoGenerationResponseModel } from '@openrouter/sdk/models'

/** The wire JSON of a video job, renamed by the SDK tables. */
async function readJob(exchange: Exchange) {
  const job = await readJSON(exchange, VideoGenerationResponse, OBJECTS)
  return job as VideoGenerationResponseModel
}

/**
 * The SDK `videoGeneration` methods over fetch: the generated `POST /videos`,
 * and the hand-written `GET /videos/{jobId}` and `GET /videos/{jobId}/content`
 * (the OpenAPI document does not have them).
 *
 * @example
 * const { videoGeneration } = createOpenRouterVideoClient({ apiKey: 'sk-or-...' })
 * const job = await videoGeneration.generate({ videoGenerationRequest: { model, prompt } })
 */
export function createOpenRouterVideoClient(config: OpenRouterClientOptions) {
  const call = createCaller(config)
  const client: Pick<OpenRouterClient, 'videoGeneration'> = {
    videoGeneration: {
      async generate(request, requestOptions) {
        const body = toWire(
          request.videoGenerationRequest,
          VideoGenerationRequest,
          OBJECTS,
        )
        const exchange = await callGenerated(
          call,
          (http) =>
            openrouterPostVideos({
              client: http,
              body: {
                ...body,
                // @ts-expect-error modelschemas gap: Videos `model` is a closed enum of known slugs, the API takes any model id
                model: body.model,
              },
            }),
          {
            method: 'POST',
            accept: 'application/json',
            headers: request,
            okStatus: 202,
            okTypes: ['application/json'],
            errorStatuses: [400, 401, 402, 404, 429, 500],
          },
          requestOptions,
        )
        return readJob(exchange)
      },
      async getGeneration(request, requestOptions) {
        const exchange = await call(
          {
            method: 'GET',
            path: `videos/${encodeURIComponent(request.jobId)}`,
            accept: 'application/json',
            headers: request,
            okStatus: 200,
            okTypes: ['application/json'],
            errorStatuses: [401, 404, 500],
          },
          requestOptions,
        )
        return readJob(exchange)
      },
      async getVideoContent(request, requestOptions) {
        // The SDK sends `index=0` when it is not set, and no index for `null`.
        const index = request.index === null ? undefined : (request.index ?? 0)
        const { response } = await call(
          {
            method: 'GET',
            path: `videos/${encodeURIComponent(request.jobId)}/content`,
            ...(index !== undefined && { query: `index=${index}` }),
            accept: 'video/mp4',
            headers: request,
            okStatus: 200,
            okTypes: ['video/mp4'],
            errorStatuses: [400, 401, 404, 500, 502],
          },
          requestOptions,
        )
        if (!response.body) throw new Error('OpenRouter sent no video body')
        return response.body
      },
    },
  }
  return client
}
