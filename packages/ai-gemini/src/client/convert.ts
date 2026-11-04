// Request and response mapping for the Gemini Developer API. This is a port
// of the `*ToMldev` / `*FromMldev` converters and the `t*` helpers of
// @google/genai 2.10.0. Each converter copies only the fields that the SDK
// converter copies, renames the same fields, and throws the same error for a
// field that only Vertex AI supports.
import type {
  Candidate,
  Citation,
  Content,
  ContentListUnion,
  ContentUnion,
  EmbedContentParameters,
  GenerateContentConfig,
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleMaps,
  GoogleSearch,
  ImageConfig,
  Part,
  PartUnion,
  SafetySetting,
  SpeechConfig,
  SpeechConfigUnion,
  Tool,
  ToolConfig,
  ToolUnion,
} from '@google/genai'

/** A JSON object for the request body. */
export type WireObject = Record<string, unknown>

/**
 * The SDK sets `sdkHttpResponse` to `{ headers }` only, although its type
 * says `HttpResponse`.
 */
export type WithHttpHeaders<T> = Omit<T, 'sdkHttpResponse'> & {
  sdkHttpResponse?: { headers?: Record<string, string> }
}

/** The SDK response without its getters (`text`, `data`, ...). */
export type GeminiContentResponse = WithHttpHeaders<
  Omit<
    GenerateContentResponse,
    'text' | 'data' | 'functionCalls' | 'executableCode' | 'codeExecutionResult'
  >
>

// Copies each listed field that is not null or undefined, like the SDK
// `if (value != null) setValueByPath(...)` blocks.
export function pick<T extends object, K extends keyof T>(
  from: T,
  keys: ReadonlyArray<K>,
) {
  const to: Partial<Pick<T, K>> = {}
  for (const key of keys) {
    if (from[key] != null) to[key] = from[key]
  }
  return to
}

export function rejectVertexOnly<T extends object>(
  from: T,
  keys: ReadonlyArray<keyof T & string>,
) {
  for (const key of keys) {
    if (from[key] !== undefined) {
      throw new Error(
        `${key} parameter is only supported in Gemini Enterprise Agent Platform mode, not in Gemini Developer API mode.`,
      )
    }
  }
}

const isObject = (value: unknown): value is WireObject =>
  typeof value === 'object' && value !== null

export function tModel(model: string) {
  if (!model || typeof model !== 'string') {
    throw new Error('model is required and must be a string')
  }
  if (model.includes('..') || model.includes('?') || model.includes('&')) {
    throw new Error('invalid model parameter')
  }
  return model.startsWith('models/') || model.startsWith('tunedModels/')
    ? model
    : `models/${model}`
}

function tPart(origin: PartUnion | null | undefined): Part {
  if (origin === null || origin === undefined) {
    throw new Error('PartUnion is required')
  }
  if (typeof origin === 'object') return origin
  if (typeof origin === 'string') return { text: origin }
  throw new Error(`Unsupported part type: ${typeof origin}`)
}

function tParts(origin: PartUnion | Array<PartUnion> | null | undefined) {
  if (
    origin === null ||
    origin === undefined ||
    (Array.isArray(origin) && origin.length === 0)
  ) {
    throw new Error('PartListUnion is required')
  }
  return Array.isArray(origin) ? origin.map(tPart) : [tPart(origin)]
}

const isContent = (origin: unknown): origin is Content =>
  isObject(origin) && 'parts' in origin && Array.isArray(origin.parts)

const isFunctionPart = (origin: unknown) =>
  isObject(origin) && ('functionCall' in origin || 'functionResponse' in origin)

export function tContent(origin: ContentUnion | null | undefined): Content {
  if (origin === null || origin === undefined) {
    throw new Error('ContentUnion is required')
  }
  if (isContent(origin)) return origin
  return { role: 'user', parts: tParts(origin) }
}

export function tContents(origin: ContentListUnion | null | undefined) {
  if (
    origin === null ||
    origin === undefined ||
    (Array.isArray(origin) && origin.length === 0)
  ) {
    throw new Error('contents are required')
  }
  if (!Array.isArray(origin)) {
    if (isFunctionPart(origin)) {
      throw new Error(
        'To specify functionCall or functionResponse parts, please wrap them in a Content object, specifying the role for them',
      )
    }
    return [tContent(origin)]
  }
  const items: Array<ContentUnion> = origin
  const result: Array<Content> = []
  const parts: Array<PartUnion> = []
  const isContentArray = isContent(items[0])
  for (const item of items) {
    if (isContent(item) !== isContentArray) {
      throw new Error(
        'Mixing Content and Parts is not supported, please group the parts into a the appropriate Content objects and specify the roles for them',
      )
    }
    if (isContent(item)) {
      result.push(item)
    } else if (isFunctionPart(item)) {
      throw new Error(
        'To specify functionCall or functionResponse parts, please wrap them, and any other parts, in Content objects as appropriate, specifying the role for them',
      )
    } else {
      // A non-Content item of a ContentUnion array is a PartUnion.
      parts.push(...(Array.isArray(item) ? item : [item]))
    }
  }
  if (!isContentArray) result.push({ role: 'user', parts: tParts(parts) })
  return result
}

const SCHEMA_TYPES = [
  'TYPE_UNSPECIFIED',
  'STRING',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
  'NULL',
]

const toSchemaType = (type: string) =>
  SCHEMA_TYPES.includes(type.toUpperCase())
    ? type.toUpperCase()
    : 'TYPE_UNSPECIFIED'

// Port of the SDK `processJsonSchema`: JSON Schema to the Gemini `Schema`.
export function tSchema(input: unknown): WireObject {
  let schema = isObject(input) ? input : {}
  const result: WireObject = {}
  if (schema.type && schema.anyOf) {
    throw new Error('type and anyOf cannot be both populated.')
  }
  const incomingAnyOf = schema.anyOf
  if (Array.isArray(incomingAnyOf) && incomingAnyOf.length === 2) {
    const [first, second] = incomingAnyOf
    if (isObject(first) && first.type === 'null' && isObject(second)) {
      result.nullable = true
      schema = second
    } else if (isObject(second) && second.type === 'null' && isObject(first)) {
      result.nullable = true
      schema = first
    }
  }
  if (Array.isArray(schema.type)) {
    const types: Array<string> = schema.type
    if (types.includes('null')) result.nullable = true
    const rest = types.filter((type) => type !== 'null')
    if (rest.length === 1) result.type = toSchemaType(rest[0] ?? '')
    else result.anyOf = rest.map((type) => ({ type: toSchemaType(type) }))
  }
  for (const [name, value] of Object.entries(schema)) {
    if (value == null) continue
    if (name === 'type') {
      if (value === 'null') {
        throw new Error(
          'type: null can not be the only possible type for the field.',
        )
      }
      if (Array.isArray(value)) continue
      result.type = toSchemaType(String(value))
    } else if (name === 'items') {
      result.items = tSchema(value)
    } else if (name === 'anyOf') {
      const list: Array<WireObject> = []
      for (const item of Array.isArray(value) ? value : []) {
        if (isObject(item) && item.type === 'null') {
          result.nullable = true
          continue
        }
        list.push(tSchema(item))
      }
      result.anyOf = list
    } else if (name === 'properties') {
      result.properties = Object.fromEntries(
        Object.entries(isObject(value) ? value : {}).map(([key, item]) => [
          key,
          tSchema(item),
        ]),
      )
    } else if (name !== 'additionalProperties') {
      result[name] = value
    }
  }
  return result
}

function tSpeechConfig(speechConfig: SpeechConfigUnion): SpeechConfig {
  if (typeof speechConfig === 'object') return speechConfig
  if (typeof speechConfig === 'string') {
    return { voiceConfig: { prebuiltVoiceConfig: { voiceName: speechConfig } } }
  }
  throw new Error(`Unsupported speechConfig type: ${typeof speechConfig}`)
}

const hasJsonSchemaKey = (value: unknown) =>
  isObject(value) && Object.keys(value).includes('$schema')

// Port of `tTool`. The SDK changes the caller's tool in place; this returns
// a copy instead.
function tTool(tool: Tool): Tool {
  if (!tool.functionDeclarations) return tool
  return {
    ...tool,
    functionDeclarations: tool.functionDeclarations.map((input) => {
      const declaration = { ...input }
      if (declaration.parameters) {
        if (!hasJsonSchemaKey(declaration.parameters)) {
          declaration.parameters = tSchema(declaration.parameters)
        } else if (!declaration.parametersJsonSchema) {
          declaration.parametersJsonSchema = declaration.parameters
          delete declaration.parameters
        }
      }
      if (declaration.response) {
        if (!hasJsonSchemaKey(declaration.response)) {
          declaration.response = tSchema(declaration.response)
        } else if (!declaration.responseJsonSchema) {
          declaration.responseJsonSchema = declaration.response
          delete declaration.response
        }
      }
      return declaration
    }),
  }
}

function tTools(tools: ReadonlyArray<ToolUnion> | null | undefined) {
  if (tools === undefined || tools === null) {
    throw new Error('tools is required')
  }
  if (!Array.isArray(tools)) {
    throw new Error('tools is required and must be an array of Tools')
  }
  return tools.map((tool) => {
    // ponytail: the SDK resolves CallableTool (MCP) objects first. No adapter
    // sends one, so fail loudly instead of sending an empty tool.
    if ('callTool' in tool) {
      throw new Error(
        'CallableTool (MCP) tools are not supported by the Gemini adapter.',
      )
    }
    return tool
  })
}

function tCachedContentName(name: unknown) {
  if (typeof name !== 'string') throw new Error('name must be a string')
  const needsPrefix =
    !name.startsWith('cachedContents/') && name.split('/').length === 1
  return needsPrefix ? `cachedContents/${name}` : name
}

/** Port of `tFileName` for a string name. */
export function tFileName(name: string) {
  if (name.startsWith('https://')) {
    const match = (name.split('files/')[1] ?? '').match(/[a-z0-9]+/)
    if (match === null) {
      throw new Error(`Could not extract file name from URI ${name}`)
    }
    return match[0]
  }
  return name.startsWith('files/') ? name.split('files/')[1] : name
}

export function tBytes(bytes: unknown) {
  if (typeof bytes !== 'string') {
    throw new Error('fromImageBytes must be a string')
  }
  return bytes
}

function partToWire(part: Part) {
  const to: WireObject = pick(part, [
    'mediaResolution',
    'codeExecutionResult',
    'executableCode',
    'fileData',
    'functionCall',
    'functionResponse',
    'inlineData',
    'text',
    'thought',
    'thoughtSignature',
    'videoMetadata',
    'toolCall',
    'toolResponse',
    'partMetadata',
  ])
  if (part.fileData != null) {
    rejectVertexOnly(part.fileData, ['displayName'])
    to.fileData = pick(part.fileData, ['fileUri', 'mimeType'])
  }
  if (part.functionCall != null) {
    rejectVertexOnly(part.functionCall, ['partialArgs', 'willContinue'])
    to.functionCall = pick(part.functionCall, ['id', 'args', 'name'])
  }
  if (part.inlineData != null) {
    rejectVertexOnly(part.inlineData, ['displayName'])
    to.inlineData = pick(part.inlineData, ['data', 'mimeType'])
  }
  return to
}

export function contentToWire(content: Content) {
  const to: WireObject = {}
  if (content.parts != null) to.parts = content.parts.map(partToWire)
  if (content.role != null) to.role = content.role
  return to
}

export function safetySettingToWire(setting: SafetySetting) {
  rejectVertexOnly(setting, ['method'])
  return pick(setting, ['category', 'threshold'])
}

function googleSearchToWire(search: GoogleSearch) {
  rejectVertexOnly(search, ['blockingConfidence', 'excludeDomains'])
  return pick(search, ['searchTypes', 'timeRangeFilter'])
}

function googleMapsToWire(maps: GoogleMaps) {
  const to: WireObject = pick(maps, ['authConfig', 'enableWidget'])
  if (maps.authConfig != null) {
    rejectVertexOnly(maps.authConfig, [
      'apiKeyConfig',
      'authType',
      'googleServiceAccountConfig',
      'httpBasicAuthConfig',
      'oauthConfig',
      'oidcConfig',
    ])
    to.authConfig = pick(maps.authConfig, ['apiKey'])
  }
  return to
}

function toolToWire(tool: Tool) {
  rejectVertexOnly(tool, [
    'retrieval',
    'enterpriseWebSearch',
    'parallelAiSearch',
  ])
  const to: WireObject = pick(tool, [
    'computerUse',
    'fileSearch',
    'googleSearch',
    'googleMaps',
    'codeExecution',
    'functionDeclarations',
    'googleSearchRetrieval',
    'urlContext',
    'mcpServers',
  ])
  if (tool.googleSearch != null) {
    to.googleSearch = googleSearchToWire(tool.googleSearch)
  }
  if (tool.googleMaps != null) to.googleMaps = googleMapsToWire(tool.googleMaps)
  return to
}

export const toolsToWire = (tools: ReadonlyArray<ToolUnion>) =>
  tTools(tools).map((tool) => toolToWire(tTool(tool)))

function toolConfigToWire(toolConfig: ToolConfig) {
  const to: WireObject = pick(toolConfig, [
    'retrievalConfig',
    'functionCallingConfig',
    'includeServerSideToolInvocations',
  ])
  const { functionCallingConfig } = toolConfig
  if (functionCallingConfig != null) {
    rejectVertexOnly(functionCallingConfig, ['streamFunctionCallArguments'])
    to.functionCallingConfig = pick(functionCallingConfig, [
      'allowedFunctionNames',
      'mode',
    ])
  }
  return to
}

function imageConfigToWire(imageConfig: ImageConfig) {
  rejectVertexOnly(imageConfig, [
    'personGeneration',
    'prominentPeople',
    'outputMimeType',
    'outputCompressionQuality',
    'imageOutputOptions',
  ])
  return pick(imageConfig, ['aspectRatio', 'imageSize'])
}

// Port of `maybeMoveToResponseJsonSchema`, without changing the caller's
// config.
function moveJsonSchema(config: GenerateContentConfig) {
  const isJsonSchema =
    config.responseSchema &&
    !config.responseJsonSchema &&
    hasJsonSchemaKey(config.responseSchema)
  if (!isJsonSchema) return config
  const { responseSchema, ...rest } = config
  return { ...rest, responseJsonSchema: responseSchema }
}

function generateContentConfigToWire(
  input: GenerateContentConfig,
  body: WireObject,
) {
  const config = moveJsonSchema(input)
  rejectVertexOnly(config, [
    'routingConfig',
    'modelSelectionConfig',
    'labels',
    'audioTimestamp',
    'modelArmorConfig',
  ])
  if (config.systemInstruction != null) {
    body.systemInstruction = contentToWire(tContent(config.systemInstruction))
  }
  if (config.safetySettings != null) {
    body.safetySettings = config.safetySettings.map(safetySettingToWire)
  }
  if (config.tools != null) body.tools = toolsToWire(config.tools)
  if (config.toolConfig != null) {
    body.toolConfig = toolConfigToWire(config.toolConfig)
  }
  if (config.cachedContent != null) {
    body.cachedContent = tCachedContentName(config.cachedContent)
  }
  if (config.serviceTier != null) body.serviceTier = config.serviceTier
  const generationConfig: WireObject = pick(config, [
    'temperature',
    'topP',
    'topK',
    'candidateCount',
    'maxOutputTokens',
    'stopSequences',
    'responseLogprobs',
    'logprobs',
    'presencePenalty',
    'frequencyPenalty',
    'seed',
    'responseMimeType',
    'responseSchema',
    'responseJsonSchema',
    'responseModalities',
    'mediaResolution',
    'speechConfig',
    'thinkingConfig',
    'imageConfig',
    'enableEnhancedCivicAnswers',
  ])
  if (config.responseSchema != null) {
    generationConfig.responseSchema = tSchema(config.responseSchema)
  }
  if (config.speechConfig != null) {
    generationConfig.speechConfig = tSpeechConfig(config.speechConfig)
  }
  if (config.imageConfig != null) {
    generationConfig.imageConfig = imageConfigToWire(config.imageConfig)
  }
  return generationConfig
}

/** Port of `generateContentParametersToMldev`, without the `_url` part. */
export function generateContentToWire(params: GenerateContentParameters) {
  const body: WireObject = {}
  if (params.contents != null) {
    body.contents = tContents(params.contents).map(contentToWire)
  }
  if (params.config != null) {
    body.generationConfig = generateContentConfigToWire(params.config, body)
  }
  return body
}

type WireCandidate = Omit<Candidate, 'citationMetadata'> & {
  citationMetadata?: { citationSources?: Array<Citation> }
}

/** The JSON of a `generateContent` response. */
export type WireContentResponse = Omit<GeminiContentResponse, 'candidates'> & {
  candidates?: Array<WireCandidate>
}

function candidateFromWire(candidate: WireCandidate) {
  const to: Candidate = pick(candidate, [
    'content',
    'tokenCount',
    'finishReason',
    'groundingMetadata',
    'avgLogprobs',
    'index',
    'logprobsResult',
    'safetyRatings',
    'urlContextMetadata',
  ])
  const citations = candidate.citationMetadata
  if (citations != null) {
    to.citationMetadata = pick({ citations: citations.citationSources }, [
      'citations',
    ])
  }
  return to
}

/** Port of `generateContentResponseFromMldev`. */
export function generateContentResponseFromWire(
  json: WireContentResponse,
): GeminiContentResponse {
  const to: GeminiContentResponse = pick(json, [
    'sdkHttpResponse',
    'modelVersion',
    'promptFeedback',
    'responseId',
    'usageMetadata',
    'modelStatus',
  ])
  if (json.candidates != null) {
    to.candidates = json.candidates.map(candidateFromWire)
  }
  return to
}

function tContentsForEmbed(origin: ContentListUnion | undefined) {
  if (!origin) return []
  // A ContentListUnion array holds ContentUnion items.
  const items: Array<ContentUnion> = Array.isArray(origin) ? origin : [origin]
  return items.map(tContent)
}

/** Port of the SDK `embedContent` request for the Gemini Developer API. */
export function embedContentToWire(params: EmbedContentParameters) {
  const model = tModel(params.model)
  // The SDK groups every input of a gemini-embedding-2 model into one content.
  const contents = params.model.includes('gemini-embedding-2')
    ? tContents(params.contents)
    : params.contents
  const config = params.config ?? {}
  rejectVertexOnly(config, [
    'mimeType',
    'autoTruncate',
    'documentOcr',
    'audioTrackExtraction',
  ])
  const fields = pick(config, ['taskType', 'title', 'outputDimensionality'])
  return {
    requests: tContentsForEmbed(contents).map((content) => ({
      content,
      ...fields,
      model,
    })),
  }
}
