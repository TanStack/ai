// A small fetch client with the @google/genai `GoogleGenAI` methods that the
// adapters call. Same method names, arguments, and results. Vertex AI,
// Gemini Enterprise, Google auth (no API key), and a file path upload load
// the real SDK on first use.
import { sendWith } from '@tanstack/ai-utils/kubb'
import {
  geminiPostV1BetaModelsModelsidBatchembedcontents,
  geminiPostV1BetaModelsModelsidGeneratecontent,
  geminiPostV1BetaModelsModelsidPredictlongrunning,
  geminiPostV1BetaModelsModelsidStreamgeneratecontent,
  geminiPostV1BetaTunedmodelsTunedmodelsidGeneratecontent,
  geminiPostV1BetaTunedmodelsTunedmodelsidStreamgeneratecontent,
} from '../generated/client/sdk'
import {
  createApiClient,
  headerRecord,
  readSdkStream,
  usesVertexAI,
} from './api'
import {
  embedContentToWire,
  generateContentResponseFromWire,
  generateContentToWire,
  tFileName,
  tModel,
} from './convert'
import type { ClientInstance } from '@tanstack/ai-utils/kubb'
import type { ApiRequest } from './api'
import type { GeminiAuthTokenConfig } from './auth-tokens'
import type {
  GeminiContentResponse,
  WireContentResponse,
  WithHttpHeaders,
} from './convert'
import type { GeminiVideosOperation, WireVideosOperation } from './videos'
import type {
  GeminiInteraction,
  createInteractions,
  InteractionCreateParams,
  InteractionGetParams,
  InteractionRequestOptions,
  InteractionResult,
} from './interactions'
import type {
  AuthToken,
  DeleteFileParameters,
  DeleteFileResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  File as GeminiFile,
  GenerateContentParameters,
  GenerateVideosParameters,
  GetFileParameters,
  GoogleGenAI,
  GoogleGenAIOptions,
  UploadFileParameters,
} from '@google/genai'

export { ApiError } from './api'
export type { GeminiContentResponse } from './convert'
export type { GeminiInteraction } from './interactions'
export type { GeminiVideosOperation } from './videos'

/**
 * The `GoogleGenAI` methods that the Gemini adapters call.
 */
/* oxlint-disable typescript/method-signature-style -- method syntax keeps a
   real `GoogleGenAI` assignable to this type (method parameters are
   bivariant), for subclasses that set `client` to an SDK instance. */
export interface GeminiClient {
  readonly vertexai: boolean
  models: {
    generateContent(
      params: GenerateContentParameters,
    ): Promise<GeminiContentResponse>
    generateContentStream(
      params: GenerateContentParameters,
    ): Promise<AsyncGenerator<GeminiContentResponse>>
    embedContent(
      params: EmbedContentParameters,
    ): Promise<WithHttpHeaders<EmbedContentResponse>>
    generateVideos(
      params: GenerateVideosParameters,
    ): Promise<GeminiVideosOperation>
  }
  operations: {
    getVideosOperation(params: {
      operation: { name?: string }
      config?: { abortSignal?: AbortSignal }
    }): Promise<GeminiVideosOperation>
  }
  files: {
    upload(params: UploadFileParameters): Promise<GeminiFile>
    get(params: GetFileParameters): Promise<GeminiFile>
    delete(
      params: DeleteFileParameters,
    ): Promise<WithHttpHeaders<DeleteFileResponse>>
  }
  interactions: {
    create<P extends InteractionCreateParams>(
      params: P,
      options?: InteractionRequestOptions,
    ): Promise<InteractionResult<P>>
    get(
      id: string,
      params?: InteractionGetParams,
      options?: InteractionRequestOptions,
    ): Promise<GeminiInteraction>
  }
  authTokens: {
    create(params: { config?: GeminiAuthTokenConfig }): Promise<AuthToken>
  }
}
/* oxlint-enable typescript/method-signature-style */

// Creates the real SDK client on first use.
function lazySdk(options: GoogleGenAIOptions) {
  let sdk: Promise<GoogleGenAI> | undefined
  return () =>
    (sdk ??= import('@google/genai').then(
      ({ GoogleGenAI }) => new GoogleGenAI(options),
    ))
}

// Every call goes to the real SDK. Used for Vertex AI, Gemini Enterprise,
// and Google auth without an API key.
function createSdkClient(options: GoogleGenAIOptions, vertexai: boolean) {
  const load = lazySdk(options)
  const client: GeminiClient = {
    vertexai,
    models: {
      generateContent: async (params) =>
        (await load()).models.generateContent(params),
      generateContentStream: async (params) =>
        (await load()).models.generateContentStream(params),
      embedContent: async (params) =>
        (await load()).models.embedContent(params),
      generateVideos: async (params) =>
        (await load()).models.generateVideos(params),
    },
    operations: {
      getVideosOperation: async ({ operation, config }) => {
        const { GenerateVideosOperation } = await import('@google/genai')
        // The SDK calls `_fromAPIResponse` on the operation it gets.
        const sdkOperation = Object.assign(
          new GenerateVideosOperation(),
          operation,
        )
        return (await load()).operations.getVideosOperation({
          operation: sdkOperation,
          ...(config && { config }),
        })
      },
    },
    files: {
      upload: async (params) => (await load()).files.upload(params),
      get: async (params) => (await load()).files.get(params),
      delete: async (params) => (await load()).files.delete(params),
    },
    interactions: {
      create: async (params, requestOptions) => {
        const sdk = await load()
        const result = await sdk.interactions.create(params, requestOptions)
        // ponytail: the SDK overloads pick the result by `stream` too.
        return result as InteractionResult<typeof params>
      },
      get: async (id, params, requestOptions) =>
        (await load()).interactions.get(id, params, requestOptions),
    },
    authTokens: {
      create: async (params) => (await load()).authTokens.create(params),
    },
  }
  return client
}

function createFetchClient(
  options: GoogleGenAIOptions,
  apiKey: string,
  fetchFn: typeof fetch | undefined,
) {
  const api = createApiClient({ ...options, apiKey }, fetchFn)
  const load = lazySdk(options)
  // The text adapters call only `models.generateContent*`, so the other
  // calls load their code on first use. This keeps the text bundle small.
  let interactions: Promise<ReturnType<typeof createInteractions>> | undefined
  const loadInteractions = () =>
    (interactions ??= import('./interactions').then((module) =>
      module.createInteractions({ apiKey, httpOptions: api.httpOptions }),
    ))

  // A JSON request with the per-call `httpOptions` and `abortSignal` of an
  // SDK `config`.
  const send = (
    method: ApiRequest['method'],
    path: string,
    body: unknown,
    config?: Pick<ApiRequest, 'httpOptions' | 'abortSignal'>,
  ) =>
    api.request({
      path,
      method,
      ...(method !== 'GET' && { body: JSON.stringify(body) }),
      httpOptions: config?.httpOptions,
      abortSignal: config?.abortSignal,
    })

  type Config = Pick<ApiRequest, 'httpOptions' | 'abortSignal'> | undefined

  // A generated operation: Kubb builds the path and the JSON body, and
  // `api.request` sends it with the client headers, retries, and errors.
  const generated = async (
    operation: (http: ClientInstance) => Promise<{ response: Response }>,
    config: Config,
  ) => {
    const { response } = await operation(
      sendWith((built) =>
        api.request({
          // `api.request` adds the base URL and the API version (v1beta).
          path: built.path.replace(/^\/v1beta\//, ''),
          method: 'POST',
          ...(typeof built.body === 'string' && { body: built.body }),
          bodyHeaders: built.headers,
          httpOptions: config?.httpOptions,
          abortSignal: config?.abortSignal,
        }),
      ),
    )
    return response
  }

  // The model of a request that the OpenAPI document has, else undefined.
  // The document paths are fixed to /v1beta, so another API version keeps
  // the hand-written path. A nested name would not match the path template.
  const documentModel = (model: string, config: Config) => {
    const apiVersion =
      config?.httpOptions?.apiVersion ?? api.httpOptions.apiVersion
    if (apiVersion !== 'v1beta') return undefined
    const [, kind, id] =
      /^(models|tunedModels)\/([^/]+)$/.exec(tModel(model)) ?? []
    return kind && id ? { tuned: kind === 'tunedModels', id } : undefined
  }

  const generateContent = (
    params: GenerateContentParameters,
    method: 'generateContent' | 'streamGenerateContent',
  ) => {
    const body = generateContentToWire(params)
    const target = documentModel(params.model, params.config)
    // `api.request` adds `alt=sse` to a stream request on both paths.
    if (!target) {
      return send(
        'POST',
        `${tModel(params.model)}:${method}`,
        body,
        params.config,
      )
    }
    const { tuned, id } = target
    const stream = method === 'streamGenerateContent'
    return generated((http) => {
      if (tuned) {
        const path = { tunedModelsId: id }
        return stream
          ? geminiPostV1BetaTunedmodelsTunedmodelsidStreamgeneratecontent({
              client: http,
              path,
              body,
            })
          : geminiPostV1BetaTunedmodelsTunedmodelsidGeneratecontent({
              client: http,
              path,
              body,
            })
      }
      const path = { modelsId: id }
      return stream
        ? geminiPostV1BetaModelsModelsidStreamgeneratecontent({
            client: http,
            path,
            body,
          })
        : geminiPostV1BetaModelsModelsidGeneratecontent({
            client: http,
            path,
            body,
          })
    }, params.config)
  }

  const client: GeminiClient = {
    vertexai: false,
    models: {
      async generateContent(params) {
        const response = await generateContent(params, 'generateContent')
        const body: WireContentResponse = await response.json()
        return generateContentResponseFromWire({
          ...body,
          sdkHttpResponse: { headers: headerRecord(response) },
        })
      },
      async generateContentStream(params) {
        const response = await generateContent(params, 'streamGenerateContent')
        const headers = headerRecord(response)
        return (async function* () {
          for await (const chunk of readSdkStream(response)) {
            const body: WireContentResponse = chunk ?? {}
            yield generateContentResponseFromWire({
              ...body,
              sdkHttpResponse: { headers },
            })
          }
        })()
      },
      async embedContent(params) {
        const request = embedContentToWire(params)
        const target = documentModel(params.model, params.config)
        // The document has no tuned-model embed operation.
        const response =
          target && !target.tuned
            ? await generated(
                (http) =>
                  geminiPostV1BetaModelsModelsidBatchembedcontents({
                    client: http,
                    path: { modelsId: target.id },
                    body: request,
                  }),
                params.config,
              )
            : await send(
                'POST',
                `${tModel(params.model)}:batchEmbedContents`,
                request,
                params.config,
              )
        const body: EmbedContentResponse = await response.json()
        const result: WithHttpHeaders<EmbedContentResponse> = {
          sdkHttpResponse: { headers: headerRecord(response) },
        }
        if (body.embeddings != null) result.embeddings = body.embeddings
        if (body.metadata != null) result.metadata = body.metadata
        return result
      },
      async generateVideos(params) {
        const { generateVideosToWire, videosOperationFromWire } =
          await import('./videos')
        const request = generateVideosToWire(params)
        const target = documentModel(params.model, params.config)
        const response =
          target && !target.tuned
            ? await generated(
                (http) =>
                  geminiPostV1BetaModelsModelsidPredictlongrunning({
                    client: http,
                    path: { modelsId: target.id },
                    body: request,
                  }),
                params.config,
              )
            : await send(
                'POST',
                `${tModel(params.model)}:predictLongRunning`,
                request,
                params.config,
              )
        const body: WireVideosOperation = await response.json()
        return videosOperationFromWire(body)
      },
    },
    operations: {
      async getVideosOperation({ operation, config }) {
        if (operation.name === undefined || operation.name === '') {
          throw new Error('Operation name is required.')
        }
        const { videosOperationFromWire } = await import('./videos')
        const response = await send('GET', operation.name, {}, config)
        const body: WireVideosOperation = await response.json()
        return videosOperationFromWire(body)
      },
    },
    files: {
      async upload({ file, config }) {
        // A file path needs Node.js file access, so the SDK uploads it.
        if (typeof file === 'string') {
          return (await load()).files.upload({ file, config })
        }
        const { uploadBlob } = await import('./files')
        return uploadBlob(api, file, config)
      },
      async get({ name, config }) {
        const response = await send(
          'GET',
          `files/${tFileName(name)}`,
          {},
          config,
        )
        const body: GeminiFile = await response.json()
        return body
      },
      async delete({ name, config }) {
        const response = await send(
          'DELETE',
          `files/${tFileName(name)}`,
          {},
          config,
        )
        // The SDK reads the body and keeps only the response headers.
        await response.json()
        return { sdkHttpResponse: { headers: headerRecord(response) } }
      },
    },
    interactions: {
      create: async (params, requestOptions) =>
        (await loadInteractions()).create(params, requestOptions),
      get: async (id, params, requestOptions) =>
        (await loadInteractions()).get(id, params, requestOptions),
    },
    authTokens: {
      async create({ config }) {
        const { authTokenToWire } = await import('./auth-tokens')
        const response = await send(
          'POST',
          'auth_tokens',
          config ? authTokenToWire(config) : {},
          config,
        )
        const body: AuthToken = await response.json()
        return body
      },
    },
  }
  return client
}

/**
 * Creates a Gemini client with the `GoogleGenAI` methods that the adapters
 * call. With an API key it calls the Gemini Developer API through `fetch`.
 * With `vertexai` / `enterprise` (or the `GOOGLE_GENAI_USE_*` environment
 * variables), or without an API key, it loads `@google/genai` on first use and
 * sends every call through a real `GoogleGenAI`.
 *
 * @param options - The `GoogleGenAI` constructor options.
 * @param fetchFn - The `fetch` of the API key client. Defaults to the global
 * `fetch`.
 * @example
 * const client = createGoogleGenAI({ apiKey })
 * const result = await client.models.generateContent({ model, contents })
 */
export function createGoogleGenAI(
  options: GoogleGenAIOptions,
  fetchFn?: typeof fetch,
) {
  if ((options.project || options.location) && options.apiKey) {
    throw new Error(
      'Project/location and API key are mutually exclusive in the client initializer.',
    )
  }
  const vertexai = usesVertexAI(options)
  if (vertexai || !options.apiKey) return createSdkClient(options, vertexai)
  return createFetchClient(options, options.apiKey, fetchFn)
}
